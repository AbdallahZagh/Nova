using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using NovaTaskflow.Api;
using NovaTaskflow.Controls;
using System.Globalization;
using System.Text.Json;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow
{
    private string subscriptionFilter = "All";
    private readonly HashSet<string> renewingSubscriptions = new(StringComparer.Ordinal);
    private static readonly string[] SubscriptionStatuses = ["Active", "Trial", "Paused", "Canceled"];
    private Task OpenSubscriptions(string filter)
    {
        subscriptionFilter = filter;
        return Go("Subscriptions", refresh: true);
    }

    private static string ChargeTiming(JsonElement item)
    {
        var status = item.Text("status").ToUpperInvariant();
        if (status is "PAUSED" or "CANCELED") return status == "PAUSED" ? "Paused" : "Canceled";
        if (ChargeDays(item) is not { } days) return "No charge date";
        if (days < 0) return $"{-days} {(-days == 1 ? "day" : "days")} overdue";
        if (days == 0) return status == "TRIAL" ? "Trial ends today" : "Renews today";
        return $"{(status == "TRIAL" ? "Trial ends" : "Renews")} in {days} {(days == 1 ? "day" : "days")}";
    }

    private static int? ChargeDays(JsonElement item)
    {
        if (item.Field("daysUntilCharge").ValueKind == JsonValueKind.Number) return item.Number("daysUntilCharge");
        var date = item.Text("effectiveChargeAt", item.Text("nextChargeAt", item.Text("occursAt")));
        return DateTimeOffset.TryParse(date, out var raw) ? (raw.Date - DateTime.Today).Days : null;
    }

    private static bool Overdue(JsonElement item)
        => item.Flag("overdue") || item.Flag("isOverdue") ||
           (item.Text("status").ToUpperInvariant() is "ACTIVE" or "TRIAL" &&
           ChargeTiming(item).EndsWith(" overdue", StringComparison.Ordinal));

    private static bool CanRenew(JsonElement item) =>
        item.Text("status").ToUpperInvariant() is ("ACTIVE" or "TRIAL") && (Overdue(item) || ChargeDays(item) is <= 0);

    private async Task Subscriptions(WorkspacePage page, CancellationToken cancellation)
    {
        page.Subtitle = "What you pay, and the day it charges next.";
        if (!Demo) page.ActionItems.Add(Ui.Button("Add subscription", () => SubscriptionForm(default), true));
        var data = await api.Get("/api/subscriptions", cancellation);
        var items = data.Items().Where(item => !IsPendingDeletion(SubscriptionResource(item.Id())))
            .Select(item => WithPendingFields(item, SubscriptionResource(item.Id()))).ToArray();
        var totals = data.Field("totals");
        string[] filters = ["All", "Active", "Trials", "Overdue", "Stopped"];
        var order = Ui.Choice("", ["Soonest charge", "Name", "Amount"], "Soonest charge");
        var search = Ui.Input("", placeholder: "Search subscriptions");
        search.Width = 230;
        var gallery = new SubscriptionGallery();
        gallery.OpenRequested += item => Run(() => SubscriptionDetails(item.Data.Id()));
        gallery.RenewRequested += item => Run(() => RenewSubscription(item.Data, reopenDetails: false));
        gallery.StatusRequested += item => Run(() => ChangeSubscription(item.Data, NextStatus(item.Data), reopenDetails: false));
        var tabs = Ui.Wrap();
        var scheduledCount = items.Count(i => !Matches(i, "Stopped") && ChargeDays(i) is >= 0 and <= 30);
        var summary = TileGrid(
            Metric("Monthly cost", Totals(totals, "monthly"), "Yearly · " + Totals(totals, "yearly")),
            Metric("Next 30 days", Totals(totals, "dueIn30Days"), $"{scheduledCount} {(scheduledCount == 1 ? "charge" : "charges")}"),
            Ui.Card(Ui.Stack(Ui.Section("Breakdown"),
                Ui.Wrap(Ui.Button("Active", () => Pick("Active")), Ui.Button("Trial", () => Pick("Trials")),
                    Ui.Button("Paused or canceled", () => Pick("Stopped"))))));
        page.FilterItems.Add(summary);
        var warnings = items.Count(Overdue);
        if (warnings > 0)
        {
            var overdue = Ui.Wrap(Ui.Subtitle($"{warnings} charge dates have passed. Nova never moves a date on its own."),
                Ui.Button("Review", () => Pick("Overdue")));
            if (!Demo) overdue.Children.Add(ActionButton("Renew all", async () =>
            {
                if (!await Confirm("Renew all overdue subscriptions?", "This records that the charges already happened.", "Renew all")) return;
                await api.Post("/api/subscriptions/renew-all");
                Toast("Overdue subscriptions renewed.");
                await Go("Subscriptions", refresh: true);
            }, true));
            page.FilterItems.Add(Ui.Card(overdue));
        }
        if (Demo) page.FilterItems.Add(Ui.Subtitle("The demo account cannot manage subscriptions."));
        page.FilterItems.Add(Ui.Wrap(tabs, search, order));
        foreach (var filter in filters)
            tabs.Children.Add(Ui.Button($"{filter} {items.Count(i => Matches(i, filter))}", () => Pick(filter), subscriptionFilter == filter));
        search.TextChanged += (_, _) => Draw();
        order.SelectionChanged += (_, _) => Draw();
        appearanceChanged += Draw;
        page.Unloaded += (_, _) => appearanceChanged -= Draw;
        Draw();

        Task Pick(string filter)
        {
            subscriptionFilter = filter;
            for (var i = 0; i < filters.Length; i++)
                ((Button)tabs.Children[i]).Style = Ui.Style(filters[i] == filter ? "NovaPrimary" : "NovaQuiet");
            Draw();
            return Task.CompletedTask;
        }

        void Draw()
        {
            if (cancellation.IsCancellationRequested) return;
            var filtered = items.Where(i => Matches(i, subscriptionFilter) &&
                (i.Text("service") + " " + i.Text("plan") + " " + i.Text("paymentLabel"))
                .Contains(search.Text.Trim(), StringComparison.OrdinalIgnoreCase));
            filtered = order.SelectedIndex switch
            {
                1 => filtered.OrderBy(i => i.Text("service"), StringComparer.OrdinalIgnoreCase),
                2 => filtered.OrderByDescending(i => decimal.TryParse(i.Text("amount"), System.Globalization.CultureInfo.InvariantCulture, out var n) ? n : 0),
                _ => filtered.OrderBy(i => ChargeDays(i) ?? int.MaxValue)
            };
            var ordered = filtered.ToArray();
            var live = ordered.Where(item => !Matches(item, "Stopped"));
            var soonest = order.SelectedIndex == 0;
            gallery.Groups.Clear();
            if (soonest) AddGroup("Due soon", live.Where(DueSoon));
            AddGroup(soonest ? "Later" : "Subscriptions", live.Where(item => !soonest || !DueSoon(item)));
            AddGroup("Paused and canceled", ordered.Where(item => Matches(item, "Stopped")));
            if (gallery.Groups.Count > 0)
            {
                if (page.Body != gallery) page.Body = gallery;
            }
            else page.Empty(items.Length == 0 ? "No subscriptions yet." : "No subscriptions match.",
                items.Length == 0 && !Demo ? "Add subscription" : "Clear filters",
                items.Length == 0 && !Demo ? () => SubscriptionForm(default) : () => { search.Text = ""; return Pick("All"); });
        }

        static bool DueSoon(JsonElement item) => Overdue(item) || ChargeDays(item) is <= 7;

        void AddGroup(string name, IEnumerable<JsonElement> matching)
        {
            var group = new SubscriptionGroup(name, matching.Select(SubscriptionCard));
            if (group.Count > 0) gallery.Groups.Add(group);
        }
    }

    private SubscriptionTile SubscriptionCard(JsonElement item)
    {
        var service = item.Text("service");
        var initials = string.Concat(service.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)
            .Take(2).Select(word => char.ToUpperInvariant(word[0])));
        var stopped = Matches(item, "Stopped");
        var late = !stopped && Overdue(item);
        var urgent = !stopped && (item.Flag("inWarningWindow") || ChargeDays(item) is >= 0 and <= 7);
        var colour = Ui.Rgb(late ? settings.Light ? 0xb42318u : 0xff9086u
            : urgent ? settings.Light ? 0x98520du : 0xf0b66bu
            : stopped ? settings.Light ? 0x6f6056u : 0xb4aaa4u
            : settings.Light ? 0x246449u : 0x8cccad);
        var outline = late || urgent ? colour : Ui.Rgb(settings.Light ? 0x4e3829u : 0xc9b2a2u);
        var timingBrush = new SolidColorBrush(colour);
        var border = new SolidColorBrush(ColorHelper.FromArgb(late || urgent ? (byte)100 : (byte)38, outline.R, outline.G, outline.B));
        var status = SubscriptionStatuses.FirstOrDefault(label => label.Equals(item.Text("status"), StringComparison.OrdinalIgnoreCase)) ?? "Active";
        var plan = item.Text("plan").Trim();
        var cycle = Cadence(item);
        var previous = Ui.Money(item.Field("previousPrice"));
        var trial = status == "Trial";
        var chargeDate = item.Text("effectiveChargeAt", item.Text("nextChargeAt"));
        var dates = chargeDate.Length == 0 ? "" : (stopped ? "Last scheduled charge " : trial ? "Ends " : "Charges ") + Ui.DateLabel(chargeDate);
        if (!stopped && item.Text("lastCancelBy").Length > 0) dates += " · Cancel by " + Ui.DateLabel(item.Text("lastCancelBy"));
        return new SubscriptionTile(item, service, initials, plan, status, Ui.Money(item), cycle,
            previous.Length == 0 ? "" : "Was " + previous, ChargeTiming(item), dates, timingBrush, border,
            StatusAction(item), !Demo && CanRenew(item), !Demo);
    }

    private static bool Matches(JsonElement item, string filter)
    {
        var status = item.Text("status").ToUpperInvariant();
        return filter switch
        {
            "Active" => status == "ACTIVE",
            "Trials" => status == "TRIAL",
            "Overdue" => Overdue(item),
            "Stopped" => status is "PAUSED" or "CANCELED",
            _ => true
        };
    }

    private static string Cadence(JsonElement item)
    {
        var count = Math.Max(1, item.Number("intervalCount"));
        var unit = item.Text("intervalUnit", "MONTH").ToLowerInvariant();
        return count == 1 ? $"/ {unit}" : $"every {count} {unit}s";
    }

    private static string SubscriptionResource(string id) => "/api/subscriptions/" + Ui.PathId(id);

    private async Task SubscriptionDetails(string id)
    {
        var panel = Ui.Stack(Ui.Subtitle("Loading subscription…"));
        Drawer("Subscription", panel);
        var item = WithPendingFields(await api.Get(SubscriptionResource(id), overlayCancellation.Token), SubscriptionResource(id));
        panel.Children.Clear();
        panel.Children.Add(Ui.Section(item.Text("service")));
        panel.Children.Add(Ui.Text(Ui.Money(item) + " " + Cadence(item), size: 28));
        panel.Children.Add(Ui.Subtitle(item.Text("plan")));
        var cost = Ui.Stack(Ui.Section("Cost"),
            Ui.Subtitle($"Monthly · {item.Text("currency")} {item.Text("monthlyEquivalent")}  |  Yearly · {item.Text("currency")} {item.Text("yearlyCost")}"));
        var previous = item.Field("previousPrice");
        if (Ui.Money(previous).Length > 0)
            cost.Children.Add(Ui.Subtitle($"Previous price · {Ui.Money(previous)} until {Ui.DateLabel(previous.Text("changedAt"))}"));
        panel.Children.Add(Ui.Card(cost));
        if (Overdue(item))
            panel.Children.Add(new InfoBar { IsOpen = true, IsClosable = false, Severity = InfoBarSeverity.Warning,
                Title = "Charge overdue", Message = "Mark it renewed after the charge happens to advance the saved date." });
        panel.Children.Add(Ui.Card(Ui.Stack(Ui.Section("Timing"), Ui.Text(ChargeTiming(item)),
            Ui.Subtitle($"Next charge · {Ui.DateLabel(item.Text("nextChargeAt"))}"),
            Ui.Subtitle($"Cancel by · {Ui.DateLabel(item.Text("lastCancelBy"))}"),
            Ui.Subtitle($"Trial ends · {Ui.DateLabel(item.Text("trialEndsAt"))}"))));
        var days = item.Number("reminderDays");
        panel.Children.Add(Ui.Card(Ui.Stack(Ui.Section("Reminder"), Ui.Subtitle(days == 0 ? "Off" : $"{days} days before the charge"))));
        foreach (var field in new[] { "reason", "paymentLabel" })
            if (item.Text(field).Length > 0) panel.Children.Add(Ui.Subtitle(item.Text(field)));
        if (Uri.TryCreate(item.Text("cancelUrl"), UriKind.Absolute, out var cancel) && cancel.Scheme is "https" or "http")
            panel.Children.Add(new HyperlinkButton { Content = "Open cancellation link", NavigateUri = cancel });
        if (Demo) return;
        var buttons = Ui.Wrap(
            ActionButton("Delete", () => DeleteSubscription(item)),
            ActionButton(StatusAction(item), () => ChangeSubscription(item, NextStatus(item))),
            Ui.Button("Edit", () => SubscriptionForm(item), true));
        if (CanRenew(item)) panel.Children.Add(ActionButton("Mark renewed", () => RenewSubscription(item), true));
        panel.Children.Add(buttons);
    }

    private static string StatusAction(JsonElement item) => item.Text("status").ToUpperInvariant() switch
    {
        "PAUSED" => "Resume",
        "CANCELED" => "Reactivate",
        _ => "Pause"
    };

    private static string NextStatus(JsonElement item) => Matches(item, "Stopped") ? "ACTIVE" : "PAUSED";

    private async Task RenewSubscription(JsonElement item, bool reopenDetails = true)
    {
        var id = item.Id();
        if (Demo || !CanRenew(item) || !renewingSubscriptions.Add(id)) return;
        try
        {
            await api.Post($"{SubscriptionResource(id)}/renew");
            Toast("Subscription renewed.");
            await AfterSubscription(reopenDetails ? id : null);
        }
        finally { renewingSubscriptions.Remove(id); }
    }

    private async Task ChangeSubscription(JsonElement item, string status, bool reopenDetails = true)
    {
        if (Demo) return;
        var change = await WriteWorkspace(HttpMethod.Patch, SubscriptionResource(item.Id()), new { status }, item, item.Text("service"));
        Toast(change.Queued ? "Subscription status saved on this PC." : "Subscription updated.");
        await AfterSubscription(reopenDetails ? item.Id() : null);
    }

    private async Task AfterSubscription(string? id = null)
    {
        await CloseOverlay();
        if (route == "Subscriptions") await Go("Subscriptions", refresh: true);
        if (route == "Dashboard") await Go("Dashboard", refresh: true);
        if (id is not null) await SubscriptionDetails(id);
    }

    private async Task DeleteSubscription(JsonElement item)
    {
        if (!await Confirm("Delete subscription?", $"Remove {item.Text("service")} from your subscriptions?", "Delete")) return;
        var change = await WriteWorkspace(HttpMethod.Delete, SubscriptionResource(item.Id()), null, item, "Delete " + item.Text("service"));
        await AfterSubscription();
        Toast(change.Queued ? "Subscription deletion waiting to sync." : "Subscription deleted.");
    }

    private Task SubscriptionForm(JsonElement item)
    {
        var editing = item.Id().Length > 0;
        var service = Ui.Input("Service", item.Text("service"));
        var plan = Ui.Input("Plan", item.Text("plan"));
        var amount = Ui.Input("Amount", item.Text("amount"));
        string[] commonCurrencies = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "INR", "EGP", "AED", "SAR"];
        const string otherCurrency = "Other…";
        var storedCurrency = item.Text("currency", "USD").ToUpperInvariant();
        var currency = Ui.Choice("Currency", commonCurrencies.Append(otherCurrency),
            commonCurrencies.Contains(storedCurrency) ? storedCurrency : otherCurrency);
        var customCurrency = Ui.Input("Currency code", currency.Selected() == otherCurrency ? storedCurrency : "", placeholder: "e.g. SEK");
        customCurrency.MaxLength = 3;
        customCurrency.Visibility = currency.Selected() == otherCurrency ? Visibility.Visible : Visibility.Collapsed;
        currency.SelectionChanged += (_, _) =>
            customCurrency.Visibility = currency.Selected() == otherCurrency ? Visibility.Visible : Visibility.Collapsed;
        var repeats = new NumberBox { Header = "Repeats every", Minimum = 1, Maximum = 365,
            Value = Math.Max(1, item.Number("intervalCount")), SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Inline };
        var unit = Ui.Choice("Cycle", ["day", "week", "month", "year"], item.Text("intervalUnit", "MONTH").ToLowerInvariant());
        var date = Ui.Date("Next charge date", item.Text("nextChargeAt"));
        var status = Ui.Choice("Status", SubscriptionStatuses, SubscriptionStatuses.FirstOrDefault(s =>
            s.Equals(item.Text("status"), StringComparison.OrdinalIgnoreCase)) ?? "Active");
        var trial = Ui.Date("Trial ends", item.Text("trialEndsAt"));
        var primaryTrial = Ui.Stack();
        var remind = new NumberBox { Header = "Remind me this many days before", Minimum = 0, Maximum = 90,
            Value = editing ? item.Number("reminderDays") : 3, SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Inline };
        var reason = Ui.Input("Reason", item.Text("reason"), true);
        var link = Ui.Input("Cancel link", item.Text("cancelUrl"));
        var payment = Ui.Input("Payment label", item.Text("paymentLabel"));
        var extraFields = Ui.Stack(reason, link, payment);
        var extra = new Expander { Header = "More details", Content = extraFields,
            IsExpanded = reason.Text.Length > 0 || link.Text.Length > 0 || payment.Text.Length > 0 };
        status.SelectionChanged += (_, _) => LayoutTrial();
        LayoutTrial();
        var form = Ui.Stack(service, plan, Ui.AdaptiveColumns(350, amount, currency), customCurrency, Ui.Wrap(repeats, unit), date, status, primaryTrial, remind,
            Ui.Subtitle("Nova notifies you before the charge, so you can cancel in time. Use 0 to turn it off."), extra);
        if (editing) form.Children.Add(ActionButton("Delete", () => DeleteSubscription(item)));
        form.Children.Add(ActionButton(editing ? "Save changes" : "Save", async () =>
        {
            if (service.Text.Trim().Length == 0 || amount.Text.Trim().Length == 0 || date.Date is null)
                throw new InvalidOperationException("Enter the service, amount, and next charge date.");
            var code = (currency.Selected() == otherCurrency ? customCurrency.Text : currency.Selected()).Trim().ToUpperInvariant();
            if (code.Length != 3 || code.Any(c => c < 'A' || c > 'Z'))
                throw new InvalidOperationException("Enter a three-letter currency code like USD.");
            if (!(decimal.TryParse(amount.Text.Trim(), NumberStyles.AllowDecimalPoint, CultureInfo.CurrentCulture, out var price) ||
                  decimal.TryParse(amount.Text.Trim(), NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out price)) ||
                decimal.Round(price, 2) <= 0)
                throw new InvalidOperationException("Enter an amount greater than zero.");
            if (status.Selected() == "Trial" && trial.Date is null)
                throw new InvalidOperationException("Select the trial end date.");
            var cancelLink = link.Text.Trim();
            if (cancelLink.Length > 0 && (!Uri.TryCreate(cancelLink, UriKind.Absolute, out var cancelUri) || cancelUri.Scheme is not ("http" or "https")))
                throw new InvalidOperationException("Enter a cancellation link starting with https:// or http://.");
            if (date.Date.Value.Date < DateTime.Today &&
                (!DateTimeOffset.TryParse(item.Text("nextChargeAt"), out var original) || original.Date != date.Date.Value.Date))
                throw new InvalidOperationException("Choose today or a later date for the next charge.");
            var payload = new
            {
                service = service.Text.Trim(), plan = plan.Text.Trim(), amount = price.ToString("F2", CultureInfo.InvariantCulture),
                currency = code, intervalCount = double.IsNaN(repeats.Value) ? 1 : Math.Max(1, (int)repeats.Value),
                intervalUnit = unit.Selected().ToUpperInvariant(), nextChargeAt = date.DateValue(),
                status = status.Selected().ToUpperInvariant(), trialEndsAt = trial.DateValue(),
                reminderDays = double.IsNaN(remind.Value) ? 0 : (int)remind.Value,
                reason = reason.Text.Trim(), cancelUrl = cancelLink.Length == 0 ? null : cancelLink,
                paymentLabel = payment.Text.Trim()
            };
            var change = await WriteWorkspace(editing ? HttpMethod.Patch : HttpMethod.Post,
                editing ? SubscriptionResource(item.Id()) : "/api/subscriptions", payload, item, service.Text.Trim());
            await AfterSubscription();
            Toast(change.Queued ? "Subscription saved on this PC. Check Workspace sync for status." : "Subscription saved.");
        }, true, "Saving…"));
        Drawer(editing ? "Edit subscription" : "Add subscription", form);
        return Task.CompletedTask;

        void LayoutTrial()
        {
            primaryTrial.Children.Remove(trial);
            extraFields.Children.Remove(trial);
            var required = status.Selected() == "Trial";
            primaryTrial.Visibility = required ? Visibility.Visible : Visibility.Collapsed;
            trial.PlaceholderText = required ? "Select date" : "No trial";
            (required ? primaryTrial : extraFields).Children.Insert(0, trial);
        }
    }
}
