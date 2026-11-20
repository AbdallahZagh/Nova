#if DEBUG
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using NovaTaskflow.Api;
using NovaTaskflow.Auth;
using NovaTaskflow.Controls;
using NovaTaskflow.ViewModels;
using System.Diagnostics;
using System.Net;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Runtime.InteropServices;
using System.Text.Json;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow
{
    internal async Task Smoke(string report, bool hosted, bool inspect)
    {
        var steps = new List<string>();
        var failure = "";
        NovaSmokeServer? fixture = null;
        try
        {
            if (!hosted)
            {
                fixture = new NovaSmokeServer();
                settings.Server = fixture.Origin;
                api.SetSession(null, null, fixture.Origin);
            }
            settings.StartupConfigured = true;
            settings.Save();
            await Start(false);
            await Task.Delay(240);
            Check(AuthPane.Visibility == Visibility.Visible && Root.ActualWidth > 0, "Native sign-in rendered");
            Check(WindowsPush.IsInboxSignal("nova-inbox"u8.ToArray()) && !WindowsPush.IsInboxSignal("test"u8.ToArray()),
                "Windows push accepts only the Nova inbox wake signal");
            if (inspect && hosted)
            {
                ToastBar.IsOpen = false;
                await Capture("signin");
            }
            Check(tray is not null, "Windows tray handler initialized");
            if (fixture is not null)
            {
                HideNova();
                PostMessage(handle, 0x0312, 2, 0);
                await Task.Delay(220);
                Check(stickyPickerWindow is { Visible: true } && !native.IsVisible,
                    "The sticky hotkey leaves the sign-in window hidden");
                CloseStickyPicker();
                ShowNova();
                await TestAccountFlows(fixture);
            }
            if (fixture is not null) QueueNotification("notification=" + NovaSmokeServer.NotificationId);
            await LoginDemo();
            if (fixture is not null)
            {
                await Task.Delay(180);
                Check(pendingNotification is null && Overlay.Visibility == Visibility.Visible &&
                    Descendants(OverlayContent).OfType<TextBlock>().Any(label => label.Text == "Workspace update"),
                    "A notification arriving during cold startup opens its specific drawer after sign-in");
                Check(fixture.NotificationReads == 1, "Opening notification details marks the item as read");
                await CloseOverlay();
                await ShowDemoTour();
            }
            await Task.Delay(180);
            Check(Descendants(OverlayContent).OfType<TextBlock>().Any(label => label.Text == "Explore the Nova workspace"), "Native demo tour opens on the first step");
            await Invoke("Next");
            Check(Descendants(OverlayContent).OfType<TextBlock>().Any(label => label.Text == "Run a project"), "Demo tour advances through the workspace features");
            await CloseOverlay();
            Check(settings.DemoTourSeen, "Dismissing the demo tour remembers the choice");
            Check(SignedIn && Demo && route == "Dashboard" && PageFrame.Content is WorkspacePage { Body: ScrollViewer }, "Demo sign-in opened the real dashboard");
            Check(AdminLink.Visibility == Visibility.Collapsed, "Demo has no Administration entry");
            Check(SessionVault.Read(VaultKey(user.Id())) is { Length: > 0 }, "Access token persisted to PasswordVault");
            Check(!File.ReadAllText(Path.Combine(DesktopSettings.AppFolder, "settings.json")).Contains(
                SessionVault.Read(VaultKey(user.Id()))!, StringComparison.Ordinal), "Settings contain no token");
            StopBackground();
            foreach (var destination in new[] { "Projects", "Timeline", "Subscriptions", "Notes", "Profile", "Settings", "Whiteboard" })
            {
                ToastBar.IsOpen = false;
                await Go(destination);
                Check(PageFrame.Content is WorkspacePage { Body: not null } &&
                    !(ToastBar.IsOpen && ToastBar.Severity == InfoBarSeverity.Error), destination + " loaded");
                if (destination == "Subscriptions")
                {
                    Check(!((WorkspacePage)PageFrame.Content).ActionItems.OfType<Button>().Any(button =>
                        (string?)button.Content == "Add subscription"), "Demo subscription actions hidden");
                    if (fixture is not null)
                    {
                        await Task.Delay(200);
                        Check(Descendants(PageFrame).OfType<TextBlock>().Any(control => control.Text == "Due soon"),
                            "Subscriptions display the due-soon group");
                    }
                }
            }

            if (fixture is not null)
            {
                await Go("Dashboard");
                await Task.Delay(180);
                Check(Descendants(PageFrame).OfType<TextBlock>().Any(text => text.Text == "Urgent tasks") &&
                    Descendants(PageFrame).OfType<TextBlock>().Any(text => text.Text.Contains("High · Today", StringComparison.Ordinal)),
                    "Dashboard displays urgent task priority and due label from the shared API");
                await TestGroupedSearch();
                ToastBar.IsOpen = false;
                fixture.AddNotification("Renewal reminder", type: "SUBSCRIPTION_CHARGE_SOON");
                await RefreshNotifications(CancellationToken.None);
                Check(ToastBar.IsOpen && ToastBar.Title == "Renewal reminder" && ToastBar.ActionButton is Button { Content: "Open" },
                    "A new unread item raises an actionable in-app notification while the workspace is visible");
                ToastBar.IsOpen = false;
                await ShowNotifications();
                await Task.Delay(240);
                Check(Descendants(OverlayContent).OfType<TextBlock>().Any(text => text.Text == "Today") &&
                    Descendants(OverlayContent).OfType<Button>().Any(button => Equals(button.Content, "Unread (1)")) &&
                    Descendants(OverlayContent).OfType<TextBlock>().Any(text => text.Text == "Renews soon"),
                    "Notifications show category cards, day groups and the unread count");
                if (inspect) await Capture("notifications");
                var older = DateTimeOffset.UtcNow.AddHours(-2);
                var olderId = fixture.AddNotification("Earlier actionable notification", at: older);
                for (var i = 0; i < 31; i++) fixture.AddNotification("Read notification", read: true);
                await OpenNotificationFromToast($"notification={olderId}&created={older.UtcTicks}");
                await Task.Delay(180);
                Check(fixture.NotificationReads == 2 && Descendants(OverlayContent).OfType<TextBlock>()
                    .Any(label => label.Text == "Earlier actionable notification"),
                    $"A Windows toast opens and reads an earlier notification from a later inbox page (read {fixture.NotificationReads})");
                var announcement = JsonSerializer.SerializeToElement(new
                {
                    type = "ADMIN_BROADCAST", metadata = new { url = $"/projects/{fixture.ProjectId}?task={fixture.TaskId}" }
                });
                Check(NotificationDestination(announcement) is { Label: "Open task" },
                    "An announcement project link recognizes the task destination");
                await CloseOverlay();
                async Task OpenMetric(string name, string destination)
                {
                    var metric = Descendants(PageFrame).OfType<Button>().Single(button =>
                        Microsoft.UI.Xaml.Automation.AutomationProperties.GetName(button).StartsWith(name + ", ", StringComparison.Ordinal));
                    await InvokeControl(metric);
                    Check(await WaitUntil(() => route == destination && PageFrame.Content is WorkspacePage { Body: not null }),
                        $"Dashboard {name} tile opens {destination}");
                    await Go("Dashboard");
                    await Task.Delay(100);
                }
                await OpenMetric("Tasks due today", "Timeline");
                await OpenMetric("Active projects", "Projects");
                await OpenMetric("Due in 30 days", "Subscriptions");
                await Go("Timeline");
                await Task.Delay(180);
                Check(PageFrame.Content is WorkspacePage { Body: Grid timeline } &&
                    timeline.Children.OfType<TimelineCalendar>().Any(),
                    "Timeline renders a calendar with direct day targets");
                await InvokeControl(((WorkspacePage)PageFrame.Content).ActionItems.OfType<Button>().Single(button => Equals(button.Content, "Gantt")));
                await Task.Delay(180);
                Check(Descendants(PageFrame).OfType<ListView>().Single().ItemsSource is ICollectionView timelineGroups &&
                    timelineGroups.CollectionGroups.Count > 0 &&
                    Descendants(PageFrame).OfType<GanttTrack>().Any(), "Gantt groups project entries and shows their colored bars");
                if (inspect) await Capture("timeline-gantt");
                await InvokeControl(((WorkspacePage)PageFrame.Content).ActionItems.OfType<Button>().Single(button => Equals(button.Content, "Agenda")));
                await Task.Delay(220);
                var agendaCards = Descendants(PageFrame).OfType<ListView>().Single().ItemsSource as ICollectionView;
                var today = agendaCards?.CollectionGroups.Cast<ICollectionViewGroup>().Select(group => group.Group).OfType<AgendaDay>().SingleOrDefault();
                Check(PageFrame.Content is WorkspacePage { Body: TimelineAgenda } && today is not null &&
                    today.Count == 2 && today.Any(item => item.Status == "Subscription") && today.Any(item => item.Status == "To Do"),
                    "Agenda groups subscription charges and tasks by due date");
                if (inspect) await Capture("timeline-agenda");
                var timelineStatus = Descendants(PageFrame).OfType<ComboBox>().Single(combo =>
                    Microsoft.UI.Xaml.Automation.AutomationProperties.GetName(combo) == "Task status filter");
                timelineStatus.SelectedItem = "Completed";
                await Task.Delay(130);
                var filteredAgenda = (ICollectionView)Descendants(PageFrame).OfType<ListView>().Single().ItemsSource;
                Check(filteredAgenda.Cast<AgendaEntry>().Select(item => item.Status).SequenceEqual(["Subscription"]),
                    "Timeline task status filtering preserves matching subscription charges");
                await Go("Dashboard");
                var expandedSize = native.Size;
                native.Resize(new Windows.Graphics.SizeInt32(648, 503));
                await Task.Delay(300);
                Check(Root.ActualWidth < 680 && RailColumn.Width.Value < 80 && RailSurface.ActualWidth > 40 && BrandName.Visibility == Visibility.Collapsed,
                    "Windows resize activates the compact navigation rail");
                var iconsFit = Descendants(Navigation).OfType<FontIcon>().All(icon =>
                {
                    var bounds = icon.TransformToVisual(Root).TransformBounds(new Windows.Foundation.Rect(0, 0, icon.ActualWidth, icon.ActualHeight));
                    return bounds.Left >= 0 && bounds.Right < RailColumn.Width.Value && bounds.Width >= 9;
                });
                Check(iconsFit, "Compact navigation icons fit within their rail");
                foreach (var destination in new[] { "Dashboard", "Notes", "Timeline", "Subscriptions", "Profile" })
                {
                    await Go(destination);
                    await Task.Delay(100);
                    var viewport = Descendants(PageFrame).OfType<ContentControl>().FirstOrDefault(control => control.Name == "ContentHost");
                    Check(PageFrame.Content is WorkspacePage { Body: FrameworkElement body } && body.ActualWidth > 300 &&
                        viewport?.ActualHeight > 125, $"{destination} remains usable at compact size");
                    if (destination == "Profile")
                        Check(Descendants(PageFrame).OfType<TextBlock>().Any(item => item.Text.Contains("2/3 tasks", StringComparison.Ordinal)),
                            "Profile shows project membership and assigned task progress");
                }
                await Go("Dashboard");
                if (inspect) await Capture("compact");
                await Go("Projects");
                await Task.Delay(240);
                var projectCards = Descendants(PageFrame).OfType<GridView>().Single();
                var optionsButton = Descendants(projectCards).OfType<Button>().Single(button =>
                    Microsoft.UI.Xaml.Automation.AutomationProperties.GetName(button) == "Project options");
                Check(projectCards.ItemsPanelRoot is ItemsWrapGrid && optionsButton.ActualWidth >= 24 &&
                    Descendants(projectCards).OfType<ProgressBar>().Any(bar => bar.Value == 50) &&
                    Descendants(projectCards).OfType<PersonPicture>().Any(avatar => avatar.DisplayName == "Fixture Owner"),
                    "Compact project cards show owner, progress, and a visible options button");
                var projectPage = (WorkspacePage)PageFrame.Content;
                var projectLibrary = projectPage.Body;
                var projectSearch = Descendants(PageFrame).OfType<TextBox>().Single(box => box.PlaceholderText == "Find a project");
                projectSearch.Text = "nonexistent project";
                await Task.Delay(120);
                Check(projectPage.Body is Border && projectCards.ItemsSource is ProjectCard[] { Length: 0 },
                    "Project search filters the card grid");
                projectSearch.Text = "rollout";
                await Task.Delay(120);
                Check(ReferenceEquals(projectPage.Body, projectLibrary) && projectCards.ItemsSource is ProjectCard[] { Length: 1 },
                    "Project search restores matching cards after the empty state");
                if (inspect) await Capture("projects-compact");
                await Go("Project", fixture.ProjectId);
                Check(PageFrame.Content is WorkspacePage { Body: ScrollViewer { Content: Grid } }, "Project board loaded scrollable lanes");
                await Task.Delay(120);
                var projectMenu = Descendants(PageFrame).OfType<Button>().Single(button =>
                    Microsoft.UI.Xaml.Automation.AutomationProperties.GetName(button) == "Project menu");
                Check(projectMenu.Visibility == Visibility.Visible && ((ScrollViewer)((WorkspacePage)PageFrame.Content).Body!).ActualHeight >= 180 &&
                    projectMenu.Flyout is MenuFlyout projectFlyout && projectFlyout.Items.OfType<MenuFlyoutItem>().Any(item => item.Text == "Members"),
                    "Compact board leaves room for tasks and keeps project actions in reach");
                if (inspect) await Capture("kanban-compact");
                var laneAdd = Descendants(PageFrame).OfType<Button>().Single(button =>
                    Microsoft.UI.Xaml.Automation.AutomationProperties.GetName(button) == "New task in In Review");
                await InvokeControl(laneAdd);
                await Task.Delay(140);
                Check(Descendants(OverlayContent).OfType<ComboBox>().Single(combo => Equals(combo.Header, "Status")).Selected() == "In Review",
                    "Creating from a board column opens the task form with that status");
                await CloseOverlay();
                await TaskDrawer(fixture.TaskId);
                Check(Overlay.Visibility == Visibility.Visible && !Descendants(OverlayContent).OfType<Button>()
                    .Any(button => (string?)button.Content == "Suggest an update"), "Demo task drawer hides AI");
                await CloseOverlay();
                await Suggestions(await api.Get($"/api/projects/{fixture.ProjectId}"));
                await Task.Delay(160);
                var suggestionButtons = Descendants(OverlayContent).OfType<Button>().Select(button => button.Content?.ToString()).ToArray();
                Check(suggestionButtons.Contains("Edit") && suggestionButtons.Contains("Delete") && suggestionButtons.Contains("Turn into task"),
                    "Project owner can edit, remove, or convert an idea");
                await CloseOverlay();
                await Go("Whiteboard", fixture.ProjectId);
                await Task.Delay(180);
                Check(PageFrame.Content is WorkspacePage { Body: BoardLibrary } && fixture.ProjectBoardsRead,
                    "Whiteboards renders project-scoped cards using the project endpoint");
                if (inspect) await Capture("boards-compact");
                native.Resize(new Windows.Graphics.SizeInt32(1040, 660));
                await Task.Delay(190);
                Check(Root.ActualWidth >= 990 && RailColumn.Width.Value >= 200 && BrandName.Visibility == Visibility.Visible, "Widening the same window restores full navigation");
                native.Resize(expandedSize);
                await Task.Delay(150);
                await Go("Board", fixture.BoardId);
                Check(PageFrame.Content is WorkspacePage { Body: Border { Child: BoardCanvas } }, "Whiteboard loaded its native drawing surface");
                var surface = (BoardCanvas)((Border)((WorkspacePage)PageFrame.Content).Body!).Child;
                double zoom = 1;
                surface.ZoomChanged += value => zoom = value;
                await Task.Delay(160);
                surface.FitPage();
                await Task.Delay(380);
                Check(zoom < 1, "Fit control zooms the whiteboard to the viewport");
                var peerCursor = new NovaTaskflow.Live.BoardPresence("fixture-peer", "Reader", "#E66A17", "web", 40, 50);
                surface.ShowPeer(peerCursor);
                Check(Descendants(surface).OfType<Canvas>().Single(panel => panel.Name == "PeerLayer").Children.Count == 1,
                    "Collaborator cursors render above the whiteboard drawing");
                surface.KeepPeers([]);
                Check(Descendants(surface).OfType<Canvas>().Single(panel => panel.Name == "PeerLayer").Children.Count == 0,
                    "Disconnected collaborators leave no cursor behind");
                var snapshot = WhiteboardSnapshot.Create(JsonSerializer.SerializeToElement(new
                {
                    canvas = new { width = 2400, height = 1200 },
                    strokes = new[] { new { color = "#e66a17", tool = "pen", width = 6, points = new[] { new { x = 40, y = 60 } } } }
                }), dark: true);
                Check(snapshot.Width == 1600 && snapshot.Height == 800 &&
                    snapshot.Bytes.AsSpan(1, 3).SequenceEqual("PNG"u8), "Whiteboard preview generates a scaled PNG");
                await Go("Notes");
                Check(PageFrame.Content is WorkspacePage { Body: not Border { Child: BoardCanvas } }, "Whiteboard visual tree unloaded");
                await Go("Note", "new");
                var draft = editingNote!;
                draft.Set(draft.Value with { Title = "Smoke note" }, false, "title");
                draft.Set(draft.Value with { Body = "Autosave on Windows" }, false, "body");
                Check(await WaitUntil(() => !draft.Dirty) && draft.Value.Id == fixture.NoteId && fixture.Creates == 1,
                    "Note autosave combined edits into one create");
                draft.Set(draft.Value with { Body = "Keep local typing" }, false, "body");
                draft.Remote(draft.Value with { Body = "Remote edit", UpdatedAt = DateTimeOffset.Now.AddMinutes(1) });
                Check(draft.Value.Body == "Keep local typing", "Remote note update preserves pending typing");
                await draft.Flush();
                fixture.RemoteEdit("Synced from another device");
                await NoteBroadcast(JsonSerializer.SerializeToElement(new { kind = "saved", note = new { id = fixture.NoteId } }), CancellationToken.None);
                Check(draft.Value.Body == "Synced from another device", "Remote note event updates a clean editor via authenticated GET");
                var noteWorkspace = (NoteWorkspace)((WorkspacePage)PageFrame.Content).Body!;
                foreach (var tone in ColorsByNote)
                {
                    var swatch = Descendants(PageFrame).OfType<Button>().Single(button =>
                        Microsoft.UI.Xaml.Automation.AutomationProperties.GetName(button) == tone.Label);
                    await InvokeControl(swatch);
                    await draft.Flush();
                    var saved = await api.Get("/api/notes/" + fixture.NoteId);
                    Check(noteWorkspace.Paper.Background is SolidColorBrush paper &&
                          paper.Color == Ui.Rgb(settings.Light ? tone.Light : tone.Dark) && saved.Text("color") == tone.Value,
                        $"{tone.Label} colours the writing paper and persists through the Notes API");
                }
                await draft.Flush();
                draft.Set(draft.Value with
                {
                    Title = "Release checklist",
                    Body = "Bring the desktop, web and mobile note editors together.",
                    Checklist = Enumerable.Range(1, 13).Select(index => new ChecklistItem($"qa-{index}", $"Review item {index}", index <= 7)).ToArray()
                }, false, "title", "body", "checklist");
                await draft.Flush();
                var noteBody = Descendants(noteWorkspace).OfType<TextBox>().Single(box => box.PlaceholderText == "Start writing…");
                Check(noteBody.Background is SolidColorBrush textBackground && textBackground.Color.A == 0 &&
                      Descendants(noteWorkspace).OfType<TextBlock>().Count(text => text.TextDecorations == Windows.UI.Text.TextDecorations.Strikethrough &&
                          text.Visibility == Visibility.Visible) == 7, "Writing fields are transparent and completed items render struck through");
                if (inspect) await Capture("note-editor-dark");
                FlipTheme();
                await Task.Delay(150);
                Check(noteWorkspace.Paper.Background is SolidColorBrush lightPaper && lightPaper.Color == Ui.Rgb(ColorsByNote[^1].Light),
                    "Changing theme recolours the open note without reopening or dropping edits");
                if (inspect) await Capture("note-editor-light");
                FlipTheme();
                var desktopSize = native.Size;
                native.Resize(new Windows.Graphics.SizeInt32(645, 510));
                await Task.Delay(300);
                var bodyField = Descendants(noteWorkspace).OfType<TextBox>().Single(box => box.PlaceholderText == "Start writing…");
                Check(ReferenceEquals(noteBody, bodyField) && bodyField.ActualWidth > 350 && bodyField.Text == draft.Value.Body,
                    "The note editor stacks at compact widths and keeps the same writing field and draft");
                if (inspect) await Capture("note-editor-compact");
                await TestNoteLineBreak(bodyField, draft, true);
                native.Resize(desktopSize);
                await Task.Delay(300);
                draft.Set(draft.Value with { Title = "Smoke note", Body = "Synced from another device", Color = "AMBER", Checklist = [] },
                    false, "title", "body", "color", "checklist");
                await draft.Flush();
                fixture.RemoteEdit("Synced from another device", floating: true);
                await NoteBroadcast(JsonSerializer.SerializeToElement(new { kind = "saved", note = new { id = fixture.NoteId } }), CancellationToken.None);
                await RefreshNotes(CancellationToken.None);
                Check(draft.Value.Floating && floating.Count == 0,
                    "A remote floating flag and a background refresh leave the Windows sticky closed");
                settings.RestoreStickies = false;
                await RefreshNotes(CancellationToken.None, restore: true);
                Check(floating.Count == 0, "The restore setting blocks automatic startup windows");
                settings.RestoreStickies = true;
                await Go("Notes");
                Check(await WaitUntil(() => editingNote is null) && floating.Count == 0,
                    "Leaving a remotely floated note does not open it on Windows");
                await RefreshNotes(CancellationToken.None, restore: true);
                Check(floating.Count == 1, "Startup restores already-floating notes from the verified list once");
                await floating[draft].Window.Dismiss();
                await Go("Note", fixture.NoteId);
                await Task.Delay(220);
                var stickyOption = Descendants(((WorkspacePage)PageFrame.Content).Body!).OfType<ToggleSwitch>().Single(toggle =>
                    Microsoft.UI.Xaml.Automation.AutomationProperties.GetName(toggle) == "Keep on screen");
                stickyOption.IsOn = true;
                await draft.Flush();
                Check(draft.Value.Floating && floating.Count == 0, "Keep on screen saves without opening a second editor");
                await Go("Notes");
                await Task.Delay(180);
                Check(PageFrame.Content is WorkspacePage { Body: NoteLibrary }, "Notes library displays cards");
                if (inspect) await Capture("notes");
                Check(floating.Count == 1 && fixture.Floating, "Leaving the note opens its sticky and keeps the synced setting");
                var window = floating[draft].Window;
                Check(window.AppWindow.Id != native.Id && window.AlwaysOnTop && window.Visible, "Sticky is a separate native always-on-top window");
                var stickyBody = Descendants(window.Chrome).OfType<TextBox>().Single(box => box.PlaceholderText == "Start writing…");
                await TestNoteLineBreak(stickyBody, draft, false);
                HideNova();
                Check(!native.IsVisible && window.Visible, "A sticky stays visible with the Nova workspace hidden");
                PostMessage(handle, 0x0312, 2, 0);
                await Task.Delay(380);
                Check(stickyPickerWindow is { Visible: true } && !native.IsVisible &&
                    stickyPickerWindow.AppWindow.Id != native.Id, "Global hotkey handler opens only the native sticky picker");
                var pickerId = stickyPickerWindow!.AppWindow.Id;
                PostMessage(handle, 0x0312, 2, 0);
                await Task.Delay(220);
                Check(stickyPickerWindow is { Visible: true } && stickyPickerWindow.AppWindow.Id == pickerId,
                    "Repeated shortcut focuses the same picker instead of closing it");
                if (inspect)
                {
                    await Capture("picker", stickyPickerWindow!.Chrome);
                    await Capture("sticky", window.Chrome);
                }
                CloseStickyPicker();
                var peer = new Window();
                peer.Content = new TextBlock { Text = "Another working window" };
                peer.AppWindow.MoveAndResize(new Windows.Graphics.RectInt32(window.AppWindow.Position.X, window.AppWindow.Position.Y,
                    window.AppWindow.Size.Width, window.AppWindow.Size.Height));
                peer.AppWindow.Show(false);
                try
                {
                    var top = Microsoft.UI.Win32Interop.GetWindowFromWindowId(window.AppWindow.Id);
                    var other = Microsoft.UI.Win32Interop.GetWindowFromWindowId(peer.AppWindow.Id);
                    Check(IsAbove(top, other), "Sticky stays above a normal overlapping Windows window");
                    window.SetAlwaysOnTop(false);
                    Check(!window.AlwaysOnTop, "Always-on-top can be disabled per sticky");
                    window.SetAlwaysOnTop(true);
                }
                finally { peer.Close(); }
                var initialHeight = window.AppWindow.Size.Height;
                window.SetCollapsed(true);
                await Task.Delay(80);
                Check(window.Collapsed && window.AppWindow.Size.Height < initialHeight, "Sticky collapses to a compact header");
                window.SetCollapsed(false);
                await Task.Delay(80);
                Check(!window.Collapsed && window.AppWindow.Size.Height == initialHeight,
                    $"Expanding a sticky restores its height ({window.AppWindow.Size.Height}/{initialHeight})");
                window.AppWindow.Resize(new Windows.Graphics.SizeInt32(window.AppWindow.Size.Width + 24, initialHeight + 22));
                await Task.Delay(490);
                Check(settings.StickyPlacements.TryGetValue(StickyKey(fixture.NoteId), out var placement) &&
                    placement.Height == initialHeight + 22 && placement.AlwaysOnTop, "Native sticky position and size persist locally");
                await draft.Flush();
                var syncedPlacement = NoteDocument.Read(await api.Get("/api/notes/" + fixture.NoteId));
                var expectedPlacement = window.SharedPlacement();
                Check(syncedPlacement.Width == expectedPlacement.Width && syncedPlacement.Height == expectedPlacement.Height &&
                    syncedPlacement.PosX == expectedPlacement.X && syncedPlacement.PosY == expectedPlacement.Y,
                    "Moving and resizing a sticky syncs monitor-relative geometry through the existing Notes API");
                ToggleStickyVisibility();
                Check(!window.Visible && fixture.Floating, "Hide all parks stickies without changing sync state");
                ToggleStickyVisibility();
                Check(window.Visible && !native.IsVisible, "Show all restores stickies with Nova still hidden");
                fixture.RemoteEdit("Sticky updated", floating: false);
                await NoteBroadcast(JsonSerializer.SerializeToElement(new { kind = "saved", note = new { id = fixture.NoteId } }), CancellationToken.None);
                Check(draft.Value.Body == "Sticky updated", $"Open sticky receives remote changes (pending edit: {draft.Dirty})");
                Check(window.Visible && !fixture.Floating, "Another client closing its sticky leaves the Windows window in place");
                fixture.OmitNoteFromList = true;
                await RefreshNotes(CancellationToken.None);
                Check(window.Visible && notes.ContainsKey(fixture.NoteId), "An incomplete list cannot close an existing sticky");
                fixture.OmitNoteFromList = false;
                await window.Dismiss();
                Check(!window.Visible && !fixture.Floating, "Closing a sticky clears its synced floating flag");
                await OpenSticky(fixture.NoteId);
                await Task.Delay(150);
                var reopened = floating[draft].Window;
                Check(reopened.Visible && !native.IsVisible && reopened.AppWindow.Size.Height == initialHeight + 22,
                    "Reopening a sticky restores its size without showing Nova");
                var writingBox = Descendants(reopened.Chrome).OfType<TextBox>().Single(control => control.AcceptsReturn);
                var compressedHeight = writingBox.ActualHeight;
                reopened.ResizeTo(482, 585);
                await Task.Delay(240);
                Check(writingBox.ActualHeight > compressedHeight + 50 && reopened.AppWindow.Size.Width >= 470,
                    "A larger sticky gives its editor more writing space");
                var beforeDelete = draft.Value;
                await api.Delete("/api/notes/" + fixture.NoteId);
                await NoteBroadcast(JsonSerializer.SerializeToElement(new { kind = "deleted", id = fixture.NoteId }), CancellationToken.None);
                Check(floating.Count == 0 && !notes.ContainsKey(fixture.NoteId), "Deleted note clears list and sticky");
                ApplyNote(beforeDelete);
                Check(floating.Count == 0 && !notes.ContainsKey(fixture.NoteId), "An older response cannot bring a deleted sticky back");
                ShowNova();
                try
                {
                    await api.Get("/api/admin/overview");
                    throw new InvalidOperationException("Fixture let a demo account read administration.");
                }
                catch (ApiFailure error) when (error.Status == HttpStatusCode.Forbidden)
                { Check(true, "Non-admin sign-in cannot read fixture administration"); }
                EndSession(false);
                fixture.PromoteFixtureSignIn = true;
                await Login("fixture-admin@example.com", "fixture-password");
                StopBackground();
                Check(IsAdmin && AdminLink.Visibility == Visibility.Visible, "Super Admin sign-in enables Administration");
                foreach (var screen in AdminSections)
                {
                    ToastBar.IsOpen = false;
                    await Go("Administration", screen);
                    Check(PageFrame.Content is WorkspacePage { Body: not null } &&
                        !(ToastBar.IsOpen && ToastBar.Severity == InfoBarSeverity.Error), "Administration loaded " + screen);
                }
                await Go("Administration", "AI usage");
                await Task.Delay(220);
                var aiSwitch = Descendants(PageFrame).OfType<ToggleSwitch>().Single(toggle => Equals(toggle.Header, "AI features"));
                Check(aiSwitch.IsOn && fixture.AiEnabled, "AI usage shows the workspace AI setting");
                aiSwitch.IsOn = false;
                await Task.Delay(220);
                Check(!fixture.AiEnabled && !aiSwitch.IsOn, "The AI usage switch updates the workspace setting");
                aiSwitch.IsOn = true;
                await Task.Delay(220);
                Check(fixture.AiEnabled && aiSwitch.IsOn, "The AI usage switch can restore the setting");
                if (inspect)
                {
                    await Go("Administration", "Overview");
                    await Capture("admin");
                }
                await Go("Project", fixture.ProjectId);
                await Suggestions(await api.Get("/api/projects/" + fixture.ProjectId));
                await Task.Delay(180);
                Check(Descendants(OverlayContent).OfType<HyperlinkButton>().Any(button => button.Content is TextBlock { Text: "Fixture Owner" }),
                    "Project suggestion cards link to the author profile");
                var suggestionStatus = Descendants(OverlayContent).OfType<ComboBox>().Single(combo =>
                    Microsoft.UI.Xaml.Automation.AutomationProperties.GetName(combo) == "Suggestion status");
                suggestionStatus.SelectedItem = "Rejected";
                await Task.Delay(180);
                Check(fixture.SuggestionStatus == "Rejected" && Descendants(OverlayContent).OfType<Button>()
                    .Any(button => Equals(button.Content, "Turn into task") && button.Visibility == Visibility.Collapsed),
                    "Project suggestion status saves in place and hides conversion for rejected ideas");
                if (inspect) await Capture("project-suggestions");
                await CloseOverlay();
                await TaskDrawer(fixture.TaskId);
                await Task.Delay(180);
                var activity = Descendants(OverlayContent).OfType<Expander>().Single(element => Equals(element.Header, "Task activity"));
                activity.IsExpanded = true;
                await Task.Delay(100);
                Check(Descendants(activity).OfType<TextBlock>().Any(text => text.Text == "Task created in the workspace"),
                    "Task details displays real activity records from the task contract");
                var mention = Descendants(OverlayContent).OfType<TextBlock>().SelectMany(text => text.Inlines)
                    .OfType<Microsoft.UI.Xaml.Documents.Hyperlink>().SingleOrDefault();
                Check(mention?.Inlines.OfType<Microsoft.UI.Xaml.Documents.Run>().Single().Text == "@checklist_member",
                    "Task comments render known project mentions as profile links");
                await Invoke("Close comment");
                Check(fixture.TaskCommentClosed && !Descendants(OverlayContent).OfType<Button>().Any(button => Equals(button.Content, "Reply")),
                    "Project owner can close another member’s comment and closed comments are read-only");
                if (inspect) await Capture("task-details");
                var date = Descendants(OverlayContent).OfType<CalendarDatePicker>().FirstOrDefault(field => Equals(field.Header, "Subtask date"));
                Check(date is not null, "Existing subtask shows its own date field");
                var expectedDate = DateTime.Today.AddDays(5);
                date!.Date = new DateTimeOffset(expectedDate);
                await Task.Delay(160);
                Check(fixture.SubtaskDueDate == expectedDate.ToString("yyyy-MM-dd"), "Editing the subtask date writes the subtask");
                await Invoke("Suggest an update");
                Check(fixture.AiInputIncludedOriginal, "AI suggestion request includes the existing subtask");
                await Invoke("Save");
                Check(fixture.TaskDescription == "Updated from the AI fixture" && fixture.AddedSubtasks.SequenceEqual(["Review changes"]),
                    "Task save applied the AI description and added only the new subtask");
                await TestWorkspaceSync(fixture);
                await TestOfflineNotes(fixture);
                await TestNewTaskChecklist(fixture);
                await TestInitialProjectMember(fixture);
                await TestNoteConversion(fixture);
                await TestProjectNotes(fixture);
                await Go("Profile");
                await Task.Delay(200);
                var profileLabels = Descendants(PageFrame).OfType<TextBlock>().Select(label => label.Text).ToHashSet();
                Check(profileLabels.IsSupersetOf(["Assigned tasks", "Edit profile", "Account security", "Task activity"]),
                    "Profile separates identity, editing, security and task activity in the native workspace");
                Check(Descendants(PageFrame).OfType<Button>().Any(button => Equals(button.Content, "Take photo")),
                    "Profile offers the Windows camera alongside file import");
                var cameraPicker = new Microsoft.Windows.Media.Capture.CameraCaptureUI(native.Id);
                Check(cameraPicker.PhotoSettings is not null, "Windows camera picker binds to the native profile window");
                if (inspect)
                {
                    ToastBar.IsOpen = false;
                    await Capture("profile");
                }
                using (var sample = new InMemoryRandomAccessStream())
                {
                    var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, sample);
                    var pixels = new byte[400 * 200 * 4];
                    for (var pixel = 0; pixel < pixels.Length / 4; pixel++)
                    {
                        pixels[pixel * 4 + (pixel % 400 < 200 ? 2 : 0)] = 255;
                        pixels[pixel * 4 + 3] = 255;
                    }
                    encoder.SetPixelData(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Ignore, 400, 200, 96, 96, pixels);
                    await encoder.FlushAsync();
                    sample.Seek(0);
                    var crop = new AvatarCrop();
                    await crop.Load(sample);
                    var dialog = new ContentDialog { XamlRoot = Root.XamlRoot, Title = "Frame your profile photo", Content = crop, CloseButtonText = "Cancel" };
                    var shown = dialog.ShowAsync();
                    try
                    {
                        await Task.Delay(180);
                        var horizontal = Descendants(crop).OfType<Slider>().Single(slider => Equals(slider.Header, "Horizontal position"));
                        horizontal.Value = 100;
                        await Task.Delay(90);
                        using var output = new MemoryStream(await crop.Encode());
                        var cropped = await BitmapDecoder.CreateAsync(output.AsRandomAccessStream());
                        var raw = (await cropped.GetPixelDataAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Straight,
                            new BitmapTransform(), ExifOrientationMode.IgnoreExifOrientation, ColorManagementMode.DoNotColorManage)).DetachPixelData();
                        var centre = (int)((cropped.PixelHeight / 2 * cropped.PixelWidth + cropped.PixelWidth / 2) * 4);
                        Check(cropped.PixelWidth == cropped.PixelHeight && raw[centre] > 240 && raw[centre + 2] < 15,
                            "Profile photo crop moves the selected image and encodes the square shown in the preview");
                        if (inspect) await Capture("profile-photo", crop);
                    }
                    finally { dialog.Hide(); await shown; }
                }
                await Go("Subscriptions");
                await SubscriptionDetails("sample");
                await Invoke("Pause");
                Check(fixture.SubscriptionStatus == "PAUSED", "Subscription pause persisted");
                await Invoke("Resume");
                Check(fixture.SubscriptionStatus == "ACTIVE", "Subscription resume persisted");
                Check(!Descendants(OverlayContent).OfType<Button>().Any(button => Equals(button.Content, "Mark renewed")),
                    "Subscriptions with a future charge cannot be renewed early from details");
                fixture.SubscriptionDueNow = true;
                await CloseOverlay();
                await Go("Subscriptions", refresh: true);
                await Task.Delay(180);
                Check(PageFrame.Content is WorkspacePage { Body: SubscriptionGallery } &&
                    Descendants(PageFrame).OfType<GridView>().Single().ItemsPanelRoot is ItemsWrapGrid,
                    "Subscriptions use native adaptive billing cards");
                if (inspect) await Capture("subscriptions-cards");
                var renewCard = Descendants(PageFrame).OfType<Button>().Single(button => Equals(button.Content, "Mark renewed"));
                await InvokeControl(renewCard);
                Check(fixture.SubscriptionRenewals == 1 && Overlay.Visibility == Visibility.Collapsed,
                    "Due subscription renews directly from its card");
                await Task.Delay(160);
                Check(!Descendants(PageFrame).OfType<Button>().Any(button => Equals(button.Content, "Mark renewed") && button.Visibility == Visibility.Visible),
                    "Renewing a subscription removes its due action after refreshing the charge date");
                fixture.DropSubscriptions = true;
                await SubscriptionDetails("sample");
                await Invoke("Pause");
                Check(fixture.SubscriptionStatus == "ACTIVE" && pendingChanges is [{ Method: "PATCH" }] &&
                    Descendants(OverlayContent).OfType<Button>().Any(button => Equals(button.Content, "Resume")),
                    "Offline subscription changes appear in the details and wait for sync");
                fixture.DropSubscriptions = false;
                await SyncOutbox(CancellationToken.None);
                Check(fixture.SubscriptionStatus == "PAUSED" && pendingChanges.Count == 0,
                    "Acknowledged offline subscription status clears its workspace outbox entry");
                await CloseOverlay();
                await SubscriptionForm(await api.Get("/api/subscriptions/sample"));
                await Task.Delay(150);
                var currencyField = Descendants(OverlayContent).OfType<ComboBox>().Single(field => Equals(field.Header, "Currency"));
                var customField = Descendants(OverlayContent).OfType<TextBox>().Single(field => Equals(field.Header, "Currency code"));
                Check(currencyField.Selected() == "USD" && customField.Visibility == Visibility.Collapsed,
                    "Common currencies use a preset instead of a text entry");
                currencyField.SelectedIndex = currencyField.Items.Count - 1;
                customField.Text = "sek";
                Check(customField.Visibility == Visibility.Visible, "Other currency reveals the custom code field");
                var optionalTrial = Descendants(OverlayContent).OfType<Expander>().Single(field => Equals(field.Header, "More details"));
                optionalTrial.IsExpanded = true;
                await Task.Delay(160);
                var trialDate = DateTime.Today.AddDays(7);
                Descendants(optionalTrial).OfType<CalendarDatePicker>().Single(field => Equals(field.Header, "Trial ends")).Date = new DateTimeOffset(trialDate);
                await Invoke("Save changes");
                Check(fixture.SubscriptionCurrency == "SEK" && fixture.SubscriptionTrialDate == trialDate.ToString("yyyy-MM-dd") &&
                      fixture.SubscriptionStatus == "PAUSED", "The subscription saves a custom currency and keeps its optional trial date");
                await CloseOverlay();
                await ReportAndJoin();
                await Go("Dashboard");
                fixture.DropBoardOps = true;
                await Go("Board", fixture.BoardId);
                Check(PageFrame.Content is WorkspacePage { Body: Border { Child: BoardCanvas { ReadOnly: false } } },
                    "Writable whiteboard exposes the native editing controls");
                var editor = (BoardCanvas)((Border)((WorkspacePage)PageFrame.Content).Body!).Child;
                var editorSize = native.Size;
                native.Resize(new Windows.Graphics.SizeInt32(648, 503));
                await Task.Delay(230);
                var toggle = Descendants(PageFrame).OfType<Microsoft.UI.Xaml.Controls.Primitives.ToggleButton>()
                    .Single(button => Microsoft.UI.Xaml.Automation.AutomationProperties.GetName(button) == "Drawing tools");
                ToastBar.IsOpen = false;
                if (inspect) await Capture("editor-compact");
                Check(toggle.Visibility == Visibility.Visible && toggle.IsChecked != true && editor.ActualHeight >= 190,
                    $"Compact whiteboard preserves drawing space and keeps tools accessible ({editor.ActualHeight:F0} DIPs)");
                toggle.IsChecked = true;
                await Task.Delay(180);
                Check(Descendants(PageFrame).OfType<Slider>().Any(control => control.ActualWidth > 0),
                    "Compact whiteboard opens the thickness control");
                toggle.IsChecked = false;
                native.Resize(editorSize);
                editor.AddText(new Windows.Foundation.Point(80, 100), "Recover draft", false);
                var deadline = DateTime.UtcNow.AddSeconds(8);
                while (!api.IsOffline && DateTime.UtcNow < deadline) await Task.Delay(80);
                var drafts = Path.Combine(DesktopSettings.AppFolder, "board-drafts");
                Check(api.IsOffline && Directory.GetFiles(drafts, "*.bin").Length == 1,
                    "Offline whiteboard edits are stored in the protected draft file");
                await Go("Dashboard");
                Check(route == "Dashboard", "An offline whiteboard can be closed with its draft saved");
                fixture.DropBoardOps = false;
                await Go("Board", fixture.BoardId);
                deadline = DateTime.UtcNow.AddSeconds(8);
                while (Directory.GetFiles(drafts, "*.bin").Length > 0 && DateTime.UtcNow < deadline) await Task.Delay(80);
                Check(fixture.BoardStrokes.Count > 0 && Directory.GetFiles(drafts, "*.bin").Length == 0,
                    "Reopening the board syncs recovered edits and clears the draft");
                var recoveredEditor = (BoardCanvas)((Border)((WorkspacePage)PageFrame.Content).Body!).Child;
                var actions = Descendants(PageFrame).OfType<Button>().Single(button =>
                    Microsoft.UI.Xaml.Automation.AutomationProperties.GetName(button) == "Board actions");
                Check(actions.Flyout is MenuFlyout menu && menu.Items.OfType<MenuFlyoutItem>().Any(item => item.Text == "Clear current page"),
                    "Whiteboard actions include the confirmed clear-page workflow");
                var inkCount = fixture.BoardStrokes.Count;
                recoveredEditor.ClearPage();
                deadline = DateTime.UtcNow.AddSeconds(8);
                while (fixture.BoardStrokes.Count > 0 && DateTime.UtcNow < deadline) await Task.Delay(80);
                Check(fixture.BoardStrokes.Count == 0, "Clearing the current whiteboard page syncs the removed strokes");
                var undo = Descendants(PageFrame).OfType<Button>().Single(button => Equals(button.Content, "Undo"));
                await ((CommunityToolkit.Mvvm.Input.IAsyncRelayCommand)undo.Command).ExecuteAsync(null);
                Check(fixture.BoardStrokes.Count == inkCount, "Undo restores a cleared page and syncs the restored ink");
                await ExportBoard(await api.Get(BoardPath(fixture.BoardId)), fixture.FirstBoardPage, true, () => Task.CompletedTask);
                await Task.Delay(140);
                Descendants(OverlayContent).OfType<ComboBox>().Single(combo => Equals(combo.Header, "Pages")).SelectedIndex = 2;
                await Invoke("Save PNG previews");
                Check(fixture.PreviewUploads.SequenceEqual([fixture.FirstBoardPage, fixture.SecondBoardPage]),
                    "Saving all whiteboard previews sends a PNG for each page without opening the file picker");
                await CloseOverlay();
                await Go("Dashboard");
                Check(route == "Dashboard" && fixture.PreviewUploads.Count == 4,
                    "Whiteboard auto-save updates all previews when leaving an edited board");
                fixture.Dispose();
                fixture = null;
                await Go("Dashboard", refresh: true);
                await Task.Yield();
                Check(OfflineBanner.IsOpen && PageFrame.Content is WorkspacePage { Body: ScrollViewer }, "Offline dashboard uses the last protected GET copy");
            }
            else
            {
                await Go("Dashboard");
                await RefreshNotes(CancellationToken.None);
                Check(PageFrame.Content is WorkspacePage { Body: ScrollViewer }, "Hosted notes and dashboard requests succeeded");
                using var realtime = new CancellationTokenSource(TimeSpan.FromSeconds(12));
                var connected = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                var workspaceConnected = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                var channel = new NovaTaskflow.Live.NotesChannel(user.Id(), _ => { }, () => connected.TrySetResult());
                var workspaceChanges = NovaTaskflow.Live.NotesChannel.WorkspaceChanges(user.Id(), _ => { }, () => workspaceConnected.TrySetResult());
                var workspaceListening = workspaceChanges.Listen(realtime.Token);
                var listening = channel.Listen(realtime.Token);
                try
                {
                    await connected.Task.WaitAsync(realtime.Token);
                    Check(true, "Hosted Supabase notes channel accepted the native realtime session");
                    await workspaceConnected.Task.WaitAsync(realtime.Token);
                    Check(true, "Hosted Supabase accepted both notifications and system status subscriptions");
                }
                finally
                {
                    await realtime.CancelAsync();
                    await Task.WhenAll(listening, workspaceListening);
                }
            }

            var currentPage = PageFrame.Content;
            HideNova();
            Check(hidden && !native.IsVisible, "Window hides while tray remains available");
            await Task.Delay(400);
            var process = Process.GetCurrentProcess();
            steps.Add($"Hidden working set {process.WorkingSet64 / 1048576} MiB, private bytes {process.PrivateMemorySize64 / 1048576} MiB");
            ShowNova();
            Check(PageFrame.Content == currentPage && native.IsVisible, "Restoring from tray preserves the current page");
            FlipTheme();
            Check(Root.RequestedTheme == ElementTheme.Light, "Theme switches to light");
            Check(Root.Background is SolidColorBrush lightCanvas && lightCanvas.Color.R == 0xF5 &&
                lightCanvas.Color.G == 0xF1 && lightCanvas.Color.B == 0xEC, "Light canvas uses Nova's shared palette");
            FlipTheme();
            Check(Root.RequestedTheme == ElementTheme.Dark, "Theme switches back to dark");
            Check(Root.Background is SolidColorBrush darkCanvas && darkCanvas.Color.R == 0x16 &&
                darkCanvas.Color.G == 0x13 && darkCanvas.Color.B == 0x12, "Dark canvas uses Nova's shared palette");
            SetAppearance("System");
            Check(settings.FollowWindowsTheme &&
                Root.RequestedTheme == (WindowsUsesLightTheme() ? ElementTheme.Light : ElementTheme.Dark),
                "System appearance matches the Windows theme");
            SetAppearance("Dark");
            if (inspect)
            {
                await Go("Dashboard", refresh: false);
                ToastBar.IsOpen = false;
                await Capture("dark");
                FlipTheme();
                await Capture("light");
                FlipTheme();
                File.WriteAllLines(report, steps);
            }
        }
        catch (Exception error) { failure = error.ToString(); }
        finally
        {
            fixture?.Dispose();
            EndSession(false);
        }
        if (failure.Length > 0) steps.Add("FAIL " + failure);
        File.WriteAllLines(report, steps);
        Environment.ExitCode = failure.Length == 0 ? 0 : 1;
        await Quit();

        void Check(bool passed, string label)
        {
            if (!passed) throw new InvalidOperationException(label + (ToastBar.IsOpen ? " · " + ToastBar.Title : ""));
            steps.Add("PASS " + label);
        }

        async Task TestAccountFlows(NovaSmokeServer server)
        {
            Registration();
            await WaitUntil(() => Descendants(OverlayContent).OfType<PasswordBox>().Count() == 2);
            var details = Descendants(OverlayContent).OfType<TextBox>().Where(field => field.Header is string)
                .ToDictionary(field => (string)field.Header);
            details["Full name"].Text = "Nova Signup QA";
            details["Username"].Text = "@Nova_QA";
            details["Role / title"].Text = "Engineer";
            details["Email"].Text = "QA@Example.com";
            var registration = Descendants(OverlayContent).OfType<PasswordBox>().ToDictionary(field => (string)field.Header);
            registration["Password"].Password = "fixture-signup-pass";
            registration["Confirm password"].Password = "fixture-mismatch";
            await Invoke("Create account");
            Check(server.SignupEmail.Length == 0 && Descendants(OverlayContent).OfType<InfoBar>()
                .Any(bar => bar.IsOpen && bar.Message == "Passwords must match."),
                "Signup shows password mismatch in the form and sends no registration request");
            registration["Confirm password"].Password = registration["Password"].Password;
            await Invoke("Create account");
            Check(server.SignupEmail == "qa@example.com" && server.SignupUsername == "nova_qa" &&
                await WaitUntil(() => Descendants(OverlayContent).OfType<TextBox>().Any(field => Equals(field.Header, "Verification code"))),
                "Signup submits the normalized identity and opens email verification");
            var signupCode = Descendants(OverlayContent).OfType<TextBox>().Single(field => Equals(field.Header, "Verification code"));
            signupCode.Text = "000000";
            await WaitUntil(() => Descendants(OverlayContent).OfType<Button>().Any(button => button.IsEnabled && Equals(button.Content, "Verify account")));
            await Invoke("Verify account");
            Check(await WaitUntil(() => Descendants(OverlayContent).OfType<InfoBar>()
                .Any(bar => bar.IsOpen && bar.Message == "Invalid OTP code")), "An invalid verification code shows an inline error");
            signupCode.Text = "123456";
            await Invoke("Verify account");
            Check(await WaitUntil(() => Overlay.Visibility == Visibility.Collapsed) && !SignedIn,
                "The correct registration code returns to sign-in");

            ResetPassword("fixture-restore@example.com");
            await Invoke("Send reset code");
            await Invoke("Change email");
            Check(await WaitUntil(() => Descendants(OverlayContent).OfType<TextBox>().Any(field =>
                Equals(field.Header, "Email") && field.Text == "fixture-restore@example.com" && !field.IsReadOnly)),
                "Password recovery lets signed-out users correct the email address");
            await Invoke("Send reset code");
            var code = Descendants(OverlayContent).OfType<TextBox>().Single(field => Equals(field.Header, "Verification code"));
            var proceed = Descendants(OverlayContent).OfType<Button>().Single(button => Equals(button.Content, "Continue"));
            Check(!Descendants(OverlayContent).OfType<PasswordBox>().Any() && !proceed.IsEnabled &&
                Descendants(OverlayContent).OfType<Button>().Any(button => button.Content is string label &&
                    label.StartsWith("Resend in ", StringComparison.Ordinal) && !button.IsEnabled),
                "Password recovery requires a complete code and starts the resend countdown");
            code.Text = "123";
            Check(!proceed.IsEnabled, "A partial verification code keeps Continue disabled");
            code.Text = VerificationDigits("123-456\r\n");
            Check(code.Text == "123456", "Formatted verification codes normalize to six ASCII digits");
            await Invoke("Continue");
            var fields = Descendants(OverlayContent).OfType<PasswordBox>().ToArray();
            var password = fields.Single(field => Equals(field.Header, "New password"));
            var repeat = fields.Single(field => Equals(field.Header, "Confirm password"));
            password.Password = "fixture-new-password";
            repeat.Password = "fixture-different-password";
            await Invoke("Reset password");
            Check(server.PasswordResetCount == 0 && ToastBar.Title == "Passwords must match.",
                "A mismatched password confirmation blocks the reset request");
            repeat.Password = password.Password;
            await Invoke("Reset password");
            Check(server.PasswordResetCount == 1 && Overlay.Visibility == Visibility.Collapsed,
                "A verified recovery code and matching passwords reset the account password");

            server.PromoteFixtureSignIn = true;
            await Login("fixture-archived@example.com", "fixture-password");
            await Task.Delay(150);
            var restoring = Descendants(OverlayContent).OfType<TextBox>().Single(field => Equals(field.Header, "Verification code"));
            Check(!SignedIn && server.ReactivationRequests == 1, "An archived email sign-in opens reactivation using the same email");
            Check(NativeInviteToken(new Uri("nova-taskflow:///whiteboard/join/fixture-invite")) == "fixture-invite" &&
                NativeInviteToken(new Uri("nova-taskflow://other/whiteboard/join/fixture-invite")) is null,
                "Mobile-format invitation links accept the Nova route and reject other authorities");
            QueueNovaInvite(new Uri("nova-taskflow://whiteboard/join/fixture-invite"));
            restoring.Text = "123456";
            await Invoke("Reactivate");
            Check(await WaitUntil(() => workspaceReady && SignedIn && route == "Dashboard") &&
                SessionVault.Read(VaultKey(user.Id())) is { Length: > 0 },
                "Successful reactivation starts a saved workspace session immediately");
            Check(await WaitUntil(() => pendingNovaInvite is null && Descendants(OverlayContent).OfType<Button>()
                .Any(button => Equals(button.Content, "Accept invitation"))) && !server.InviteAccepted,
                "A mobile-format whiteboard invite resumes after verification and waits for acceptance");
            await CloseOverlay();
            EndSession(false);
            server.PromoteFixtureSignIn = false;
        }

        async Task TestGroupedSearch()
        {
            await ShowSearch();
            await Task.Delay(180);
            var palette = Descendants(OverlayContent).OfType<WorkspaceSearch>().Single();
            var query = Descendants(palette).OfType<TextBox>().Single();
            query.Text = "Nova";
            await Task.Delay(620);
            var list = Descendants(palette).OfType<ListView>().Single();
            var collection = (ICollectionView)list.ItemsSource;
            var labels = collection.CollectionGroups.Cast<ICollectionViewGroup>().Select(group => ((SearchGroup)group.Group).Name).ToArray();
            Check(labels.SequenceEqual(["Projects", "Whiteboards", "Tasks", "Subscriptions", "Notes", "People"]) &&
                list.SelectedItem is SearchResult { Item.Kind: "projects" }, "Search groups every supported resource type and selects the first result");
            if (inspect) await Capture("search");
            await Invoke("Clear");
            Check(query.Text.Length == 0 && list.Visibility == Visibility.Collapsed &&
                Descendants(palette).OfType<TextBlock>().Any(label => label.Text == "Start typing to search"),
                "Clearing workspace search returns to the empty input state");
            query.Text = "Nova";
            await Task.Delay(620);
            var self = ((ICollectionView)list.ItemsSource).Cast<SearchResult>().Single(result => result.Item.Kind == "users");
            await OpenSearchResult(self.Item);
            Check(route == "Profile", "Search opens the signed-in user’s own profile");
            await Go("Dashboard");
        }

        async Task Capture(string theme, UIElement? surface = null)
        {
            await Task.Delay(300);
            var rendering = new RenderTargetBitmap();
            await rendering.RenderAsync(surface ?? Root);
            using var stream = new InMemoryRandomAccessStream();
            var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, stream);
            encoder.SetPixelData(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied,
                (uint)rendering.PixelWidth, (uint)rendering.PixelHeight, 96, 96, (await rendering.GetPixelsAsync()).ToArray());
            await encoder.FlushAsync();
            stream.Seek(0);
            await using var file = File.Create(Path.ChangeExtension(report, theme + ".png"));
            await stream.AsStreamForRead().CopyToAsync(file);
        }

        async Task Invoke(string label)
        {
            await Task.Delay(180);
            var button = Descendants(OverlayContent).OfType<Button>().FirstOrDefault(control => Equals(control.Content, label));
            if (button is null) throw new InvalidOperationException("Action unavailable: " + label);
            await InvokeControl(button);
        }

        static async Task<bool> WaitUntil(Func<bool> ready)
        {
            var wait = Stopwatch.StartNew();
            while (!ready() && wait.Elapsed < TimeSpan.FromSeconds(6)) await Task.Delay(60);
            return ready();
        }

        static async Task InvokeControl(Button button)
        {
            if (!button.IsEnabled) throw new InvalidOperationException("Action disabled: " + button.Content);
            if (button.Command is CommunityToolkit.Mvvm.Input.IAsyncRelayCommand command && command.CanExecute(null))
                await command.ExecuteAsync(null);
            else
            {
                var peer = Microsoft.UI.Xaml.Automation.Peers.FrameworkElementAutomationPeer.CreatePeerForElement(button);
                if (peer is not Microsoft.UI.Xaml.Automation.Provider.IInvokeProvider invoke)
                    throw new InvalidOperationException("Action unavailable: " + button.Content);
                invoke.Invoke();
            }
            await Task.Delay(150);
        }

        async Task TestWorkspaceSync(NovaSmokeServer server)
        {
            var taskPath = TaskResource(server.TaskId);
            var projectPath = ProjectResource(server.ProjectId);
            await Go("Project", server.ProjectId, true);
            await api.Get(taskPath);
            var originalProject = await api.Get(projectPath);
            server.DropWorkspaceRequests = true;
            await TaskDrawer(server.TaskId);
            await Task.Delay(180);
            var description = Descendants(OverlayContent).OfType<TextBox>().Single(box => Equals(box.Header, "Description"));
            description.Text = "Task edited while disconnected";
            await Invoke("Save");
            var edit = await WriteWorkspace(HttpMethod.Patch, projectPath, new { name = "Offline project rename" },
                originalProject, "Rename project");
            var create = await WriteWorkspace(HttpMethod.Post, "/api/tasks",
                new { title = "Task created offline", projectId = server.ProjectId }, default, "Task created offline");
            Check(api.IsOffline && edit.Queued && create.Queued && pendingChanges.Count == 3 && SyncBanner.IsOpen,
                "Offline task editor, project edit, and task create enter the workspace outbox");
            Check((WithPendingFields(await api.Get(taskPath), taskPath)).Text("description") == "Task edited while disconnected",
                "The offline task drawer shows the queued edit against the cached copy");
            var path = Directory.GetFiles(Path.Combine(DesktopSettings.AppFolder, "workspace-outbox"), "*.bin").Single();
            Check(!System.Text.Encoding.UTF8.GetString(File.ReadAllBytes(path)).Contains("Task edited while disconnected"),
                "Workspace outbox is protected on disk");
            LoadOutbox();
            Check(pendingChanges.Count == 3 && pendingChanges.All(item => item.Review is null),
                "Workspace changes reload from disk for the signed-in account");
            server.DropWorkspaceRequests = false;
            server.ProjectName = "Remote project rename";
            await SyncOutbox(CancellationToken.None);
            Check(server.TaskDescription == "Task edited while disconnected" && server.TaskPatchesWithBase == 1 &&
                server.WorkspaceTaskCreates == 1 && server.ProjectName == "Remote project rename" &&
                pendingChanges is [{ Review: not null }], "Reconnect syncs tasks and preserves a conflicting remote project value");
            ShowOutbox();
            await Task.Delay(150);
            Check(Descendants(OverlayContent).OfType<Button>().Any(button => Equals(button.Content, "Apply my change")),
                "A workspace conflict offers explicit review");
            var conflict = pendingChanges.Single();
            ReplaceChange(conflict.Id, conflict with { Base = [], Review = null });
            await SyncOutbox(CancellationToken.None);
            Check(server.ProjectName == "Offline project rename" && pendingChanges.Count == 0 && !File.Exists(path),
                "Applying the explicitly chosen project value clears the outbox");
            await CloseOverlay();

            server.FailTaskCreateAcknowledgement = true;
            var uncertain = await WriteWorkspace(HttpMethod.Post, "/api/tasks",
                new { title = "Create with lost confirmation", projectId = server.ProjectId }, default, "Create with lost confirmation");
            server.FailTaskCreateAcknowledgement = false;
            LoadOutbox();
            await SyncOutbox(CancellationToken.None);
            Check(uncertain.Queued && pendingChanges is [{ Review: UnknownCreate }] && server.WorkspaceTaskCreates == 2,
                "A create with an unknown result is retained for review without duplicate automatic replay");
            ReplaceChange(pendingChanges.Single().Id, null);
        }

        async Task TestNewTaskChecklist(NovaSmokeServer server)
        {
            await Go("Project", server.ProjectId, true);
            var project = await api.Get(ProjectResource(server.ProjectId));
            await TaskForm(server.ProjectId, project, default);
            await Task.Delay(150);
            Descendants(OverlayContent).OfType<TextBox>().Single(box => Equals(box.Header, "Task title")).Text = "Initial checklist settings";
            await Invoke("Add a subtask");
            await Task.Delay(120);
            Descendants(OverlayContent).OfType<TextBox>().Single(box => box.PlaceholderText == "Subtask title").Text = "Verify launch";
            Descendants(OverlayContent).OfType<CheckBox>().Single(box => Equals(box.Content, "Completed")).IsChecked = true;
            var chosen = DateTime.Today.AddDays(3);
            var calendar = Descendants(OverlayContent).OfType<CalendarDatePicker>().Single(field => Equals(field.Header, "Subtask date"));
            calendar.StartBringIntoView(new BringIntoViewOptions { AnimationDesired = false });
            await Task.Delay(160);
            calendar.IsCalendarOpen = true;
            await Task.Delay(240);
            var month = VisualTreeHelper.GetOpenPopupsForXamlRoot(Root.XamlRoot)
                .Select(popup => popup.Child).OfType<UIElement>().SelectMany(Descendants).OfType<CalendarView>().FirstOrDefault();
            Check(month?.SelectedBorderBrush is SolidColorBrush accent && accent.Color == Ui.Rgb(settings.Light ? 0xc56010u : 0xe66a17u),
                "Subtask date opens the shared Nova calendar");
            if (inspect) await Capture("date-picker", month!);
            month!.SelectedDates.Add(new DateTimeOffset(chosen));
            calendar.IsCalendarOpen = false;
            Check(calendar.DateValue() == chosen.ToString("yyyy-MM-dd"), "Selecting a date in the calendar updates the field");
            var assign = Descendants(OverlayContent).OfType<Expander>().Single(row => Equals(row.Header, "Subtask assignees"));
            var candidate = ((StackPanel)assign.Content).Children.OfType<CheckBox>().Single();
            candidate.IsChecked = true;
            await Invoke("Create task");
            Check(server.InitialChecklistDate == chosen.ToString("yyyy-MM-dd") && server.InitialChecklistCompleted,
                "New-task checklist sends its own date and applies the completed state");
            Check(server.InitialChecklistAssigned && pendingChanges.Count == 0,
                "New-task checklist uses the shared assignment endpoint and clears its outbox entry");
        }

        async Task TestInitialProjectMember(NovaSmokeServer server)
        {
            await ProjectForm(default);
            await Task.Delay(150);
            Descendants(OverlayContent).OfType<TextBox>().Single(box => Equals(box.Header, "Name")).Text = "Launch crew";
            var memberPicker = Descendants(OverlayContent).OfType<Expander>().Single(control => Equals(control.Header, "Add project members"));
            memberPicker.IsExpanded = true;
            await Task.Delay(120);
            Descendants(memberPicker).OfType<TextBox>().Single(box => Equals(box.Header, "Find a person")).Text = "Checklist member";
            var roles = Descendants(memberPicker).OfType<ComboBox>().Single(combo => Equals(combo.Header, "Role"));
            roles.StartBringIntoView(new BringIntoViewOptions { AnimationDesired = false });
            await Task.Delay(160);
            roles.IsDropDownOpen = true;
            await Task.Delay(200);
            Check(roles.IsDropDownOpen && roles.IsTextSearchEnabled && roles.CornerRadius.TopLeft == 12,
                "Project roles open the shared dropdown with keyboard text search");
            var rolePopup = VisualTreeHelper.GetOpenPopupsForXamlRoot(Root.XamlRoot).LastOrDefault();
            if (inspect && rolePopup?.Child is FrameworkElement { ActualWidth: > 0 } roleSurface)
                await Capture("dropdown", roleSurface);
            roles.SelectedItem = "VIEWER";
            roles.IsDropDownOpen = false;
            await Invoke("Search people");
            await Invoke("Checklist member");
            await Invoke("Create project");
            Check(server.CreatedTeamProject.Length > 0 && server.AddedProjectRole == "VIEWER" && pendingChanges.Count == 0,
                "New project adds the selected member with the selected role after creation");
        }

        async Task TestNoteConversion(NovaSmokeServer server)
        {
            await Go("Note", "new");
            var note = editingNote!;
            note.Set(note.Value with { Body = "  Convert the launch note  \nWorking copy", ProjectId = server.ProjectId,
                Checklist = [new("check-1", "Ship it", true), new("check-2", "Ship it", false), new("check-3", "Follow up", false)] },
                false, "body", "projectId", "checklist");
            var result = await CreateTaskFromNote(note);
            Check(result.Queued && result.Project.Id() == server.ProjectId && note.Value.Id == server.NoteId && server.ConvertedTask.Length > 0,
                "Creating a task from a titleless project note saves the original note first");
            await SyncOutbox(CancellationToken.None);
            Check(server.ConvertedChecklist.SequenceEqual(["Ship it", "Ship it", "Follow up"]) &&
                server.ConvertedSubtaskPatches == 1 && pendingChanges.Count == 0,
                "Converted checklists preserve duplicate labels and retry after partial completion without checking another row");
            await Go("Notes");
        }

        async Task TestProjectNotes(NovaSmokeServer server)
        {
            await Go("Project", server.ProjectId);
            var context = await api.Get(ProjectResource(server.ProjectId));
            await ProjectNotes(context);
            await Task.Delay(160);
            Descendants(OverlayContent).OfType<TextBox>().Single(field =>
                Microsoft.UI.Xaml.Automation.AutomationProperties.GetName(field) == "Quick note").Text = "Capture a project thought";
            await Invoke("Add");
            var createdNote = await api.Get("/api/notes/" + server.NoteId);
            Check(createdNote.Text("projectId") == server.ProjectId && createdNote.Text("body") == "Capture a project thought",
                "Project quick note saves through the existing Notes API with the selected project");
            await Invoke("Open in Notes");
            var filter = Descendants(PageFrame).OfType<ComboBox>().Single(field =>
                Microsoft.UI.Xaml.Automation.AutomationProperties.GetName(field) == "Filter by project");
            Check(route == "Notes" && filter.Selected() == context.Text("name"), "Open in Notes selects the project filter");
            await Go("Project", server.ProjectId);
            await ProjectNotes(context);
            await Invoke("Write a full note");
            Check(route == "Note" && editingNote?.Value.ProjectId == server.ProjectId,
                "The full note editor inherits the project before the first edit");
            await Go("Notes");
        }

        async Task TestNoteLineBreak(TextBox field, NoteDraft draft, bool large)
        {
            var body = large ? string.Concat(Enumerable.Repeat("Nova keeps this line.\n", 1050)) : draft.Value.Body;
            field.Text = body;
            await Task.Delay(150);
            field.Select(field.Text.Length, 0);
            field.SelectedText = "\r\n";
            await Task.Delay(160);
            var cursor = field.SelectionStart;
            var selection = field.SelectionLength;
            await draft.Flush();
            var saved = await api.GetFresh("/api/notes/" + draft.Value.Id, CancellationToken.None);
            var editor = large ? "Long note" : "Floating sticky";
            Check(field.MaxLength == 0 && field.BorderThickness == new Thickness(0), $"{editor} uses an unbounded, borderless writing field");
            Check(cursor + selection == field.Text.Length && cursor == field.SelectionStart && selection == field.SelectionLength,
                $"{editor} keeps the cursor at the edit after autosave (position {cursor}, selection {selection}, length {field.Text.Length})");
            Check(saved.Text("body") == body + "\n", $"{editor} saves a trailing line break (received {saved.Text("body").Length}, expected {body.Length + 1})");
        }

        async Task TestOfflineNotes(NovaSmokeServer server)
        {
            await Go("Notes", refresh: true);
            var totalCreates = server.Creates;
            server.DropNotesRequests = true;
            await api.Get("/api/notes");
            await NewSticky();
            var draft = floating.Keys.Single();
            draft.Set(draft.Value with { Title = "Sticky captured offline", Body = "Local note draft text" }, false, "title", "body");
            await draft.Flush();
            var noteKey = draft.EditorId;
            Check(api.IsOffline && draft.StoredLocally && draft.Dirty && server.Creates == totalCreates &&
                OrderedNotes().Any(note => note.Id == noteKey), "Offline sticky appears as a local draft and sends no create request");
            var folder = Path.Combine(DesktopSettings.AppFolder, "note-drafts");
            var protectedFile = Directory.GetFiles(folder, "*.bin", SearchOption.AllDirectories).Single();
            Check(!System.Text.Encoding.UTF8.GetString(File.ReadAllBytes(protectedFile)).Contains("Local note draft text"),
                "The offline sticky draft is protected on disk");
            ResetNotes();
            RecoverNoteDrafts();
            var recovered = FindDraft(noteKey);
            Check(recovered is { Dirty: true, Value.Body: "Local note draft text" } && floating.ContainsKey(recovered),
                "The offline sticky reopens from protected storage");
            server.DropNotesRequests = false;
            await RefreshNotes(CancellationToken.None);
            await FlushNotes();
            Check(recovered!.Value.Id == server.NoteId && server.Creates == totalCreates + 1 &&
                !recovered.Dirty && !File.Exists(protectedFile), "Reconnecting syncs the recovered sticky exactly once");

            server.DropNotesRequests = true;
            recovered.Set(recovered.Value with { Body = "Second offline edit" }, false, "body");
            await recovered.Flush();
            Check(recovered.Dirty && recovered.StoredLocally, "Edits to a synced sticky survive a new disconnect");
            await Go("Projects");
            ResetNotes();
            RecoverNoteDrafts();
            recovered = FindDraft(server.NoteId);
            Check(recovered is { StoredLocally: true, Value.Body: "Second offline edit" },
                "An existing sticky restores its unsent edit on restart");
            server.DropNotesRequests = false;
            await RefreshNotes(CancellationToken.None);
            await FlushNotes();
            Check(NoteDocument.Read(await api.Get("/api/notes/" + server.NoteId)).Body == "Second offline edit" &&
                server.Creates == totalCreates + 1, "Recovering an existing sticky updates its original note");
            await api.Delete("/api/notes/" + server.NoteId);
            RemoveNote(server.NoteId);
        }

        async Task ReportAndJoin()
        {
            await ShareBoard(fixture!.BoardId);
            Check(await WaitUntil(() => Descendants(OverlayContent).OfType<Button>().Any(button => Equals(button.Content, "Share via Windows"))) &&
                Descendants(OverlayContent).OfType<Button>().Any(button => Equals(button.Content, "Copy invite link")),
                "Whiteboard sharing offers Windows Share alongside copy");
            var shareLink = await CreateBoardInvite(fixture.BoardId, "MEMBER");
            Check(fixture.LastInviteRole == "MEMBER" && shareLink.AbsolutePath == "/whiteboard/join/fixture-generated-link",
                "Whiteboard sharing requests a one-time link for the selected role");
            await CloseOverlay();
            ReportProblem();
            await Task.Delay(180);
            var fields = Descendants(OverlayContent).OfType<TextBox>().ToList();
            fields.Single(field => Equals(field.Header, "Title")).Text = "Desktop support fixture";
            fields.Single(field => Equals(field.Header, "What happened?")).Text = "Checking the native support route.";
            await Invoke("Submit report");
            Check(fixture!.SupportWasMultipart, "Support form posts the native multipart request");
            OpenNovaLink(true);
            await Task.Delay(180);
            Descendants(OverlayContent).OfType<TextBox>().Single(field => Equals(field.Header, "Whiteboard invite"))
                .Text = fixture.Origin + "/whiteboard/join/fixture-invite";
            await Invoke("Continue");
            leavePage = () => Task.FromResult(false);
            await Invoke("Accept invitation");
            Check(!fixture.InviteAccepted && Overlay.Visibility == Visibility.Visible,
                "An unsuccessful save preserves the one-time whiteboard invitation");
            leavePage = () => Task.FromResult(true);
            await Invoke("Accept invitation");
            Check(fixture.InviteAccepted && route == "Board", "Invite preview opens the joined whiteboard");
            await PreviewInvite("missing-fixture");
            Check(await WaitUntil(() => Descendants(OverlayContent).OfType<TextBlock>().Any(text => text.Text == "Not found")) &&
                Overlay.Visibility == Visibility.Visible &&
                Descendants(OverlayContent).OfType<Button>().Select(button => button.Content).SequenceEqual(["Close"]),
                "A missing invitation leaves the drawer's standard close action available");
            await CloseOverlay();
        }
    }

    private static bool IsAbove(nint front, nint back)
    {
        const uint previous = 3;
        for (var window = GetWindow(back, previous); window != 0; window = GetWindow(window, previous))
            if (window == front) return true;
        return false;
    }

    [DllImport("user32.dll")] private static extern nint GetWindow(nint window, uint command);
    [DllImport("user32.dll")] private static extern bool PostMessage(nint window, uint message, nuint wParam, nint lParam);

    private static IEnumerable<DependencyObject> Descendants(DependencyObject element)
    {
        yield return element;
        for (var i = 0; i < VisualTreeHelper.GetChildrenCount(element); i++)
            foreach (var child in Descendants(VisualTreeHelper.GetChild(element, i))) yield return child;
    }
}

