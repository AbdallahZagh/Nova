using System.Collections.ObjectModel;
using System.Globalization;
using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using NovaTaskflow.Api;
using NovaTaskflow.Controls;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow
{
    private const string AdminApi = "/api/admin";
    private static readonly string[] AdminSections = ["Overview", "Users", "Demo", "Support", "Broadcasts", "AI usage", "Audit"];
    private static readonly string[] TicketStatuses = ["OPEN", "IN_PROGRESS", "AWAITING_USER", "RESOLVED", "CLOSED"];
    private static readonly string[] TicketPriorities = ["LOW", "NORMAL", "HIGH", "URGENT"];
    private static readonly string[] TicketCategories = ["BUG", "FEATURE_REQUEST", "ACCOUNT", "OTHER"];

    private bool IsAdmin => !Demo && user.Text("accountRole") == "SUPER_ADMIN";
    private void OpenAdmin(object sender, RoutedEventArgs args) => Run(() => Go("Administration", "Overview"));

    private async Task AdminPage(WorkspacePage page, string section, CancellationToken cancellation)
    {
        if (!IsAdmin) return;
        if (!AdminSections.Contains(section)) section = "Overview";
        page.Title = section == "Overview" ? "Administration" : section;
        page.Subtitle = "Super Admin";
        page.FilterItems.Add(Ui.Wrap(AdminSections.Select(name =>
            Ui.Button(name, () => Go("Administration", name), section == name)).ToArray()));
        page.ActionItems.Add(Ui.Button("Refresh", () => Go("Administration", section, true)));
        switch (section)
        {
            case "Overview":
                await AdminOverview(page, cancellation);
                break;
            case "Users":
            {
                var search = Ui.Input("Search users", placeholder: "Name, email, or username");
                await AdminDirectory(page, [search], () => $"/users?q={Uri.EscapeDataString(search.Text.Trim())}", row =>
                    new(row.Id(), row.Text("fullName", row.Text("email")), $"{row.Text("email")} · {row.Text("role")}", Label(row.Text("status"))),
                    AdminUser, cancellation);
                break;
            }
            case "Demo":
                await AdminDemo(page, cancellation);
                break;
            case "Support":
            {
                var status = Ui.Choice("Status", new[] { "All" }.Concat(TicketStatuses), "All");
                var priority = Ui.Choice("Priority", new[] { "All" }.Concat(TicketPriorities), "All");
                var category = Ui.Choice("Category", new[] { "All" }.Concat(TicketCategories), "All");
                await AdminDirectory(page, [status, priority, category],
                    () => $"/support/tickets?status={AdminFilter(status)}&priority={AdminFilter(priority)}&category={AdminFilter(category)}",
                    row => new(row.Id(), row.Text("title"), $"{row.Field("user").Text("email")} · {Label(row.Text("priority"))}", Label(row.Text("status"))),
                    AdminTicket, cancellation);
                break;
            }
            case "Broadcasts":
                await AdminBroadcasts(page, cancellation);
                break;
            case "AI usage":
                await AdminAi(page, cancellation);
                break;
            case "Audit":
            {
                var action = Ui.Input("Action", placeholder: "Filter by action code");
                await AdminDirectory(page, [action], () => $"/audit?action={Uri.EscapeDataString(action.Text.Trim())}",
                    row => new(row.Id(), Label(row.Text("action")), $"{row.Field("actor").Text("fullName", "System")} · {row.Text("targetType")} · {row.Text("targetId")}",
                        DateStamp(row.Text("createdAt"))),
                    row => { AdminDetails("Audit event", row, ["action", "createdAt", "targetType", "targetId"], "metadata"); return Task.CompletedTask; },
                    cancellation);
                break;
            }
        }
    }

    private async Task AdminOverview(WorkspacePage page, CancellationToken cancellation)
    {
        var data = await api.Get(AdminApi + "/overview", cancellation);
        var counts = data.Field("counts");
        var http = data.Field("http");
        var flags = data.Field("settings");
        var main = Ui.Stack(
            TileGrid(Metric("Total accounts", counts.Text("users", "0"), $"{counts.Number("activeUsers")} active"),
                Metric("Projects", counts.Text("projects", "0"), $"{counts.Number("tasks")} tasks"),
                Metric("Whiteboards", counts.Text("boards", "0"), ""),
                Metric("Open tickets", counts.Text("openTickets", "0"), $"{counts.Number("aiToday")} AI calls today")),
            TileGrid(
                Ui.Card(Ui.Stack(Ui.Section("System health"), Fields(JsonSerializer.SerializeToElement(new
                    {
                        requestsLastHour = http.Number("requestsLastHour"),
                        errorRate = http.Field("errorRate").ValueKind == JsonValueKind.Number
                            ? http.Field("errorRate").GetDouble().ToString("P1", CultureInfo.CurrentCulture) : "—",
                        averageLatency = $"{http.Number("avgLatencyMs")} ms",
                        storage = data.Field("storage").Field("bytes").ValueKind == JsonValueKind.Number
                            ? $"{data.Field("storage").Field("bytes").GetInt64() / 1048576.0:N1} MiB" : "—"
                    }), ["requestsLastHour", "errorRate", "averageLatency", "storage"]))),
                Ui.Card(Ui.Stack(Ui.Section("Signup funnel"), Fields(data.Field("signupFunnel"), ["registered", "verified", "withProject"]))),
                Ui.Card(Ui.Stack(Ui.Section("Integrations"), Fields(data.Field("integrations"), ["gemini", "firebase", "emailjs", "supabase"])))));
        var toggles = new Dictionary<string, CheckBox>();
        var options = Ui.Stack(Ui.Section("System settings"));
        foreach (var (key, label) in new[] { ("maintenanceMode", "Maintenance mode"), ("registrationsEnabled", "Registration"),
            ("aiEnabled", "AI features"), ("fcmEnabled", "Push notifications"), ("whiteboardRealtimeEnabled", "Whiteboard realtime") })
        {
            var check = new CheckBox { Content = label, IsChecked = flags.Flag(key) };
            toggles.Add(key, check);
            options.Children.Add(check);
        }
        var banner = Ui.Input("Workspace banner", flags.Text("broadcastBanner"), true);
        var quota = new NumberBox { Header = "Default daily AI quota", Minimum = 0, Maximum = int.MaxValue, Value = flags.Number("defaultAiDailyQuota") };
        options.Children.Add(banner);
        options.Children.Add(quota);
        options.Children.Add(ActionButton("Save settings", async () =>
        {
            var payload = new Dictionary<string, object?>();
            foreach (var (key, check) in toggles)
                if ((check.IsChecked == true) != flags.Flag(key)) payload[key] = check.IsChecked == true;
            if (banner.Text.Trim() != flags.Text("broadcastBanner")) payload["broadcastBanner"] = string.IsNullOrWhiteSpace(banner.Text) ? null : banner.Text.Trim();
            var newQuota = WholeNumber(quota, "Default daily AI quota");
            if (newQuota != flags.Number("defaultAiDailyQuota")) payload["defaultAiDailyQuota"] = newQuota;
            if (payload.Count == 0) return;
            if (!await Confirm("Save system settings?", "These settings apply across the Nova workspace.", "Save settings")) return;
            await api.Patch(AdminApi + "/settings", payload);
            await Go("Administration", "Overview", true);
            Toast("System settings saved.");
        }, true));
        main.Children.Add(Ui.Card(options));
        var jobs = Ui.Stack(Ui.Section("Scheduled jobs"));
        foreach (var row in data.Items("crons"))
            jobs.Children.Add(Ui.Stack(Ui.Text(row.Text("name")), Fields(row, ["lastStatus", "lastFinishedAt", "lastError"])));
        if (jobs.Children.Count == 1) jobs.Children.Add(Ui.Subtitle("No scheduled job runs yet."));
        main.Children.Add(Ui.Card(jobs));
        page.Body = Ui.Scroll(main);
    }

    private async Task AdminDirectory(WorkspacePage page, FrameworkElement[] filters, Func<string> path,
        Func<JsonElement, RowItem> map, Func<JsonElement, Task> open, CancellationToken cancellation, int firstLimit = 20)
    {
        var rows = new ObservableCollection<RowItem>();
        var list = Ui.List(rows, row => Run(() => open(row.Data)));
        var grid = new Grid { RowSpacing = 10 };
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        grid.RowDefinitions.Add(new RowDefinition());
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        int current = 1, limit = firstLimit, request = 0;
        var count = Ui.Subtitle("");
        var prev = Ui.Button("Previous", () => Task.CompletedTask);
        var next = Ui.Button("Next", () => Task.CompletedTask);
        prev.Click += (_, _) => Run(() => Load(current - 1));
        next.Click += (_, _) => Run(() => Load(current + 1));
        var bar = Ui.Wrap(filters);
        if (filters.Length > 0) bar.Children.Add(ActionButton("Apply filters", () => Load(1), true));
        grid.Children.Add(bar);
        Grid.SetRow(list, 1); grid.Children.Add(list);
        var footer = Ui.Row(prev, count, next);
        Grid.SetRow(footer, 2); grid.Children.Add(footer);
        page.Body = grid;
        await Load(1);

        async Task Load(int target)
        {
            if (!IsAdmin || target < 1 || cancellation.IsCancellationRequested) return;
            var version = ++request;
            var url = path();
            var result = await api.Get($"{AdminApi}{url}{(url.Contains('?') ? '&' : '?')}page={target}", cancellation);
            cancellation.ThrowIfCancellationRequested();
            if (version != request) return;
            var data = result.Items("data").ToArray();
            current = target;
            limit = result.Number("limit") > 0 ? result.Number("limit") : limit;
            var total = result.Number("total");
            rows.Clear();
            foreach (var item in data) rows.Add(map(item) with { Data = item });
            count.Text = total == 0 ? "No results" : $"Page {target} of {Math.Max(1, (total + limit - 1) / limit)} · {total} results";
            prev.Visibility = target > 1 ? Visibility.Visible : Visibility.Collapsed;
            next.Visibility = target * limit < total ? Visibility.Visible : Visibility.Collapsed;
        }
    }

    private async Task AdminUser(JsonElement row)
    {
        var path = AdminApi + "/users/" + Ui.PathId(row.Id());
        var data = await api.Get(path, viewCancellation.Token);
        var section = Ui.Stack(Fields(data, ["id", "email", "username", "role", "status", "createdAt", "lastActiveAt", "projectCount", "taskCount", "boardCount"]));
        foreach (var token in data.Items("deviceTokens"))
            section.Children.Add(Ui.Card(Ui.Stack(Ui.Text(token.Text("platform", "Device")), Fields(token, ["lastSeenAt", "isActive"]))));
        foreach (var otp in data.Items("pendingOtps"))
            section.Children.Add(Ui.Subtitle($"{Label(otp.Text("purpose"))} · expires {DateStamp(otp.Text("expiresAt"))}"));
        if (data.Flag("isDemo")) Add("Reset demo workspace", "reset-demo", "This resets the selected demo workspace.");
        else
        {
            if (data.Text("status") == "ACTIVE") Add("Suspend account", "suspend", "This stops the selected user from signing in.");
            if (data.Text("status") == "SUSPENDED") Add("Reinstate account", "reinstate", "This restores access for the selected user.");
            if (data.Items("pendingOtps").Any()) Add("Verify account", "verify-otp", "This completes account verification.");
            if (data.Text("role") == "USER") Add("Promote to Super Admin", "promote", "This grants access to system administration.");
            if (data.Text("role") == "SUPER_ADMIN") Add("Remove Super Admin role", "demote", "This removes access to system administration.");
            Add("Revoke sessions", "revoke-tokens", "This signs out the selected user’s sessions.");
        }
        Drawer(data.Text("fullName", "Account details"), section, width: 540);

        void Add(string label, string action, string description)
        {
            section.Children.Add(ActionButton(label, async () =>
            {
                if (!await Confirm(label + "?", $"{data.Text("email")} · {description}", label)) return;
                var result = await api.Post(path + "/" + action, new { });
                if (data.Id() == user.Id() && action is "demote" or "suspend" or "revoke-tokens") { EndSession(false); return; }
                await CloseOverlay();
                await Go("Administration", "Users", true);
                Toast(result.Text("message", "Account updated."));
            }));
        }
    }

    private async Task AdminDemo(WorkspacePage page, CancellationToken cancellation)
    {
        var overview = await api.Get(AdminApi + "/demo/overview", cancellation);
        page.FilterItems.Add(TileGrid(Metric("Today", overview.Text("sessionsToday", "0"), "Sessions"),
            Metric("This week", overview.Text("sessionsWeek", "0"), $"{overview.Number("uniqueVisitorsWeek")} unique visitors"),
            Metric("Live now", overview.Text("liveSessions", "0"), "Open sessions")));
        page.ActionItems.Insert(0, Ui.Button("Usage details", () =>
        {
            var items = Ui.Stack(Ui.Section("Daily summaries"));
            foreach (var day in overview.Items("summaries"))
                items.Children.Add(Ui.Card(Fields(day, ["day", "sessions", "uniqueVisitors", "mutations", "blocked"])));
            items.Children.Add(Ui.Section("Blocked actions"));
            foreach (var action in overview.Items("blockedActions"))
                items.Children.Add(Ui.Subtitle($"{Label(action.Text("action"))} · {action.Number("count")}"));
            Drawer("Demo usage", items);
            return Task.CompletedTask;
        }));
        await AdminDirectory(page, [], () => "/demo/sessions", row => new(row.Id(), DateStamp(row.Text("startedAt")),
            $"{Label(row.Text("platform", "Unknown"))} · {row.Number("mutationCount")} changes · {row.Number("blockedCount")} blocked",
            row.Text("endedAt").Length > 0 ? "Ended" : "Live"),
            row => { AdminDetails("Demo session", row, ["id", "startedAt", "endedAt", "platform", "mutationCount", "blockedCount"]); return Task.CompletedTask; },
            cancellation);
    }

    private async Task AdminTicket(JsonElement row)
    {
        var path = AdminApi + "/support/tickets/" + Ui.PathId(row.Id());
        var ticket = await api.Get(path, viewCancellation.Token);
        var body = Ui.Stack(Ui.Text(ticket.Text("body")), Fields(ticket, ["category", "createdAt", "platform", "route", "appVersion"]),
            Ui.Subtitle(ticket.Field("user").Text("email")));
        foreach (var item in ticket.Items("attachments"))
            if (SafeExternalUri(item.Text("url", item.Text("publicUrl"))) is { } attachment)
                body.Children.Add(new HyperlinkButton { Content = item.Text("fileName", "Open attachment"), NavigateUri = attachment });
        foreach (var item in ticket.Items("replies"))
            body.Children.Add(Ui.Card(Ui.Stack(Ui.Text(item.Text("body")), Ui.Subtitle(DateStamp(item.Text("createdAt"))))));
        var status = Ui.Choice("Status", TicketStatuses, ticket.Text("status"));
        var priority = Ui.Choice("Priority", TicketPriorities, ticket.Text("priority"));
        var reply = Ui.Input("Email reply", multiline: true);
        body.Children.Add(Ui.Row(status, priority));
        body.Children.Add(ActionButton("Update ticket", async () =>
        {
            await api.Patch(path, new { status = status.Selected(), priority = priority.Selected() });
            await AdminTicket(row);
            Toast("Ticket updated.");
        }));
        body.Children.Add(reply);
        body.Children.Add(Ui.Row(ActionButton("Send reply", () => Reply(false)), ActionButton("Send and resolve", () => Reply(true), true)));
        Drawer(ticket.Text("title"), body, width: 580);

        async Task Reply(bool resolve)
        {
            if (string.IsNullOrWhiteSpace(reply.Text)) throw new InvalidOperationException("Enter a reply.");
            if (!await Confirm("Send email reply?", $"Recipient: {ticket.Field("user").Text("email", "the ticket requester")}", "Send reply")) return;
            await api.Post(path + "/replies", new { body = reply.Text.Trim(), resolve });
            await AdminTicket(row);
            Toast(resolve ? "Reply sent and ticket resolved." : "Reply sent.");
        }
    }

    private async Task AdminBroadcasts(WorkspacePage page, CancellationToken cancellation)
    {
        var data = await api.Get(AdminApi + "/notifications/broadcasts", cancellation);
        page.ActionItems.Insert(0, Ui.Button("New announcement", () => { ComposeBroadcast(); return Task.CompletedTask; }, true));
        if (!data.Items().Any()) { page.Empty("No announcements yet."); return; }
        page.Body = Ui.List(new ObservableCollection<RowItem>(data.Items().Select(item =>
            new RowItem(item.Id(), item.Text("title"), $"{Label(item.Text("scope"))} · {DateStamp(item.Text("createdAt"))}", Label(item.Text("status"))) { Data = item })),
            item => AdminDetails(item.Title, item.Data, ["body", "scope", "targetUserId", "targetProjectId", "sent", "failed", "openedCount", "tapRate", "createdAt"]));
    }

    private void ComposeBroadcast()
    {
        var scope = Ui.Choice("Audience", ["USER", "PROJECT", "ALL"], "USER");
        var target = Ui.Input("User or project ID");
        scope.SelectionChanged += (_, _) => target.Visibility = scope.Selected() == "ALL" ? Visibility.Collapsed : Visibility.Visible;
        var title = Ui.Input("Title");
        var body = Ui.Input("Message", multiline: true);
        var url = Ui.Input("Action link (optional)");
        var inApp = new CheckBox { Content = "In-app notification", IsChecked = true };
        var push = new CheckBox { Content = "Push notification" };
        var email = new CheckBox { Content = "Email" };
        Drawer("New announcement", Ui.Stack(scope, target, title, body, url, inApp, push, email, ActionButton("Review and send", async () =>
        {
            if (title.Text.Trim().Length == 0 || body.Text.Trim().Length == 0) throw new InvalidOperationException("Enter the title and message.");
            if (inApp.IsChecked != true && push.IsChecked != true && email.IsChecked != true) throw new InvalidOperationException("Choose a delivery channel.");
            var destination = scope.Selected();
            if (destination != "ALL" && !Guid.TryParse(target.Text.Trim(), out _)) throw new InvalidOperationException("Enter a valid recipient ID.");
            var link = url.Text.Trim();
            if (link.Length > 0 && SafeExternalUri(link) is null && !(link.StartsWith('/') && !link.StartsWith("//")))
                throw new InvalidOperationException("Enter an HTTPS link or a Nova page route.");
            var audience = destination == "ALL" ? "all users" : $"{Label(destination)} {target.Text.Trim()}";
            if (!await Confirm("Send announcement?", $"Send “{title.Text.Trim()}” to {audience}.", "Send announcement")) return;
            var payload = new Dictionary<string, object>
            {
                ["scope"] = destination, ["title"] = title.Text.Trim(), ["body"] = body.Text.Trim(),
                ["inApp"] = inApp.IsChecked == true, ["fcm"] = push.IsChecked == true, ["email"] = email.IsChecked == true
            };
            if (destination == "USER") payload["targetUserId"] = target.Text.Trim();
            if (destination == "PROJECT") payload["targetProjectId"] = target.Text.Trim();
            if (link.Length > 0) payload["actionUrl"] = link;
            await api.Post(AdminApi + "/notifications/broadcasts", payload);
            await Go("Administration", "Broadcasts", true);
            Toast("Announcement submitted.");
        }, true)));
    }

    private async Task AdminAi(WorkspacePage page, CancellationToken cancellation)
    {
        var data = await api.Get(AdminApi + "/ai/usage", cancellation);
        var enabled = data.Field("settings").Flag("aiEnabled");
        var aiSwitch = new ToggleSwitch { Header = "AI features", IsOn = enabled };
        aiSwitch.Toggled += (_, _) =>
        {
            if (!aiSwitch.IsEnabled || aiSwitch.IsOn == enabled) return;
            var desired = aiSwitch.IsOn;
            Run(async () =>
            {
                aiSwitch.IsEnabled = false;
                try
                {
                    await api.Patch(AdminApi + "/settings", new { aiEnabled = desired }, cancellation);
                    enabled = desired;
                    Toast(enabled ? "AI features enabled." : "AI features disabled.");
                }
                finally { aiSwitch.IsOn = enabled; aiSwitch.IsEnabled = true; }
            });
        };
        var content = Ui.Stack(
            TileGrid(Metric("Calls today", data.Text("today", "0"), ""), Metric("This month", data.Text("month", "0"), ""),
                Metric("Default daily quota", data.Field("settings").Text("defaultAiDailyQuota", "0"), "")),
            Ui.Card(Ui.Stack(aiSwitch, Ui.Subtitle("Controls AI features for regular accounts."))),
            Ui.Section("Usage by account"));
        var rows = data.Items("byUser").Select(row => new RowItem(row.Text("userId"), row.Text("userId"),
            $"{row.Field("_count").Number("userId")} calls this month", "Set quota")).ToArray();
        var quotas = data.Items("quotas").ToDictionary(row => row.Text("userId"), row => row.Number("dailyLimit"));
        page.ActionItems.Insert(0, Ui.Button("Set user quota", () => { EditQuota("", 0); return Task.CompletedTask; }, true));
        var grid = new Grid { RowSpacing = 10 };
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        grid.RowDefinitions.Add(new RowDefinition());
        grid.Children.Add(content);
        var list = Ui.List(new ObservableCollection<RowItem>(rows.Concat(quotas.Keys.Except(rows.Select(row => row.Id))
            .Select(id => new RowItem(id, id, $"Daily limit: {quotas[id]}", "Set quota")))), row => EditQuota(row.Id, quotas.GetValueOrDefault(row.Id)));
        Grid.SetRow(list, 1); grid.Children.Add(list);
        page.Body = grid;
    }

    private void EditQuota(string id, int initial)
    {
        var account = Ui.Input("User ID", id);
        var limit = new NumberBox { Header = "Daily limit", Minimum = 0, Maximum = int.MaxValue, Value = initial };
        Drawer("Set AI quota", Ui.Stack(account, limit, ActionButton("Save quota", async () =>
        {
            if (!Guid.TryParse(account.Text.Trim(), out var userId)) throw new InvalidOperationException("Enter a valid user ID.");
            var dailyLimit = WholeNumber(limit, "Daily limit");
            await api.Patch(AdminApi + $"/ai/quotas/{userId:D}", new { dailyLimit });
            await Go("Administration", "AI usage", true);
            Toast("AI quota saved.");
        }, true)));
    }

    private static int WholeNumber(NumberBox box, string name)
    {
        var value = box.Value;
        if (!double.IsFinite(value) || value < 0 || value > int.MaxValue || Math.Truncate(value) != value)
            throw new InvalidOperationException($"{name} must be a whole number of zero or more.");
        return (int)value;
    }

    private void AdminDetails(string title, JsonElement data, string[] fields, string? metadata = null)
    {
        var content = Fields(data, fields);
        if (metadata is not null && data.Field(metadata).ValueKind is JsonValueKind.Array or JsonValueKind.Object)
            content.Children.Add(Ui.Input("Details", data.Field(metadata).GetRawText(), multiline: true, readOnly: true));
        Drawer(title, content, width: 560);
    }

    private static StackPanel Fields(JsonElement data, string[] fields)
    {
        var panel = Ui.Stack();
        foreach (var field in fields)
        {
            var value = data.Field(field);
            if (value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null or JsonValueKind.Object or JsonValueKind.Array) continue;
            var caption = System.Text.RegularExpressions.Regex.Replace(field, "([a-z])([A-Z])", "$1 $2");
            var text = value.ValueKind is JsonValueKind.True or JsonValueKind.False ? value.GetBoolean() ? "On" : "Off" : value.ToString();
            if (field.EndsWith("At", StringComparison.Ordinal)) text = DateStamp(text);
            if (text.Length > 75 || text.Contains('\n'))
            {
                panel.Children.Add(Ui.Stack(Ui.Subtitle(Label(caption)), Ui.Text(text)));
                continue;
            }
            var pair = new Grid { ColumnSpacing = 8 };
            pair.ColumnDefinitions.Add(new ColumnDefinition());
            pair.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto, MaxWidth = 255 });
            var label = Ui.Subtitle(Label(caption));
            label.VerticalAlignment = VerticalAlignment.Center;
            pair.Children.Add(label);
            var content = Ui.Text(text);
            content.HorizontalAlignment = HorizontalAlignment.Right;
            Grid.SetColumn(content, 1);
            pair.Children.Add(content);
            panel.Children.Add(pair);
        }
        return panel;
    }

    private static string DateStamp(string value) => DateTimeOffset.TryParse(value, out var date) ? date.ToLocalTime().ToString("g") : value;
    private static string Label(string name) => CultureInfo.CurrentCulture.TextInfo.ToTitleCase(name.Replace('_', ' ').ToLowerInvariant());
    private static string AdminFilter(ComboBox filter) => filter.SelectedIndex <= 0 ? "" : filter.Selected();
    private static Uri? SafeExternalUri(string input) => Uri.TryCreate(input, UriKind.Absolute, out var uri) &&
        uri.Scheme is "https" or "http" && uri.UserInfo.Length == 0 ? uri : null;
}
