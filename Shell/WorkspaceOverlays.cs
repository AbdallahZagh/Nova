using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using NovaTaskflow.Api;
using NovaTaskflow.Controls;
using NovaTaskflow.Live;
using NovaTaskflow.ViewModels;
using System.Text.Json;
using Windows.System;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow
{
    private CancellationTokenSource? background;
    private bool notificationUnreadOnly;
    private Action? notificationsChanged;
    private JsonElement notificationPage;
    private DateTimeOffset nextWindowsPushRegistration;
    private CancellationTokenSource? windowsPushRegistration;

    private void StartBackground()
    {
        StopBackground();
        var lifetime = new CancellationTokenSource();
        background = lifetime;
        notificationUnreadOnly = false;
        notificationPage = default;
        nextWindowsPushRegistration = default;
        var cancellation = lifetime.Token;
        var account = user.Id();
        if (api.Endpoint == DesktopSettings.DefaultServer ||
            Environment.GetEnvironmentVariable("NOVA_SUPABASE_URL") is { Length: > 0 })
        {
            var live = new NotesChannel(account,
                message => DispatcherQueue.TryEnqueue(() => Run(() => NoteBroadcast(message, cancellation))),
                () => DispatcherQueue.TryEnqueue(() =>
                {
#if DEBUG
                    notesLiveJoined = !cancellation.IsCancellationRequested;
#endif
                    Run(() => RefreshNotes(cancellation));
                }));
            _ = live.Listen(cancellation);
            var scheduled = new HashSet<string>(StringComparer.Ordinal);
            var changes = NotesChannel.WorkspaceChanges(account, Schedule, () =>
            {
                Schedule("notification");
                Schedule("system_settings");
            });
            _ = changes.Listen(cancellation);

            void Schedule(string table) => DispatcherQueue.TryEnqueue(() =>
            {
                if (cancellation.IsCancellationRequested || !scheduled.Add(table)) return;
                _ = Update(table);
            });

            async Task Update(string table)
            {
                try
                {
                    await Task.Delay(400, cancellation);
                    if (table == "notification") await RefreshNotifications(cancellation);
                    else if (table == "system_settings") await RefreshSystemStatus(cancellation);
                }
                catch (Exception error) when (error is ApiFailure or IOException or OperationCanceledException or JsonException) { }
                finally { scheduled.Remove(table); }
            }
        }
        _ = ObserveWorkspace(cancellation);
    }

    private void StopBackground()
    {
        background?.Cancel();
        background?.Dispose();
        background = null;
        notificationsChanged = null;
    }

    private async Task ObserveWorkspace(CancellationToken cancellation)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(32));
        var restore = true;
        try
        {
            do
            {
                tray?.RetryShortcuts();
                if (WindowsPush.Registered && !Demo && settings.NotificationsAfterExit)
                    _ = RefreshWindowsPush(cancellation);
                await Task.WhenAll(Quiet(() => RefreshNotes(cancellation, restore)), Quiet(() => RefreshNotifications(cancellation)),
                    Quiet(() => RefreshSystemStatus(cancellation)),
                    Quiet(FlushNotes), Quiet(() => SyncOutbox(cancellation)));
                restore = false;
            }
            while (await timer.WaitForNextTickAsync(cancellation));
        }
        catch (OperationCanceledException) { }

        static async Task Quiet(Func<Task> action)
        {
            try { await action(); }
            catch (Exception error) when (error is ApiFailure or IOException or OperationCanceledException or JsonException) { }
        }
    }

    internal void RequestNotificationRefresh()
    {
        if (SignedIn && !quitting && background is { IsCancellationRequested: false } lifetime)
            Run(() => RefreshNotifications(lifetime.Token));
    }

    private async Task RefreshWindowsPush(CancellationToken cancellation)
    {
        if (windowsPushRegistration is not null || signingOut || DateTimeOffset.UtcNow < nextWindowsPushRegistration) return;
        var account = user.Id();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        windowsPushRegistration = timeout;
        timeout.CancelAfter(TimeSpan.FromSeconds(75));
        try { nextWindowsPushRegistration = await WindowsPush.RefreshChannel(api, account, timeout.Token); }
        catch (Exception error) when (error is ApiFailure or IOException or OperationCanceledException or
            System.Runtime.InteropServices.COMException or UnauthorizedAccessException)
        {
            if (!cancellation.IsCancellationRequested) nextWindowsPushRegistration = DateTimeOffset.UtcNow.AddMinutes(15);
        }
        finally { windowsPushRegistration = null; }
    }

    private async Task NoteBroadcast(JsonElement message, CancellationToken cancellation)
    {
        if (cancellation.IsCancellationRequested) return;
        var id = message.Text("kind") switch
        {
            "saved" => message.Field("note").Id(),
            "deleted" or "refresh" => message.Id(),
            _ => ""
        };
        if (!Guid.TryParse(id, out _)) return;
#if DEBUG
        notesLiveMessages++;
#endif
        await RefreshNote(id, cancellation);
    }

    private async Task ShowSearch()
    {
        var palette = new WorkspaceSearch();
        var cancellation = ShowOverlay("Search Nova", palette, true, 640);
        CancellationTokenSource? typing = null;
        palette.Unloaded += (_, _) => { typing?.Cancel(); typing?.Dispose(); typing = null; };
        palette.OpenRequested += item => Run(() => OpenSearchResult(item));
        palette.QueryChanged += query => Run(async () =>
        {
            typing?.Cancel();
            typing?.Dispose();
            typing = null;
            if (query.Length == 0) { palette.SetStatus("Start typing to search"); return; }
            typing = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
            var operation = typing.Token;
            palette.SetStatus("Searching…", busy: true);
            await Task.Delay(250, operation);
            JsonElement response;
            try { response = await api.Get("/api/search?q=" + Uri.EscapeDataString(query), operation); }
            catch (Exception error) when (!operation.IsCancellationRequested && error is IOException or ApiFailure)
            {
                palette.SetStatus("Search is unavailable. Try again.");
                return;
            }
            operation.ThrowIfCancellationRequested();
            var matches = new List<SearchResult>();
            Add("projects", "Projects", "\uE8B7", "name", item => item.Text("description", item.Text("status")));
            Add("whiteboards", "Whiteboards", "\uE929", "title", item => item.Field("project").Text("name", "Personal whiteboard"));
            Add("tasks", "Tasks", "\uE9D5", "title", item => item.Field("project").Text("name"));
            Add("subscriptions", "Subscriptions", "\uE8C7", "service", item => item.Text("plan", Ui.Money(item)));
            Add("notes", "Notes", "\uE70B", "title", item => item.Text("preview", item.Field("project").Text("name", "Personal note")));
            Add("users", "People", "\uE77B", "name", item => item.Text("username", item.Text("email")));
            palette.SetMatches(matches);

            void Add(string field, string label, string glyph, string title, Func<JsonElement, string> describe)
            {
                foreach (var item in response.Items(field).Where(item => item.Id().Length > 0))
                {
                    var name = item.Text(title, item.Text("fullName", item.Text("email", "Untitled")));
                    matches.Add(new(new RowItem(item.Id(), name, describe(item), label, field) { Data = item }, glyph));
                }
            }
        });
        await Task.Yield();
        if (!cancellation.IsCancellationRequested) palette.FocusQuery();
    }

    private async Task OpenSearchResult(RowItem item)
    {
        await CloseOverlay();
        switch (item.Kind)
        {
            case "projects": await Go("Project", item.Id); break;
            case "tasks": await TaskDrawer(item.Id); break;
            case "whiteboards": await Go("Board", item.Id); break;
            case "subscriptions": await SubscriptionDetails(item.Id); break;
            case "notes": await Go("Note", item.Id); break;
            case "users": await (item.Id == user.Id() ? Go("Profile") : Go("Person", item.Id)); break;
        }
    }

    private async Task RefreshNotifications(CancellationToken cancellation)
    {
        var account = user.Id();
        var server = api.Endpoint;
        var (result, cached) = await api.GetWithSource("/api/device-tokens/notifications?page=1&limit=30", cancellation);
        cancellation.ThrowIfCancellationRequested();
        notificationPage = result;
        var count = result.Number("unreadCount");
        UnreadBadge.Visibility = count > 0 ? Visibility.Visible : Visibility.Collapsed;
        UnreadBadge.Value = count;
        notificationsChanged?.Invoke();
        if (!cached && account.Length > 0)
        {
            var delivery = new NotificationDelivery(server, account);
            try
            {
                await delivery.Observe(api, result, 30, () => !quitting && user.Id() == account && api.Endpoint == server, item =>
                {
                    if (hidden && notificationsRegistered) delivery.ShowToast(item);
                    else if (!hidden && Overlay.Visibility != Visibility.Visible &&
                             (!ToastBar.IsOpen || ToastBar.Severity == InfoBarSeverity.Informational))
                    {
                        Toast(item.Text("title", "Nova Taskflow"), InfoBarSeverity.Informational);
                        ToastBar.Message = item.Text("message");
                        ToastBar.ActionButton = Ui.Button("Open", async () =>
                        {
                            ToastBar.IsOpen = false;
                            if (user.Id() == account && api.Endpoint == server) await NotificationDetails(item);
                        });
                    }
                }, cancellation);
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Runtime.InteropServices.COMException) { }
        }
    }

    private async Task ShowNotifications()
    {
        var pageNumber = 1;
        var additional = new List<JsonElement>();
        var list = new NotificationInbox();
        list.OpenRequested += item => Run(() => NotificationDetails(item));
        var empty = Ui.Subtitle("");
        var allButton = Ui.Button("All", primary: true);
        var unreadButton = Ui.Button("Unread");
        var buttons = Ui.Wrap(allButton, unreadButton);
        buttons.Children.Add(ActionButton("Refresh", async () =>
        {
            additional.Clear();
            pageNumber = 1;
            await RefreshNotifications(overlayCancellation.Token);
        }));
        buttons.Children.Add(ActionButton("Mark all read", async () =>
        {
            await api.Patch("/api/device-tokens/notifications/read", new { });
            additional.Clear();
            pageNumber = 1;
            await RefreshNotifications(overlayCancellation.Token);
        }));
        var grid = new Grid { Margin = new Thickness(16, 0, 16, 16), RowSpacing = 12 };
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        grid.RowDefinitions.Add(new RowDefinition());
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        grid.Children.Add(buttons);
        Grid.SetRow(list, 1); grid.Children.Add(list);
        Grid.SetRow(empty, 1); grid.Children.Add(empty);
        Button next = null!;
        next = ActionButton("Load more", async () =>
        {
            var result = await api.Get($"/api/device-tokens/notifications?page={pageNumber + 1}&limit=30", overlayCancellation.Token);
            pageNumber++;
            additional.AddRange(result.Items("data"));
            Draw();
        });
        allButton.Click += (_, _) => { notificationUnreadOnly = false; Draw(); };
        unreadButton.Click += (_, _) => { notificationUnreadOnly = true; Draw(); };
        Grid.SetRow(next, 2); grid.Children.Add(next);
        var cancellation = ShowOverlay("Notifications", grid, width: 420);
        notificationsChanged += Draw;
        appearanceChanged += Draw;
        grid.Unloaded += (_, _) => { notificationsChanged -= Draw; appearanceChanged -= Draw; };
        Draw();
        await RefreshNotifications(cancellation);

        void Draw()
        {
            allButton.Style = Ui.Style(notificationUnreadOnly ? "NovaQuiet" : "NovaPrimary");
            unreadButton.Style = Ui.Style(notificationUnreadOnly ? "NovaPrimary" : "NovaQuiet");
            var unreadCount = notificationPage.Number("unreadCount");
            unreadButton.Content = unreadCount > 0 ? $"Unread ({unreadCount})" : "Unread";
            var hasMore = pageNumber < notificationPage.Number("totalPages");
            var items = notificationPage.Items("data").Concat(additional).DistinctBy(item => item.Id())
                .Where(item => !notificationUnreadOnly || !item.Flag("isRead")).Select(PresentNotification).ToArray();
            list.ShowItems(items);
            empty.Text = notificationUnreadOnly
                ? hasMore && unreadCount > 0 ? "Load more to see earlier unread notifications." : "You’re all caught up."
                : "No notifications yet.";
            empty.Visibility = items.Length == 0 ? Visibility.Visible : Visibility.Collapsed;
            next.Visibility = hasMore ? Visibility.Visible : Visibility.Collapsed;
        }
    }

    private NotificationCard PresentNotification(JsonElement item)
    {
        var type = item.Text("type");
        var (category, glyph) = type switch
        {
            "TASK_OVERDUE" => ("Task is late", "\uE7BA"),
            "SUBSCRIPTION_CHARGE_SOON" => ("Renews soon", "\uE823"),
            "TASK_DUE_REMINDER" => ("Due soon", "\uE823"),
            "SUBTASK_DUE_REMINDER" => ("Subtask due soon", "\uE823"),
            "WHITEBOARD_MEMBER_ADDED" => ("Added to board", "\uE929"),
            "WHITEBOARD_ROLE_CHANGED" => ("Board role updated", "\uE929"),
            "WHITEBOARD_MEMBER_REMOVED" => ("Removed from board", "\uE929"),
            "WHITEBOARD_COMMENT_MENTION" => ("Mentioned on board", "\uE910"),
            "TASK_COMMENT_MENTION" => ("Mentioned in comment", "\uE910"),
            "TASK_COMMENT_REPLY" => ("Comment reply", "\uE8BD"),
            "TASK_COMMENT_STATUS_CHANGED" => ("Comment updated", "\uE8BD"),
            "PROJECT_SUGGESTION_MENTION" => ("Mentioned in idea", "\uE910"),
            "PROJECT_SUGGESTION_CONVERTED" => ("Idea became a task", "\uE9D5"),
            "PROJECT_MEMBER_ADDED" => ("Added to project", "\uE716"),
            "PROJECT_TEAM_MEMBER_ADDED" => ("New teammate", "\uE716"),
            "PROJECT_MEMBER_REMOVED" => ("Removed from project", "\uE716"),
            "TASK_DONE" => ("Task completed", "\uE73E"),
            "SUBTASK_DONE" => ("Subtask completed", "\uE73E"),
            "ADMIN_BROADCAST" => ("Announcement", "\uE789"),
            "ADMIN_SUPPORT_URGENT" => ("Urgent support ticket", "\uE789"),
            _ => (type.Length == 0 ? "Workspace" : System.Globalization.CultureInfo.InvariantCulture.TextInfo.ToTitleCase(type.Replace('_', ' ').ToLowerInvariant()), "\uE7ED")
        };
        var warning = type is "TASK_OVERDUE" or "SUBSCRIPTION_CHARGE_SOON" || type.EndsWith("_DUE_REMINDER", StringComparison.Ordinal);
        var done = type is "TASK_DONE" or "SUBTASK_DONE";
        var unread = !item.Flag("isRead");
        var color = Ui.Rgb(warning ? settings.Light ? 0x8e4a0du : 0xf0b66bu
            : done ? settings.Light ? 0x286048u : 0x8cccadu
            : unread ? settings.Light ? 0x9a4a0fu : 0xf7904bu
            : settings.Light ? 0x65584fu : 0xb4aaa4u);
        var outline = new SolidColorBrush(Microsoft.UI.ColorHelper.FromArgb(unread ? (byte)110 : (byte)48, color.R, color.G, color.B));
        return new(item, item.Text("title", "Notification"), item.Text("message"), category,
            RelativeTime(item.Text("createdAt")), NotificationDay(item.Text("createdAt")), glyph, unread,
            new SolidColorBrush(color), outline);
    }

    private static string NotificationDay(string value)
    {
        if (!DateTimeOffset.TryParse(value, out var created)) return "Earlier";
        var date = created.LocalDateTime.Date;
        if (date == DateTime.Today) return "Today";
        if (date == DateTime.Today.AddDays(-1)) return "Yesterday";
        return date.ToString(date.Year == DateTime.Today.Year ? "MMM d" : "MMM d, yyyy");
    }

    private static string RelativeTime(string value)
    {
        if (!DateTimeOffset.TryParse(value, out var date)) return "";
        var age = DateTimeOffset.Now - date;
        if (age.TotalMinutes < 1) return "Just now";
        if (age.TotalHours < 1) return $"{(int)age.TotalMinutes}m ago";
        if (age.TotalDays < 1) return $"{(int)age.TotalHours}h ago";
        return $"{(int)age.TotalDays}d ago";
    }

    private async Task OpenNotificationFromToast(string arguments)
    {
        if (string.IsNullOrWhiteSpace(arguments)) { await ShowNotifications(); return; }
        var fields = new Windows.Foundation.WwwFormUrlDecoder(arguments);
        var id = fields.FirstOrDefault(field => field.Name == "notification")?.Value ?? "";
        var inbox = fields.FirstOrDefault(field => field.Name == "inbox")?.Value;
        if (Guid.TryParse(id, out _) && (inbox is null || inbox == new NotificationDelivery(api.Endpoint, user.Id()).Group))
        {
            var cancellation = background?.Token ?? CancellationToken.None;
            try
            {
                if (!notificationPage.Items("data").Any(row => row.Id() == id))
                    await RefreshNotifications(cancellation);
                var item = notificationPage.Items("data").FirstOrDefault(row => row.Id() == id);
                var ticks = fields.FirstOrDefault(field => field.Name == "created")?.Value;
                if (item.Id().Length == 0 && long.TryParse(ticks, out var created) && created > 0)
                {
                    var window = notificationPage;
                    var lastPage = window.Number("totalPages");
                    for (var page = 2; page <= lastPage && window.Items("data").Any(row =>
                        DateTimeOffset.TryParse(row.Text("createdAt"), out var time) && time.UtcTicks >= created); page++)
                    {
                        window = await api.GetFresh($"/api/device-tokens/notifications?page={page}&limit=30", cancellation);
                        item = window.Items("data").FirstOrDefault(row => row.Id() == id);
                        if (item.Id().Length > 0) break;
                    }
                }
                if (item.Id().Length > 0) { await NotificationDetails(item); return; }
            }
            catch (IOException) { }
        }
        await ShowNotifications();
    }

    private async Task NotificationDetails(JsonElement item)
    {
        var view = PresentNotification(item);
        var category = Ui.Text(view.Category);
        category.Foreground = view.Tone;
        var state = Ui.Subtitle(view.Unread ? "Unread" : "Read");
        var date = item.Text("createdAt");
        var body = Ui.Stack(Ui.Button("Back to notifications", ShowNotifications), Ui.Card(Ui.Stack(
            Ui.Wrap(new FontIcon { Glyph = view.Glyph, Foreground = view.Tone, FontSize = 17 }, category, state),
            Ui.Text(view.Message), Ui.Subtitle(DateTimeOffset.TryParse(date, out var at) ? at.LocalDateTime.ToString("f") : view.Time))));
        if (NotificationDestination(item) is { } destination)
            body.Children.Add(ActionButton(destination.Label, destination.Open, true));
        Drawer(item.Text("title", "Notification"), body, width: 420);
        if (view.Unread)
        {
            var cancellation = overlayCancellation.Token;
            var result = await api.Patch("/api/device-tokens/notifications/read", new { notificationId = item.Id() }, cancellation);
            if (result.Number("count") > 0) state.Text = "Read";
            await RefreshNotifications(cancellation);
        }
    }

    private (string Label, Func<Task> Open)? NotificationDestination(JsonElement item)
    {
        var data = item.Field("metadata");
        var kind = item.Text("type");
        var task = data.Text("taskId");
        var project = data.Text("projectId");
        var board = data.Text("whiteboardId");
        var subscription = data.Text("subscriptionId");
        var url = data.Text("url");
        Uri? route = null;
        if (url.StartsWith('/') && !url.StartsWith("//") && !url.Contains('\\'))
            Uri.TryCreate(new Uri("https://nova.invalid"), url, out route);
        var parts = route?.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries) ?? [];
        var query = route is not null && route.Query.Length > 1 ? new Windows.Foundation.WwwFormUrlDecoder(route.Query) : null;
        string Parameter(string name) => query?.FirstOrDefault(field => field.Name == name)?.Value ?? "";

        if (kind == "ADMIN_SUPPORT_URGENT" && IsAdmin)
        {
            var ticket = data.Text("ticketId", Parameter("ticket"));
            return ("Open ticket", () => OpenSupportTicket(ticket));
        }

        if (kind is "WHITEBOARD_DELETED" or "WHITEBOARD_MEMBER_REMOVED") return ("Open whiteboards", () => Go("Whiteboard"));
        if (kind == "PROJECT_MEMBER_REMOVED") return ("Open projects", () => Go("Projects"));
        if (kind == "PROJECT_SUGGESTION_CONVERTED" && task.Length > 0) return ("Open task", () => TaskDrawer(task));
        if (kind.StartsWith("PROJECT_SUGGESTION", StringComparison.Ordinal) && project.Length > 0)
            return ("Open ideas", async () =>
            {
                await Go("Project", project);
                if (RouteMatches("Project", project))
                    await Suggestions(await api.Get("/api/projects/" + Ui.PathId(project), viewCancellation.Token));
            });

        if (subscription.Length == 0 && (kind.StartsWith("SUBSCRIPTION_", StringComparison.Ordinal) || parts is ["subscriptions"]))
            subscription = Parameter("id");
        if (task.Length > 0) return ("Open task", () => TaskDrawer(task));
        if (board.Length > 0) return ("Open whiteboard", () => Go("Board", board));
        if (subscription.Length > 0) return ("Open subscription", () => SubscriptionDetails(subscription));
        if (project.Length > 0) return ("Open project", () => Go("Project", project));
        if (kind.StartsWith("SUBSCRIPTION_", StringComparison.Ordinal)) return ("Open subscriptions", () => Go("Subscriptions"));
        if (kind.StartsWith("WHITEBOARD_", StringComparison.Ordinal)) return ("Open whiteboards", () => Go("Whiteboard"));
        var linkedTask = Parameter("task");
        return parts switch
        {
            ["dashboard"] => ("Open dashboard", () => Go("Dashboard")),
            ["projects"] => ("Open projects", () => Go("Projects")),
            ["projects", var id] when Guid.TryParse(id, out _) && Guid.TryParse(linkedTask, out _) =>
                ("Open task", async () => { await Go("Project", id); if (RouteMatches("Project", id)) await TaskDrawer(linkedTask); }),
            ["projects", var id] when Guid.TryParse(id, out _) => ("Open project", () => Go("Project", id)),
            ["whiteboard"] => ("Open whiteboards", () => Go("Whiteboard")),
            ["whiteboard", var id] when Guid.TryParse(id, out _) => ("Open whiteboard", () => Go("Board", id)),
            ["notes"] => ("Open notes", () => Go("Notes")),
            ["notes", var id] when Guid.TryParse(id, out _) => ("Open note", () => Go("Note", id)),
            ["timeline"] => ("Open timeline", () => Go("Timeline")),
            ["subscriptions"] => ("Open subscriptions", () => Go("Subscriptions")),
            ["admin", "support"] when IsAdmin => ("Open support inbox", () => OpenSupportTicket(Parameter("ticket"))),
            _ => null
        };

        async Task OpenSupportTicket(string ticket)
        {
            await Go("Administration", "Support");
            if (RouteMatches("Administration", "Support") && Guid.TryParse(ticket, out _))
                await AdminTicket(JsonSerializer.SerializeToElement(new { id = ticket }));
        }
    }

    private bool RouteMatches(string destination, string id) => route == destination && routeId == id;
}