internal sealed class NovaSmokeServer : IDisposable
{
    private readonly HttpListener listener = new();
    private readonly CancellationTokenSource lifetime = new();
    private readonly object sync = new();
    private JsonElement note;
    private const string Account = "30000000-0000-0000-0000-000000000001";
    public string ProjectId => "30000000-0000-0000-0000-000000000002";
    public string TaskId => "30000000-0000-0000-0000-000000000003";
    public const string NotificationId = "30000000-0000-0000-0000-000000000011";
    private sealed record TestNotification(Guid id, string title, string message, string type, DateTimeOffset createdAt, bool isRead);
    private readonly List<TestNotification> inbox = [new(Guid.Parse(NotificationId), "Workspace update", "Test notification", "ADMIN_BROADCAST", DateTimeOffset.UtcNow, false)];
    public int NotificationReads { get; private set; }
    public Guid AddNotification(string title, string type = "TEST_NOTIFICATION", DateTimeOffset? at = null, bool read = false)
    {
        lock (sync)
        {
            var id = Guid.NewGuid();
            inbox.Insert(0, new(id, title, "Nova desktop notification verification", type, at ?? DateTimeOffset.UtcNow, read));
            return id;
        }
    }

    private object NotificationPage(string? pageValue, string? limitValue)
    {
        var page = int.TryParse(pageValue, out var requestedPage) ? Math.Max(1, requestedPage) : 1;
        var limit = int.TryParse(limitValue, out var requestedLimit) ? Math.Clamp(requestedLimit, 1, 100) : 20;
        return new { unreadCount = inbox.Count(item => !item.isRead), totalPages = (int)Math.Ceiling((double)inbox.Count / limit),
            data = inbox.OrderByDescending(item => item.createdAt).Skip((page - 1) * limit).Take(limit).ToArray() };
    }
    public string BoardId => "30000000-0000-0000-0000-000000000004";
    public string FirstBoardPage => "30000000-0000-0000-0000-000000000006";
    public string SecondBoardPage => "30000000-0000-0000-0000-000000000016";
    public List<string> PreviewUploads { get; } = [];
    public string NoteId => "30000000-0000-0000-0000-000000000005";
    public string SubtaskId => "30000000-0000-0000-0000-000000000007";
    public int Creates { get; private set; }
    public bool TaskCommentClosed { get; private set; }
    public bool Floating => note.Flag("floating");
    public string Origin { get; }
    public bool PromoteFixtureSignIn { get; set; }
    public string SubtaskDueDate { get; private set; } = "";
    public bool AiInputIncludedOriginal { get; private set; }
    public string TaskDescription { get; private set; } = "";
    public List<string> AddedSubtasks { get; } = [];
    public string SubscriptionStatus { get; private set; } = "ACTIVE";
    public string SubscriptionCurrency { get; private set; } = "USD";
    public string SubscriptionTrialDate { get; private set; } = "";
    public int SubscriptionRenewals { get; private set; }
    public int PasswordResetCount { get; private set; }
    public int ReactivationRequests { get; private set; }
    public string SignupEmail { get; private set; } = "";
    public string SignupUsername { get; private set; } = "";
    public bool AiEnabled { get; private set; } = true;
    public volatile bool SubscriptionDueNow;
    public bool ProjectBoardsRead { get; private set; }
    public bool SupportWasMultipart { get; private set; }
    public string SuggestionStatus { get; private set; } = "In Review";
    public bool InviteAccepted { get; private set; }
    public string LastInviteRole { get; private set; } = "";
    public volatile bool DropBoardOps;
    public volatile bool DropWorkspaceRequests;
    public volatile bool DropNotesRequests;
    public volatile bool OmitNoteFromList;
    public volatile bool DropSubscriptions;
    public volatile bool FailTaskCreateAcknowledgement;
    public string ProjectName { get; set; } = "Desktop rollout";
    public int WorkspaceTaskCreates { get; private set; }
    public int TaskPatchesWithBase { get; private set; }
    public string CreatedTeamProject { get; private set; } = "";
    public string AddedProjectRole { get; private set; } = "";
    public string ConvertedTask { get; private set; } = "";
    public string[] ConvertedChecklist { get; private set; } = [];
    public int ConvertedSubtaskPatches { get; private set; }
    private const string ConvertedFirstSubtask = "30000000-0000-0000-0000-000000000013";
    private const string ConvertedSecondSubtask = "30000000-0000-0000-0000-000000000014";
    private const string ConvertedThirdSubtask = "30000000-0000-0000-0000-000000000015";
    private string createdChecklistTask = "";
    public string InitialChecklistDate { get; private set; } = "";
    public bool InitialChecklistCompleted { get; private set; }
    public bool InitialChecklistAssigned { get; private set; }
    private const string ChecklistFixtureMember = "30000000-0000-0000-0000-000000000008";
    private const string ChecklistFixtureSubtask = "30000000-0000-0000-0000-000000000009";
    public Dictionary<string, JsonElement> BoardStrokes { get; } = new();
    private int boardVersion = 1;

    public NovaSmokeServer()
    {
        var portProbe = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
        portProbe.Start();
        var port = ((IPEndPoint)portProbe.LocalEndpoint).Port;
        portProbe.Stop();
        Origin = $"http://127.0.0.1:{port}";
        listener.Prefixes.Add(Origin + "/");
        listener.Start();
        _ = Task.Run(Loop);
    }

    public void RemoteEdit(string body, bool? floating = null)
    {
        lock (sync) SaveNote(floating is { } enabled
            ? JsonSerializer.SerializeToElement(new { body, floating = enabled })
            : JsonSerializer.SerializeToElement(new { body }));
    }

    private async Task Loop()
    {
        try
        {
            while (!lifetime.IsCancellationRequested)
            {
                var context = await listener.GetContextAsync();
                _ = Task.Run(() => Respond(context));
            }
        }
        catch (Exception error) when (error is HttpListenerException or ObjectDisposedException or InvalidOperationException) { }
    }

    private async Task Respond(HttpListenerContext context)
    {
        using var response = context.Response;
        var request = context.Request;
        var path = request.Url!.AbsolutePath;
        var method = request.HttpMethod;
        var demo = !PromoteFixtureSignIn;
        var account = new { id = Account, fullName = demo ? "Nova Demo" : "Nova Admin", roleTitle = "Workspace member",
            username = "nova", isDemo = demo, accountRole = demo ? "USER" : "SUPER_ADMIN" };
        object? payload;
        if (((DropNotesRequests && path.StartsWith("/api/notes", StringComparison.Ordinal)) ||
             (DropSubscriptions && path.StartsWith("/api/subscriptions", StringComparison.Ordinal))) ||
            DropWorkspaceRequests && (path.StartsWith("/api/tasks", StringComparison.Ordinal) ||
                path.StartsWith("/api/projects", StringComparison.Ordinal)))
        {
            response.ContentLength64 = 4096;
            await response.OutputStream.WriteAsync(" "u8.ToArray());
            response.Abort();
            return;
        }
        if (DropBoardOps && path.StartsWith($"/api/whiteboards/{BoardId}/pages/", StringComparison.Ordinal) && path.EndsWith("/ops"))
        {
            response.Abort();
            return;
        }
        if (path == "/api/system/status") payload = new { maintenanceMode = false, aiEnabled = AiEnabled, registrationsEnabled = true };
        else if (path == "/api/auth/demo") payload = new { email = "fixture@example.com", password = "fixture-password" };
        else if (path is "/api/auth/login" or "/api/auth/reactivate" or "/api/auth/forgot-password" or "/api/auth/verify-otp" or "/api/auth/reset-password" or "/api/auth/register")
        {
            using var document = await JsonDocument.ParseAsync(request.InputStream);
            var auth = document.RootElement;
            if (path == "/api/auth/login" && auth.Text("email") == "fixture-archived@example.com")
            {
                response.StatusCode = 401;
                payload = new { message = "Account is archived. Please reactivate it first." };
            }
            else if (path == "/api/auth/register")
            {
                SignupEmail = auth.Text("email");
                SignupUsername = auth.Text("username");
                payload = new { message = "Fixture registration code sent." };
            }
            else if (path == "/api/auth/verify-otp" && auth.Text("code") != "123456")
            {
                response.StatusCode = 400;
                payload = new { message = "Invalid OTP code" };
            }
            else if (path == "/api/auth/login" || path == "/api/auth/verify-otp" && auth.Text("purpose") == "REACTIVATE")
                payload = new { accessToken = "nova-smoke-fixture", user = account };
            else
            {
                if (path == "/api/auth/reactivate" && auth.Text("email") == "fixture-archived@example.com") ReactivationRequests++;
                if (path == "/api/auth/reset-password" && auth.Text("email") == "fixture-restore@example.com" &&
                    auth.Text("code") == "123456" && auth.Text("newPassword") == "fixture-new-password") PasswordResetCount++;
                payload = new { message = "Fixture verification accepted." };
            }
        }
        else if (request.Headers["Authorization"] != "Bearer nova-smoke-fixture")
        { response.StatusCode = 401; payload = new { message = "Sign in first." }; }
        else if (demo && path.StartsWith("/api/admin/", StringComparison.Ordinal))
        { response.StatusCode = 403; payload = new { message = "Super Admin required." }; }
        else
        {
            JsonElement input = default;
            if (request.HasEntityBody && request.ContentType?.StartsWith("application/json", StringComparison.OrdinalIgnoreCase) == true)
            {
                using var parsed = await JsonDocument.ParseAsync(request.InputStream);
                input = parsed.RootElement.Clone();
            }
            var isPngUpload = false;
            if (method == "PUT" && path.EndsWith("/snapshots", StringComparison.Ordinal) &&
                request.ContentType?.StartsWith("multipart/form-data", StringComparison.OrdinalIgnoreCase) == true)
            {
                using var multipart = new MemoryStream();
                await request.InputStream.CopyToAsync(multipart);
                isPngUpload = multipart.ToArray().AsSpan().IndexOf("PNG\r\n"u8) >= 0;
            }
            lock (sync)
            {
                var project = new { id = ProjectId, name = ProjectName, description = "Prepare the Windows release and verify the Nova workspace.",
                    status = "Active", ownerId = Account, owner = new { id = Account, fullName = "Fixture Owner" },
                    totalTasks = 1, totalSubtasks = 2, completedSubtasks = 1, completionPercentage = 50, nextDueDate = DateTime.Today.ToString("yyyy-MM-dd") };
                var subtask = new { id = SubtaskId, title = "Original subtask", dueDate = SubtaskDueDate };
                var task = new { id = TaskId, projectId = ProjectId, title = "Verify Windows setup", status = "To Do", priority = "High",
                    dueDate = DateTime.Today.ToString("yyyy-MM-dd"), description = TaskDescription, subtasks = new[] { subtask },
                    activities = new[] { new { type = "CREATED", content = "Task created in the workspace", createdAt = DateTimeOffset.UtcNow,
                        createdBy = new { fullName = "Fixture Owner" } } } };
                var subscription = new { id = "sample", service = "Example", amount = "12", currency = SubscriptionCurrency, status = SubscriptionStatus,
                    trialEndsAt = SubscriptionTrialDate,
                    nextChargeAt = DateTime.Today.AddDays(SubscriptionDueNow ? 0 : 3).AddMonths(SubscriptionRenewals).ToString("yyyy-MM-dd") };
                var board = new { id = BoardId, title = "Planning board", projectId = ProjectId, myRole = demo ? "VIEWER" : "ADMIN",
                    autoSaveSnapshotOnExit = true, pages = new[] {
                        new { id = FirstBoardPage, version = boardVersion, documentJson = new { canvas = new { width = 1200, height = 800 }, strokes = BoardStrokes.Values.ToArray() } },
                        new { id = SecondBoardPage, version = 1, documentJson = new { canvas = new { width = 1200, height = 800 }, strokes = Array.Empty<JsonElement>() } }
                    } };
                payload = path switch
                {
                    "/api/users/me" => new { account.id, account.fullName, account.roleTitle, account.username, account.isDemo, account.accountRole,
                        projects = new[] { new { project.id, project.name, project.status, role = "OWNER", userTasksCount = 3, completedUserTasksCount = 2 } } },
                    "/api/dashboard" => new { metrics = new { tasksDueToday = 1, activeProjectsCount = 1, productivityPercentage = 70 },
                        @continue = new { lastProject = project, lastWhiteboard = board, dueToday = new[] { task } },
                        urgentTasks = new[] { new { task.id, task.title, task.priority, task.dueDate, projectName = project.name, dueLabel = "Today" } },
                        activity = new Dictionary<string, object> { [DateTime.Today.ToString("yyyy-MM-dd")] = new[] { task } } },
                    "/api/projects" => new[] { project },
                    "/api/timeline" => new { items = new[] { task }, subscriptions = new[] {
                        new { subscription.id, subscription.service, subscription.amount, subscription.currency, subscription.status,
                            occursAt = DateTime.Today.ToString("yyyy-MM-dd") } } },
                    "/api/subscriptions" => new { items = new[] { subscription } },
                    "/api/whiteboards" => new[] { board },
                    "/api/device-tokens/notifications" => NotificationPage(request.QueryString["page"], request.QueryString["limit"]),
                    "/api/admin/overview" => new { counts = new { users = 12, activeUsers = 8, projects = 4, tasks = 22, boards = 3, openTickets = 2, aiToday = 4 },
                        http = new { requestsLastHour = 22, errorRate = 0.01, avgLatencyMs = 35 }, settings = new { registrationsEnabled = true, aiEnabled = true, defaultAiDailyQuota = 10 },
                        signupFunnel = new { registered = 12, verified = 8, withProject = 4 }, integrations = new { supabase = true, gemini = true, firebase = true, emailjs = true } },
                    "/api/admin/users" => new { data = new[] { new { id = Account, fullName = "Nova Admin", email = "fixture@example.com", role = "SUPER_ADMIN", status = "ACTIVE" } }, page = 1, limit = 20, total = 1 },
                    "/api/admin/demo/overview" => new { sessionsToday = 2, sessionsWeek = 7, uniqueVisitorsWeek = 6, liveSessions = 1 },
                    "/api/admin/demo/sessions" => new { data = new[] { new { id = "demo-session", startedAt = DateTime.UtcNow, platform = "web", mutationCount = 2 } }, total = 1 },
                    "/api/admin/support/tickets" => new { data = new[] { new { id = "ticket", title = "Fixture ticket", priority = "NORMAL", status = "OPEN" } }, total = 1 },
                    "/api/admin/notifications/broadcasts" => new[] { new { id = "broadcast", title = "Fixture announcement", scope = "ALL", createdAt = DateTime.UtcNow } },
                    "/api/admin/ai/usage" => new { today = 4, month = 18, settings = new { aiEnabled = AiEnabled, defaultAiDailyQuota = 20 },
                        byUser = new[] { new { userId = Account, _count = new { userId = 18 } } } },
                    "/api/search" => new { projects = new[] { project }, whiteboards = new[] { board }, tasks = new[] { task },
                        subscriptions = new[] { subscription }, notes = new[] { new { id = NoteId, title = "Nova release notes", preview = "Verify the release" } },
                        users = new[] { new { id = Account, name = account.fullName, username = account.username } } },
                    "/api/admin/audit" => new { data = new[] { new { id = "audit", action = "AI_QUOTA_UPDATE", targetType = "User", targetId = Account } }, total = 1 },
                    "/api/whiteboard-invites/fixture-invite" => new { title = board.title, role = "VIEWER" },
                    _ => null
                };
                if (path == "/api/admin/settings" && method == "PATCH" && input.Field("aiEnabled").ValueKind is JsonValueKind.True or JsonValueKind.False)
                {
                    AiEnabled = input.Flag("aiEnabled");
                    payload = new { aiEnabled = AiEnabled };
                }
                if (path == "/api/device-tokens/notifications/read" && method == "PATCH")
                {
                    var id = input.Text("notificationId");
                    var updated = 0;
                    for (var i = 0; i < inbox.Count; i++)
                    {
                        if (id.Length > 0 && inbox[i].id.ToString() != id) continue;
                        inbox[i] = inbox[i] with { isRead = true };
                        updated++;
                    }
                    NotificationReads += updated;
                    payload = new { count = updated };
                }
                if (path == "/api/users/search") payload = new { users = new[] { new { id = ChecklistFixtureMember, fullName = "Checklist member" } } };
                if (path == "/api/projects" && method == "POST" && input.Text("name") == "Launch crew")
                {
                    CreatedTeamProject = Guid.NewGuid().ToString();
                    payload = new { id = CreatedTeamProject, name = "Launch crew" };
                }
                if (CreatedTeamProject.Length > 0 && path == $"/api/projects/{CreatedTeamProject}")
                    payload = new { id = CreatedTeamProject, name = "Launch crew", ownerId = Account,
                        members = AddedProjectRole.Length == 0 ? null : new[] { new { userId = ChecklistFixtureMember, role = AddedProjectRole } } };
                if (CreatedTeamProject.Length > 0 && path == $"/api/tasks/project/{CreatedTeamProject}") payload = Array.Empty<object>();
                if (CreatedTeamProject.Length > 0 && path == $"/api/projects/{CreatedTeamProject}/members" && method == "POST" &&
                    input.Text("userId") == ChecklistFixtureMember)
                {
                    AddedProjectRole = input.Text("role");
                    // Match the real server when membership saves and the email transport fails.
                    response.StatusCode = 502;
                    payload = new { message = "Test provider did not send the email" };
                }
                if (path == $"/api/projects/{ProjectId}")
                {
                    if (method == "PATCH") ProjectName = input.Text("name", ProjectName);
                    payload = new { project.id, name = ProjectName, project.description, project.owner, project.ownerId, project.status,
                        members = new[] { new { userId = ChecklistFixtureMember, fullName = "Checklist member", username = "checklist_member", role = "MEMBER" } } };
                }
                if (path == $"/api/project-suggestions/project/{ProjectId}")
                    payload = new[] { new { id = "sample-idea", content = "Plan the next release", status = SuggestionStatus,
                        createdById = Account, createdBy = new { id = Account, fullName = "Fixture Owner" }, createdAt = DateTimeOffset.UtcNow } };
                if (path == "/api/project-suggestions/sample-idea" && method == "PATCH")
                {
                    SuggestionStatus = input.Text("status", SuggestionStatus);
                    payload = new { id = "sample-idea", status = SuggestionStatus };
                }
                if (path == $"/api/projects/{ProjectId}/whiteboards")
                {
                    ProjectBoardsRead = true;
                    payload = new[] { board };
                }
                if (path == $"/api/tasks/project/{ProjectId}") payload = new[] { task };
                if (path == $"/api/tasks/{TaskId}")
                {
                    if (method == "PATCH")
                    {
                        TaskDescription = input.Text("description", TaskDescription);
                        if (input.Field("base").ValueKind == JsonValueKind.Object) TaskPatchesWithBase++;
                    }
                    payload = task;
                }
                if (path == $"/api/subtasks/{SubtaskId}" && method == "PATCH")
                {
                    SubtaskDueDate = input.Text("dueDate");
                    payload = subtask;
                }
                if (path == "/api/subtasks" && method == "POST")
                {
                    AddedSubtasks.Add(input.Text("title"));
                    payload = new { id = Guid.NewGuid(), title = input.Text("title") };
                }
                if (path == "/api/tasks" && method == "POST")
                {
                    WorkspaceTaskCreates++;
                    if (FailTaskCreateAcknowledgement) response.StatusCode = 502;
                    var id = Guid.NewGuid().ToString();
                    if (input.Text("title") == "Initial checklist settings")
                    {
                        createdChecklistTask = id;
                        InitialChecklistDate = input.Items("subtasks").Single().Text("dueDate");
                    }
                    if (input.Text("title") == "Convert the launch note" && input.Text("projectId") == ProjectId)
                    {
                        ConvertedTask = id;
                        ConvertedChecklist = input.Items("subtasks").Select(item => item.Text("title")).ToArray();
                    }
                    payload = new { id, title = input.Text("title") };
                }
                if (createdChecklistTask.Length > 0 && path == $"/api/tasks/{createdChecklistTask}" && method == "GET")
                    payload = new { id = createdChecklistTask, subtasks = new[] { new { id = ChecklistFixtureSubtask,
                        title = "Verify launch", dueDate = InitialChecklistDate, isCompleted = InitialChecklistCompleted } } };
                if (ConvertedTask.Length > 0 && path == $"/api/tasks/{ConvertedTask}" && method == "GET")
                {
                    var completed = new { id = ConvertedFirstSubtask, title = "Ship it", isCompleted = ConvertedSubtaskPatches > 0 };
                    var open = new { id = ConvertedSecondSubtask, title = "Ship it", isCompleted = false };
                    var last = new { id = ConvertedThirdSubtask, title = "Follow up", isCompleted = false };
                    payload = new { id = ConvertedTask, subtasks = ConvertedSubtaskPatches == 0 ? new[] { completed, open, last } : new[] { open, completed, last } };
                }
                if ((path == $"/api/subtasks/{ConvertedFirstSubtask}" || path == $"/api/subtasks/{ConvertedSecondSubtask}") && method == "PATCH")
                {
                    ConvertedSubtaskPatches++;
                    response.StatusCode = 502;
                    payload = new { message = "Completion saved but response lost" };
                }
                if (path == $"/api/subtasks/{ChecklistFixtureSubtask}" && method == "PATCH")
                {
                    InitialChecklistCompleted = input.Flag("isCompleted");
                    payload = new { id = ChecklistFixtureSubtask, isCompleted = InitialChecklistCompleted };
                }
                if (path == "/api/subtasks/assign" && method == "POST")
                {
                    InitialChecklistAssigned = input.Items("assignments").Any(item => item.Text("userId") == ChecklistFixtureMember &&
                        item.Items("subtaskIds").Any(id => id.GetString() == ChecklistFixtureSubtask));
                    payload = new { message = "Assigned" };
                }
                if (path == "/api/tasks/ai-suggest" && !demo)
                {
                    AiInputIncludedOriginal = input.Items("existingSubtasks").Any(item => item.GetString() == "Original subtask");
                    payload = new { description = "Updated from the AI fixture", priority = "HIGH", dueDate = DateTime.Today.AddDays(7).ToString("yyyy-MM-dd"),
                        subTasks = new[] { "Original subtask", "Review changes" } };
                }
                if (path == "/api/subscriptions/sample")
                {
                    if (method == "PATCH")
                    {
                        SubscriptionStatus = input.Text("status", SubscriptionStatus);
                        SubscriptionCurrency = input.Text("currency", SubscriptionCurrency);
                        SubscriptionTrialDate = input.Text("trialEndsAt", SubscriptionTrialDate);
                    }
                    payload = subscription;
                }
                if (path == "/api/subscriptions/sample/renew" && method == "POST")
                {
                    SubscriptionRenewals++;
                    payload = subscription;
                }
                if (path == "/api/support/tickets" && method == "POST")
                {
                    SupportWasMultipart = request.ContentType?.StartsWith("multipart/form-data;") == true;
                    payload = new { id = Guid.NewGuid() };
                }
                if (path == "/api/whiteboard-invites/fixture-invite/accept" && method == "POST")
                {
                    InviteAccepted = true;
                    payload = board;
                }
                if (path == $"/api/whiteboards/{BoardId}/invites" && method == "POST")
                {
                    LastInviteRole = input.Text("role");
                    payload = new { url = "/whiteboard/join/fixture-generated-link", role = LastInviteRole };
                }
                const string taskCommentId = "30000000-0000-0000-0000-000000000017";
                if (method == "PATCH" && path == $"/api/task-comments/{taskCommentId}/close")
                {
                    TaskCommentClosed = true;
                    payload = new { id = taskCommentId, status = "CLOSED" };
                }
                if (path == $"/api/task-comments/task/{TaskId}") payload = new[] { new
                {
                    id = taskCommentId, content = "Can you check this, @checklist_member?", createdAt = DateTimeOffset.UtcNow,
                    createdBy = new { id = ChecklistFixtureMember, fullName = "Checklist member" },
                    status = TaskCommentClosed ? "CLOSED" : "OPEN"
                } };
                if (path == $"/api/whiteboards/{BoardId}") payload = board;
                if (isPngUpload && path.StartsWith($"/api/whiteboards/{BoardId}/pages/", StringComparison.Ordinal))
                {
                    var page = path.Split('/')[5];
                    PreviewUploads.Add(page);
                    payload = new { pageId = page, width = 1200, height = 800 };
                }
                if (method == "POST" && path == $"/api/whiteboards/{BoardId}/pages/{board.pages[0].id}/ops")
                {
                    foreach (var item in input.Items("removedStrokeIds")) BoardStrokes.Remove(item.GetString()!);
                    foreach (var item in input.Items("addedStrokes")) BoardStrokes[item.Id()] = item;
                    payload = new { version = ++boardVersion };
                }
                if (path == "/api/notes")
                {
                    if (method == "POST") { Creates++; SaveNote(input); payload = note; }
                    else payload = new { items = OmitNoteFromList || note.ValueKind == JsonValueKind.Undefined ? [] : new[] { note } };
                }
                if (path == $"/api/notes/{NoteId}")
                {
                    if (method == "PATCH") SaveNote(input);
                    if (method == "DELETE") { note = default; payload = new { message = "Deleted" }; }
                    else if (note.ValueKind != JsonValueKind.Undefined) payload = note;
                }
                if (payload is null) { response.StatusCode = 404; payload = new { message = "Not found" }; }
            }
        }
        response.ContentType = "application/json";
        await JsonSerializer.SerializeAsync(response.OutputStream, payload);
    }

    private void SaveNote(JsonElement input)
    {
        var updated = DateTimeOffset.UtcNow;
        if (DateTimeOffset.TryParse(note.Text("updatedAt"), out var previous) && updated <= previous)
            updated = previous.AddMilliseconds(1);
        note = JsonSerializer.SerializeToElement(new
        {
            id = NoteId, title = input.Text("title", note.Text("title")), body = input.Text("body", note.Text("body")),
            floating = input.Field("floating").ValueKind == JsonValueKind.Undefined ? note.Flag("floating") : input.Flag("floating"),
            posX = Dimension("posX"), posY = Dimension("posY"), width = Dimension("width"), height = Dimension("height"),
            color = input.Text("color", note.Text("color", "AMBER")), preview = "", updatedAt = updated,
            createdAt = note.Text("createdAt", updated.ToString("O")),
            pinned = input.Field("pinned").ValueKind == JsonValueKind.Undefined ? note.Flag("pinned") : input.Flag("pinned"),
            projectId = UpdatedField("projectId"), checklist = UpdatedField("checklist")
        });

        JsonElement? UpdatedField(string key)
        {
            var value = input.Field(key);
            if (value.ValueKind == JsonValueKind.Undefined) value = note.Field(key);
            return value.ValueKind == JsonValueKind.Undefined ? null : value;
        }

        double? Dimension(string key)
        {
            var value = UpdatedField(key) ?? default;
            return value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var result) ? result : null;
        }
    }

    public void Dispose()
    {
        lifetime.Cancel();
        listener.Close();
        lifetime.Dispose();
    }
}
#endif
