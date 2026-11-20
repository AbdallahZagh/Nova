using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using NovaTaskflow.Api;
using NovaTaskflow.Controls;
using NovaTaskflow.Live;
using NovaTaskflow.ViewModels;
using System.Collections.ObjectModel;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Text.Json;
using Windows.ApplicationModel.DataTransfer;
using Windows.Graphics.Imaging;
using Windows.Storage;
using Windows.System;
using Windows.Storage.Pickers;
using Windows.Storage.Streams;
using WinRT.Interop;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow
{
    private string preferredBoardPage = "";
    private readonly HashSet<string> dirtyBoardPreviews = [];
    private static string BoardPath(string id) => $"/api/whiteboards/{Ui.PathId(id)}";

    private async Task Whiteboards(WorkspacePage page, string projectId, CancellationToken cancellation)
    {
        page.Title = "Whiteboards";
        page.Subtitle = "Personal and project boards";
        Task Create() => CreateBoard(projectId);
        if (!Demo)
        {
            page.ActionItems.Add(Ui.Button("Join whiteboard", () => { OpenNovaLink(true); return Task.CompletedTask; }));
            page.ActionItems.Add(Ui.Button("New board", Create, true));
        }
        var path = projectId.Length == 0 ? "/api/whiteboards" : $"/api/projects/{Ui.PathId(projectId)}/whiteboards";
        var data = await Task.WhenAll(api.Get(path, cancellation), api.Get("/api/projects", cancellation));
        cancellation.ThrowIfCancellationRequested();
        var projects = data[1].Items("projects").ToArray();
        var selected = 1 + Array.FindIndex(projects, project => project.Id() == projectId);
        var scope = Ui.Choice("", new[] { "All boards" }.Concat(projects.Select(project => project.Text("name"))), "All boards");
        Ui.Name(scope, "Filter whiteboards by project");
        scope.SelectedIndex = selected;
        scope.SelectionChanged += (_, _) => Run(() => Go("Whiteboard",
            scope.SelectedIndex > 0 ? projects[scope.SelectedIndex - 1].Id() : ""));
        var search = Ui.Search("Find a whiteboard", 220);
        Ui.Name(search, "Find a whiteboard");
        page.FilterItems.Add(Ui.Wrap(search, scope));
        var cards = data[0].Items("data").Select(board =>
        {
            var ownerProject = projects.FirstOrDefault(project => project.Id() == board.Text("projectId"));
            var imageUrl = board.Field("snapshot").Text("imageUrl");
            var preview = Uri.TryCreate(imageUrl, UriKind.Absolute, out var image) && image.Scheme is "http" or "https"
                ? new BitmapImage(image) { DecodePixelWidth = 480 } : null;
            return new BoardCard(board.Id(), board.Text("title", "Untitled board"),
                $"{board.Field("project").Text("name", ownerProject.Text("name", "Personal"))} · {Ui.DateLabel(board.Text("lastEditedAt", board.Text("updatedAt")))}",
                preview, board);
        }).ToArray();
        var library = new BoardLibrary();
        library.OpenRequested += id => Run(() => Go("Board", id));
        library.OptionsRequested += card => Run(() => BoardActions(card.Board));
        search.TextChanged += (_, _) => Draw();
        Draw();

        void Draw()
        {
            var shown = cards.Where(card => card.Title.Contains(search.Text.Trim(), StringComparison.OrdinalIgnoreCase)).ToArray();
            if (shown.Length > 0)
            {
                library.Items = shown;
                page.Body = library;
            }
            else if (cards.Length > 0)
                page.Empty("No whiteboards match.", "Clear search", () => { search.Text = ""; return Task.CompletedTask; });
            else
                page.Empty("No whiteboards yet.", Demo ? "Refresh" : "New board", Demo ? () => Go("Whiteboard", projectId, true) : Create);
        }
    }

    private async Task CreateBoard(string projectId)
    {
        var panel = Ui.Stack(Ui.Subtitle("Loading projects…"));
        Drawer("New board", panel);
        var projects = (await api.Get("/api/projects", overlayCancellation.Token)).Items("projects").ToArray();
        panel.Children.Clear();
        var title = Ui.Input("Name");
        var project = Ui.Choice("Project", new[] { "Personal" }.Concat(projects.Select(row => row.Text("name"))), "Personal");
        project.SelectedIndex = 1 + Array.FindIndex(projects, row => row.Id() == projectId);
        panel.Children.Add(title);
        panel.Children.Add(project);
        panel.Children.Add(ActionButton("Create", async () =>
        {
            var input = new Dictionary<string, string>();
            if (title.Text.Trim().Length > 0) input["title"] = title.Text.Trim();
            if (project.SelectedIndex > 0) input["projectId"] = projects[project.SelectedIndex - 1].Id();
            var saved = await api.Post("/api/whiteboards", input);
            await Go("Board", saved.Id());
        }, true, "Creating…"));
    }

    private Task BoardActions(JsonElement board)
    {
        var panel = Ui.Stack(Ui.Button("Open", () => Go("Board", board.Id()), true));
        if (!Demo) panel.Children.Add(ActionButton("Duplicate", async () =>
        {
            var copy = await api.Post(BoardPath(board.Id()) + "/duplicate");
            await Go("Board", copy.Id());
        }));
        if (CanManageBoard(board))
        {
            panel.Children.Add(Ui.Button("Rename", () => RenameBoard(board)));
            panel.Children.Add(ActionButton("Copy share link", () => CopyBoardInvite(board.Id(), "VIEWER")));
            panel.Children.Add(ActionButton("Delete", async () =>
            {
                if (!await Confirm("Delete whiteboard?", "This permanently removes the board and its pages.", "Delete")) return;
                await api.Delete(BoardPath(board.Id()));
                await Go("Whiteboard", route == "Whiteboard" ? routeId : "", refresh: true);
            }));
        }
        Drawer(board.Text("title", "Whiteboard"), panel);
        return Task.CompletedTask;
    }

    private bool CanDrawOnBoard(JsonElement board)
        => board.Text("myRole") is "ADMIN" or "MEMBER" || board.Text("createdById") == user.Id();

    private bool CanManageBoard(JsonElement board)
        => !Demo && (board.Text("myRole") == "ADMIN" || board.Text("createdById") == user.Id());

    private Task RenameBoard(JsonElement board)
    {
        var name = Ui.Input("Name", board.Text("title"));
        Drawer("Rename whiteboard", Ui.Stack(name, ActionButton("Rename", async () =>
        {
            if (name.Text.Trim().Length == 0) return;
            await api.Patch(BoardPath(board.Id()), new { title = name.Text.Trim() });
            await Go(route, routeId, true);
        }, true)));
        return Task.CompletedTask;
    }

    private async Task Board(WorkspacePage page, string id, CancellationToken cancellation)
    {
        var path = BoardPath(id);
        var board = await api.Get(path, cancellation);
        var pages = board.Items("pages").ToArray();
        page.Title = board.Text("title", "Untitled board");
        var people = board.Items("members").Select(member => member.Text("fullName")).Where(name => name.Length > 0).ToArray();
        page.Subtitle = people.Length == 0 ? "Personal whiteboard" : string.Join(" · ", people.Take(6));
        var writable = CanDrawOnBoard(board);
        var manage = CanManageBoard(board);
        var pageRows = Ui.Wrap(Ui.Button("Back", () => Go("Whiteboard", board.Text("projectId"))));
        page.FilterItems.Add(pageRows);
        var presence = Ui.Row();
        page.FilterItems.Add(presence);
        var actionMenu = new MenuFlyout();
        if (manage) AddBoardAction("Rename board", () => RenameBoard(board));
        AddBoardAction("Members", () => BoardMembers(board));
        AddBoardAction("Comments", () => BoardComments(board));
        if (writable) AddBoardAction("Activity", () => BoardActivity(id));
        if (manage) AddBoardAction("Share", () => ShareBoard(board.Id()));
        var boardActions = Ui.Button("Actions");
        boardActions.Flyout = actionMenu;
        Ui.Name(boardActions, "Board actions");
        pageRows.Children.Add(boardActions);
        var selected = Array.FindIndex(pages, item => item.Id() == preferredBoardPage);
        selected = Math.Max(0, selected);
        preferredBoardPage = "";
        if (pages.Length == 0)
        {
            var canAdd = writable && !Demo;
            page.Empty("This whiteboard has no pages.", canAdd ? "New page" : "Back", canAdd ? async () =>
            {
                await api.Post(path + "/pages"); await Go("Board", id, true);
            } : () => Go("Whiteboard"));
            return;
        }
        var active = pages[selected];
        var pageId = active.Id();
        var canSnapshot = manage || (Demo && board.Text("myRole") == "ADMIN" && active.Field("snapshot").ValueKind != JsonValueKind.Object);
        var pagePath = $"{path}/pages/{Ui.PathId(pageId)}";
        var panel = new BoardCanvas { ReadOnly = !writable };
        var version = active.Number("version");
        var previous = new Stack<BoardChange>();
        var forward = new Stack<BoardChange>();
        var draft = new BoardDraft(Path.Combine(DesktopSettings.AppFolder, "board-drafts"), api.Endpoint, user.Id(), id, pageId);
        var pending = new List<BoardChange>();
        var storedLocally = true;
        var gate = new SemaphoreSlim(1);
        NotesChannel? live = null;
        var autoSnapshot = board.Flag("autoSaveSnapshotOnExit");
        var status = Ui.Subtitle("");
        SetStatus(writable ? "" : "View-only whiteboard");
        var snapshotNeeded = false;
        Load(active);
        if (writable)
        {
            try
            {
                pending.AddRange(draft.Read());
                foreach (var change in pending) panel.Apply(change);
                snapshotNeeded = pending.Count > 0;
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Security.Cryptography.CryptographicException or JsonException)
            {
                panel.ReadOnly = true;
                writable = false;
                SetStatus("This desktop could not open the saved ink. Your local copy was kept.");
            }
        }
        var canvasCard = Ui.Card(panel);
        canvasCard.Padding = new Thickness(5);
        page.Body = canvasCard;
        var zoomLevel = Ui.Subtitle("100%");
        zoomLevel.VerticalAlignment = VerticalAlignment.Center;
        panel.ZoomChanged += zoom => zoomLevel.Text = zoom.ToString("P0");
        var zoomOut = Ui.Button("−", () => { panel.ZoomBy(.8f); return Task.CompletedTask; });
        var zoomIn = Ui.Button("+", () => { panel.ZoomBy(1.25f); return Task.CompletedTask; });
        var fit = Ui.Button("Fit", () => { panel.FitPage(); return Task.CompletedTask; });
        Ui.Name(zoomOut, "Zoom out");
        Ui.Name(zoomIn, "Zoom in");
        Ui.Name(fit, "Fit whiteboard page");
        ToolTipService.SetToolTip(fit, "Fit page. Drag with Space or the middle mouse button to pan. Use Ctrl+wheel to zoom.");
        pageRows.Children.Add(Ui.Wrap(zoomOut, zoomLevel, zoomIn, fit));
        panel.Changed += change =>
        {
            panel.Apply(change);
            previous.Push(change);
            forward.Clear();
            QueueChange(change);
            Run(SaveChanges);
        };
        panel.TextRequested += (point, sticky) =>
        {
            var text = Ui.Input(sticky ? "Sticky text" : "Text", multiline: true);
            text.MaxLength = 180;
            Drawer(sticky ? "Add sticky" : "Add text", Ui.Stack(text, Ui.Button("Add", async () =>
            {
                if (string.IsNullOrWhiteSpace(text.Text)) return;
                panel.AddText(point, text.Text.Trim(), sticky);
                await CloseOverlay();
            }, true)), true);
        };
        if (CanDrawOnBoard(board))
            AddBoardAction("Export", () => ExportBoard(board, pageId, manage, SaveChanges));
        var picker = Ui.Choice("", pages.Select((item, i) => settings.PageNames.TryGetValue(item.Id(), out var name) ? name : $"Page {i + 1}"), "");
        picker.SelectedIndex = selected;
        picker.SelectionChanged += (_, _) => Run(async () =>
        {
            if (picker.SelectedIndex < 0 || picker.SelectedIndex == selected) return;
            preferredBoardPage = pages[picker.SelectedIndex].Id();
            await Go("Board", id, true);
            if (!cancellation.IsCancellationRequested) picker.SelectedIndex = selected;
        });
        pageRows.Children.Add(picker);
        if (writable && !Demo)
        {
            if (manage) AddBoardAction("Board settings", () =>
            {
                var preference = new CheckBox { Content = "Automatically save page snapshots", IsChecked = autoSnapshot };
                Drawer("Board settings", Ui.Stack(preference, ActionButton("Save settings", async () =>
                {
                    var enable = preference.IsChecked == true;
                    await api.Patch(path, new { autoSaveSnapshotOnExit = enable });
                    autoSnapshot = enable;
                    await CloseOverlay();
                    Toast("Board settings saved.");
                }, true)), true);
                return Task.CompletedTask;
            });
            AddBoardAction("New page", async () =>
            {
                await SaveChanges();
                var saved = await api.Post(path + "/pages");
                var added = saved.Items("pages").LastOrDefault();
                preferredBoardPage = added.Id();
                if (live is not null && added.Id().Length > 0) await live.Broadcast("page:add", added, cancellation);
                await Go("Board", id, true);
            });
            var menu = new MenuFlyoutSubItem { Text = "Page actions" };
            var rename = new MenuFlyoutItem { Text = "Rename page" };
            rename.Click += (_, _) =>
            {
                var name = Ui.Input("Name", picker.Selected());
                Drawer("Rename page", Ui.Stack(name, Ui.Subtitle("The page name is saved on this desktop."), ActionButton("Rename", async () =>
                {
                    if (name.Text.Trim().Length == 0) return;
                    settings.PageNames[pageId] = name.Text.Trim();
                    settings.Save();
                    preferredBoardPage = pageId;
                    await Go("Board", id, true);
                }, true)));
            };
            menu.Items.Add(rename);
            if (manage && pages.Length > 1)
            {
                var delete = new MenuFlyoutItem { Text = "Delete page" };
                delete.Click += (_, _) => Run(async () =>
                {
                    if (!await Confirm("Delete page?", "This removes the page and its ink.", "Delete")) return;
                    await SaveChanges();
                    await api.Delete(pagePath);
                    if (live is not null) await live.Broadcast("page:remove", new { pageId }, cancellation);
                    snapshotNeeded = false;
                    await Go("Board", id, true);
                });
                menu.Items.Add(delete);
            }
            actionMenu.Items.Add(menu);
        }
        if (writable)
        {
            AddHistoryShortcut(VirtualKey.Z, VirtualKeyModifiers.Control, false);
            AddHistoryShortcut(VirtualKey.Y, VirtualKeyModifiers.Control, true);
            AddHistoryShortcut(VirtualKey.Z, VirtualKeyModifiers.Control | VirtualKeyModifiers.Shift, true);
            var tools = Ui.Choice("Tool", ["Select", "Pen", "Highlighter", "Eraser", "Line", "Rectangle", "Ellipse", "Text", "Sticky"], "Pen");
            var widths = new Dictionary<string, double> { ["Pen"] = 4, ["Highlighter"] = 16, ["Eraser"] = 26 };
            var thickness = new Slider { Header = "Thickness", Minimum = 1, Maximum = 40, Value = 4, Width = 125 };
            var changingTool = false;
            thickness.ValueChanged += (_, args) =>
            {
                if (changingTool) return;
                panel.StrokeWidth = widths[panel.Tool] = args.NewValue;
            };
            tools.SelectionChanged += (_, _) =>
            {
                var tool = tools.Selected();
                panel.Tool = tool;
                changingTool = true;
                thickness.Minimum = tool == "Eraser" ? 8 : 1;
                thickness.Maximum = tool == "Eraser" ? 120 : 40;
                thickness.Value = panel.StrokeWidth = widths.GetValueOrDefault(tool, 4);
                changingTool = false;
                thickness.IsEnabled = tool is not ("Select" or "Text" or "Sticky");
            };
            var toolRow = Ui.Wrap(tools, thickness);
            foreach (var (label, hex, color) in new[] {
                ("Orange", "#E66A17", Colors.DarkOrange), ("Black", "#282421", Colors.Black), ("White", "#FFFFFF", Colors.White),
                ("Red", "#DC594D", Colors.Tomato), ("Green", "#4EAD79", Colors.SeaGreen), ("Blue", "#5595DE", Colors.CornflowerBlue) })
            {
                var swatch = Ui.Button("", () => { panel.Ink = hex; return Task.CompletedTask; });
                swatch.Content = new Border { Width = 13, Height = 13, Background = new SolidColorBrush(color), CornerRadius = new CornerRadius(7) };
                swatch.Padding = new Thickness(5);
                ToolTipService.SetToolTip(swatch, label);
                Ui.Name(swatch, label);
                toolRow.Children.Add(swatch);
            }
            toolRow.Children.Add(Ui.Button("More colors", () =>
            {
                var colors = new ColorPicker { IsAlphaEnabled = false, IsAlphaSliderVisible = false,
                    IsAlphaTextInputVisible = false, IsHexInputVisible = true };
                if (uint.TryParse(panel.Ink.TrimStart('#'), System.Globalization.NumberStyles.HexNumber,
                    System.Globalization.CultureInfo.InvariantCulture, out var rgb)) colors.Color = Ui.Rgb(rgb);
                Drawer("Ink color", Ui.Stack(colors, Ui.Button("Use color", async () =>
                {
                    var color = colors.Color;
                    panel.Ink = $"#{color.R:X2}{color.G:X2}{color.B:X2}";
                    await CloseOverlay();
                }, true)), true);
                return Task.CompletedTask;
            }));
            toolRow.Children.Add(ActionButton("Undo", () => Undo(false)));
            toolRow.Children.Add(ActionButton("Redo", () => Undo(true)));
            AddBoardAction("Clear current page", async () =>
            {
                if (!await Confirm("Clear this whiteboard page?", "This removes every stroke from this page for all collaborators.", "Clear page")) return;
                panel.ClearPage();
            });
            var toolsToggle = new ToggleButton
            {
                Content = new FontIcon { Glyph = "\uE70F", FontSize = 16 },
                MinHeight = 36, MinWidth = 36, Padding = new Thickness(8, 0, 8, 0), CornerRadius = new CornerRadius(11)
            };
            Ui.Name(toolsToggle, "Drawing tools");
            ToolTipService.SetToolTip(toolsToggle, "Drawing tools");
            toolsToggle.Checked += (_, _) => AlignToolbar();
            toolsToggle.Unchecked += (_, _) => AlignToolbar();
            pageRows.Children.Add(toolsToggle);
            page.FilterItems.Add(toolRow);
            page.SizeChanged += (_, _) => AlignToolbar();
            AlignToolbar();

            void AlignToolbar()
            {
                var compact = page.ActualWidth < 740 || page.ActualHeight < 570;
                toolsToggle.Visibility = compact ? Visibility.Visible : Visibility.Collapsed;
                toolRow.Visibility = !compact || toolsToggle.IsChecked == true ? Visibility.Visible : Visibility.Collapsed;
            }
        }
        page.FilterItems.Add(status);

        void SetStatus(string message)
        {
            status.Text = message;
            status.Visibility = message.Length == 0 ? Visibility.Collapsed : Visibility.Visible;
        }

        leavePage = async () =>
        {
            var boardsNeedPreviews = manage && dirtyBoardPreviews.Contains(id);
            if (!snapshotNeeded && pending.Count == 0 && !boardsNeedPreviews) return true;
            if (api.IsOffline && storedLocally) return true;
            try { await SaveChanges(); }
            catch (IOException) when (storedLocally)
            {
                Toast("Ink saved on this PC. Open this whiteboard when you’re online to sync it.", InfoBarSeverity.Informational);
                return true;
            }
            catch (Exception error)
            {
                Toast(error.Message, InfoBarSeverity.Error);
                return false;
            }
            if (!canSnapshot) return true;
            if (manage && preferredBoardPage.Length > 0)
            {
                dirtyBoardPreviews.Add(id);
                return true;
            }
            if (!autoSnapshot)
            {
                var prompt = new ContentDialog
                {
                    XamlRoot = Root.XamlRoot,
                    Title = manage ? "Save page previews?" : "Save snapshot?",
                    Content = Ui.Text(manage ? "Your drawing is saved. Update the board’s page previews before leaving?" :
                        "Your drawing is saved. You can save an updated page preview before leaving."),
                    PrimaryButtonText = "Save and leave",
                    SecondaryButtonText = "Leave",
                    CloseButtonText = "Stay",
                    DefaultButton = ContentDialogButton.Primary
                };
                switch (await prompt.ShowAsync())
                {
                    case ContentDialogResult.Secondary:
                        dirtyBoardPreviews.Remove(id);
                        return true;
                    case ContentDialogResult.None: return false;
                }
            }
            try
            {
                if (manage)
                {
                    await SaveBoardPreviews(id, null, cancellation);
                    dirtyBoardPreviews.Remove(id);
                }
                else await SaveSnapshot();
                return true;
            }
            catch (IOException) { return true; }
            catch (Exception error) { Toast(error.Message, InfoBarSeverity.Error); return false; }
        };
        if (pending.Count > 0) Run(SaveChanges);
        _ = PeerRefresh();
        if (api.Endpoint == DesktopSettings.DefaultServer ||
            Environment.GetEnvironmentVariable("NOVA_SUPABASE_URL") is { Length: > 0 })
        {
            live = NotesChannel.Whiteboard(id, new BoardPresence(user.Id(), PersonName.Text, "#E66A17"),
                () => DispatcherQueue.TryEnqueue(() => Run(async () =>
                {
                    await Task.Delay(550, cancellation);
                    await ReloadPeers();
                })),
                peers => DispatcherQueue.TryEnqueue(() =>
                {
                    if (cancellation.IsCancellationRequested) return;
                    panel.KeepPeers(peers);
                    presence.Children.Clear();
                    foreach (var peer in peers.Take(8))
                    {
                        var avatar = new PersonPicture { DisplayName = peer.Name, Width = 29, Height = 29 };
                        ToolTipService.SetToolTip(avatar, peer.Name);
                        presence.Children.Add(avatar);
                    }
                    if (peers.Count > 8) presence.Children.Add(Ui.Subtitle($"+{peers.Count - 8}"));
                }),
                peer => DispatcherQueue.TryEnqueue(() =>
                {
                    if (!cancellation.IsCancellationRequested) panel.ShowPeer(peer);
                }));
            var self = user.Id();
            var lastCursor = 0L;
            var cursorSend = Task.CompletedTask;
            panel.CursorMoved += point =>
            {
                var now = Environment.TickCount64;
                if (point is not null && (!cursorSend.IsCompleted || now - lastCursor < 85)) return;
                lastCursor = now;
                cursorSend = live.Broadcast("cursor", new { userId = self, platform = "desktop", x = point?.X, y = point?.Y }, cancellation);
            };
            _ = live.Listen(cancellation);
        }

        void AddBoardAction(string text, Func<Task> action)
        {
            var item = new MenuFlyoutItem { Text = text };
            item.Click += (_, _) => Run(action);
            actionMenu.Items.Add(item);
        }

        void QueueChange(BoardChange change)
        {
            pending.Add(change);
            snapshotNeeded = true;
            PersistPending();
        }

        void PersistPending()
        {
            try
            {
                draft.Save(pending);
                storedLocally = true;
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Security.Cryptography.CryptographicException)
            {
                storedLocally = false;
                SetStatus("Couldn’t save ink on this PC. Keep Nova open until it syncs.");
            }
        }

        async Task SaveChanges()
        {
            await gate.WaitAsync(cancellation);
            try
            {
                while (pending.Count > 0)
                {
                    var next = pending[0];
                    try
                    {
                        var ack = await api.Post(pagePath + "/ops", new
                        {
                            addedStrokes = next.Added, removedStrokeIds = next.Removed.Select(stroke => stroke.Id).ToArray()
                        }, cancellation);
                        pending.RemoveAt(0);
                        PersistPending();
                        var nextVersion = ack.Number("version");
                        if (nextVersion == version + 1) version = nextVersion;
                        if (live is not null)
                        {
                            var author = user.Id();
                            _ = Publish(live, next, author);
                        }
                    }
                    catch
                    {
                        SetStatus(storedLocally ? "Ink saved on this PC · waiting to sync" : "Ink unsaved · keep Nova open");
                        throw;
                    }
                }
                SetStatus("");
            }
            finally { gate.Release(); }
        }

        async Task Publish(NotesChannel channel, BoardChange change, string author)
        {
            if (change.Removed.Length > 0)
                await channel.Broadcast("stroke:remove", new { pageId, ids = change.Removed.Select(stroke => stroke.Id).ToArray() }, cancellation);
            foreach (var stroke in change.Added)
                await channel.Broadcast("stroke:add", new { pageId, stroke, userId = author, platform = "desktop" }, cancellation);
        }

        void AddHistoryShortcut(VirtualKey key, VirtualKeyModifiers modifiers, bool redo)
        {
            var shortcut = new KeyboardAccelerator { Key = key, Modifiers = modifiers, ScopeOwner = panel };
            shortcut.Invoked += (_, args) =>
            {
                args.Handled = true;
                Run(() => Undo(redo));
            };
            panel.KeyboardAccelerators.Add(shortcut);
        }

        async Task Undo(bool redo)
        {
            var source = redo ? forward : previous;
            var destination = redo ? previous : forward;
            if (!source.TryPop(out var change)) return;
            destination.Push(change);
            var applied = redo ? change : new BoardChange(change.Removed, change.Added);
            panel.Apply(applied);
            QueueChange(applied);
            await SaveChanges();
        }

        void Load(JsonElement value)
        {
            var document = value.Field("documentJson");
            var size = document.Field("canvas");
            var ink = document.Items("strokes").Select(el => el.Deserialize<BoardStroke>(BoardCanvas.JsonOptions))
                .OfType<BoardStroke>();
            panel.LoadDocument(ink, Math.Max(600, size.Number("width")), Math.Max(420, size.Number("height")));
            version = value.Number("version");
        }

        async Task PeerRefresh()
        {
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(12));
            try
            {
                while (await timer.WaitForNextTickAsync(cancellation))
                {
                    try
                    {
                        if (pending.Count > 0) await SaveChanges();
                        await ReloadPeers();
                    }
                    catch (IOException) { }
                    catch (ApiFailure) { }
                }
            }
            catch (OperationCanceledException) { }
        }

        async Task ReloadPeers()
        {
            if (panel.Editing || gate.CurrentCount == 0 || cancellation.IsCancellationRequested) return;
            var latest = await api.Get(path, cancellation);
            var pageValue = latest.Items("pages").FirstOrDefault(item => item.Id() == pageId);
            if (!panel.Editing && pending.Count == 0 && pageValue.Number("version") > version) Load(pageValue);
        }

        async Task SaveSnapshot()
        {
            var bitmap = new RenderTargetBitmap();
            await bitmap.RenderAsync(panel.DrawingSurface, (int)Math.Min(1600, panel.DocumentWidth), 0);
            var buffer = await bitmap.GetPixelsAsync();
            using var stream = new InMemoryRandomAccessStream();
            var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, stream);
            encoder.SetPixelData(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied, (uint)bitmap.PixelWidth,
                (uint)bitmap.PixelHeight, 96, 96, buffer.ToArray());
            await encoder.FlushAsync();
            using var form = new MultipartFormDataContent();
            stream.Seek(0);
            using var file = new StreamContent(stream.AsStreamForRead());
            file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
            form.Add(file, "file", "snapshot.png");
            form.Add(new StringContent(bitmap.PixelWidth.ToString()), "width");
            form.Add(new StringContent(bitmap.PixelHeight.ToString()), "height");
            await api.Send(HttpMethod.Put, pagePath + "/snapshots", form);
            snapshotNeeded = false;
        }
    }

    private async Task BoardActivity(string id)
    {
        var data = await api.Get(BoardPath(id) + "/activity", viewCancellation.Token);
        var panel = Ui.Stack();
        var activities = data.Items("data").ToArray();
        foreach (var activity in activities)
        {
            var actor = activity.Field("actor");
            panel.Children.Add(Ui.Card(Ui.Stack(
                Ui.Text($"{actor.Text("fullName", "A collaborator")} · {Label(activity.Text("type"))}"),
                Ui.Subtitle(DateStamp(activity.Text("createdAt"))),
                Fields(activity.Field("metadata"), ["title", "role", "format", "pageIndex"]))));
        }
        if (panel.Children.Count == 0) panel.Children.Add(Ui.Subtitle("No whiteboard activity yet."));
        Drawer("Board activity", panel);
    }

    private Task ExportBoard(JsonElement board, string pageId, bool writable, Func<Task> save)
    {
        var format = Ui.Choice("Format", ["PNG", "PDF", "ZIP"], "PNG");
        var scope = Ui.Choice("Pages", ["Current page", "Selected pages", "All pages"], "Current page");
        var choices = Ui.Stack();
        var options = board.Items("pages").Select((item, index) =>
        {
            var check = new CheckBox
            {
                Content = settings.PageNames.GetValueOrDefault(item.Id(), $"Page {index + 1}"),
                IsChecked = item.Id() == pageId
            };
            choices.Children.Add(check);
            return (Id: item.Id(), Check: check);
        }).ToArray();
        choices.Visibility = Visibility.Collapsed;
        scope.SelectionChanged += (_, _) => choices.Visibility = scope.SelectedIndex == 1 ? Visibility.Visible : Visibility.Collapsed;
        var saveSnapshots = new CheckBox { Content = "Save updated snapshots", IsChecked = writable,
            Visibility = writable ? Visibility.Visible : Visibility.Collapsed };
        string[] SelectedPages()
        {
            var pages = scope.SelectedIndex switch
            {
                0 => new[] { pageId },
                1 => options.Where(option => option.Check.IsChecked == true).Select(option => option.Id).ToArray(),
                _ => options.Select(option => option.Id).ToArray()
            };
            return pages.Length > 0 ? pages : throw new InvalidOperationException("Select at least one page.");
        }

        var actions = Ui.Wrap();
        var export = ActionButton("Export", async () =>
        {
            var pages = SelectedPages();
            if (format.Selected() == "PNG" && pages.Length > 1)
                throw new InvalidOperationException("Choose PDF or ZIP to export multiple pages.");
            await save();
            var extension = "." + format.Selected().ToLowerInvariant();
            var picker = new FileSavePicker { SuggestedFileName = board.Text("title", "Whiteboard") };
            picker.FileTypeChoices.Add(format.Selected(), [extension]);
            InitializeWithWindow.Initialize(picker, handle);
            var file = await picker.PickSaveFileAsync();
            if (file is null) return;
            if (saveSnapshots.IsChecked == true)
                await SaveBoardPreviews(board.Id(), pages, overlayCancellation.Token);
            var query = "?pageIds=" + Uri.EscapeDataString(string.Join(',', pages));
            var bytes = await api.Download($"{BoardPath(board.Id())}/export/{format.Selected().ToLowerInvariant()}{query}");
            await FileIO.WriteBytesAsync(file, bytes);
            await CloseOverlay();
            Toast("Whiteboard exported.");
        }, true, "Exporting…");
        actions.Children.Add(export);
        if (writable)
        {
            var previews = ActionButton("Save PNG previews", async () =>
            {
                var pages = SelectedPages();
                await save();
                await SaveBoardPreviews(board.Id(), pages, overlayCancellation.Token);
                Toast(pages.Length == 1 ? "PNG preview saved." : $"{pages.Length} PNG previews saved.");
            }, false, "Saving…");
            actions.Children.Add(previews);
        }
        Drawer("Export whiteboard", Ui.Stack(format, scope, choices, saveSnapshots, actions), true);
        return Task.CompletedTask;
    }

    private async Task SaveBoardPreviews(string boardId, string[]? selectedPages, CancellationToken cancellation)
    {
        var path = BoardPath(boardId);
        var board = await api.Get(path, cancellation);
        var pages = board.Items("pages").Where(page => selectedPages is null || selectedPages.Contains(page.Id())).ToArray();
        if (selectedPages is not null && pages.Length != selectedPages.Length)
            throw new InvalidOperationException("A selected page was removed. Reopen Export and select the available pages.");
        foreach (var page in pages)
        {
            var snapshot = WhiteboardSnapshot.Create(page.Field("documentJson"), !settings.Light);
            using var form = new MultipartFormDataContent();
            using var data = new ByteArrayContent(snapshot.Bytes);
            data.Headers.ContentType = new MediaTypeHeaderValue("image/png");
            form.Add(data, "file", "snapshot.png");
            form.Add(new StringContent(snapshot.Width.ToString()), "width");
            form.Add(new StringContent(snapshot.Height.ToString()), "height");
            await api.Send(HttpMethod.Put, $"{path}/pages/{Ui.PathId(page.Id())}/snapshots", form, cancellation: cancellation);
        }
    }

    private Task ShareBoard(string id)
    {
        var role = Ui.Choice("Invite role", ["VIEWER", "MEMBER", "ADMIN"], "VIEWER");
        Drawer("Share whiteboard", Ui.Stack(role, Ui.Subtitle("Each invitation can be used once."), Ui.Wrap(
            ActionButton("Copy invite link", () => CopyBoardInvite(id, role.Selected()), true),
            ActionButton("Share via Windows", async () => ShowBoardShare(await CreateBoardInvite(id, role.Selected()))))), true);
        return Task.CompletedTask;
    }

    private async Task CopyBoardInvite(string id, string role)
    {
        var link = await CreateBoardInvite(id, role);
        var clipboard = new DataPackage();
        clipboard.SetText(link.AbsoluteUri);
        Clipboard.SetContent(clipboard);
        Toast("Invite link copied.");
    }

    private async Task<Uri> CreateBoardInvite(string id, string role)
    {
        var invite = await api.Post(BoardPath(id) + "/invites", new { role });
        var url = invite.Text("url");
        if (url.StartsWith('/') && !url.StartsWith("//", StringComparison.Ordinal))
        {
            var frontend = Environment.GetEnvironmentVariable("NOVA_WEB_URL") ?? "https://nova-task-management.netlify.app";
            url = frontend.TrimEnd('/') + url;
        }
        return SafeExternalUri(url) ?? throw new InvalidOperationException("Nova did not return a valid invitation link.");
    }

    private DataTransferManager? boardShareManager;
    private Uri? boardShareLink;

    private void ShowBoardShare(Uri link)
    {
        var interop = DataTransferManager.As<IBoardShareInterop>();
        if (boardShareManager is null)
        {
            var interfaceId = new Guid("A5CAEE9B-8708-49D1-8D36-67D25A8DA00C");
            var pointer = interop.GetForWindow(handle, ref interfaceId);
            try { boardShareManager = WinRT.MarshalInterface<DataTransferManager>.FromAbi(pointer); }
            finally { Marshal.Release(pointer); }
            boardShareManager.DataRequested += (_, args) =>
            {
                if (boardShareLink is not { } pending) return;
                args.Request.Data.Properties.Title = "Nova whiteboard invitation";
                args.Request.Data.SetWebLink(pending);
                boardShareLink = null;
            };
        }
        boardShareLink = link;
        try { interop.ShowShareUIForWindow(handle); }
        catch (COMException)
        {
            boardShareLink = null;
            throw new InvalidOperationException("Windows Share is unavailable. Use Copy invite link.");
        }
    }

    [ComImport, Guid("3A3DCD6C-3EAB-43DC-BCDE-45671CE800C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IBoardShareInterop
    {
        nint GetForWindow(nint window, [In] ref Guid interfaceId);
        void ShowShareUIForWindow(nint window);
    }

    private Task BoardMembers(JsonElement board)
    {
        var manage = CanManageBoard(board);
        var path = BoardPath(board.Id()) + "/members";
        var body = Ui.Stack();
        string[] roles = ["MEMBER", "VIEWER", "ADMIN"];
        foreach (var member in board.Items("members"))
        {
            var roleValue = member.Text("role", "MEMBER");
            var fields = Ui.Row(Ui.Text(member.Text("fullName")));
            var userId = member.Text("userId");
            if (manage && userId != board.Text("createdById"))
            {
                var role = Ui.Choice("", roles, roleValue);
                fields.Children.Add(role);
                fields.Children.Add(ActionButton("Save role", async () =>
                {
                    await api.Patch($"{path}/{Ui.PathId(userId)}", new { role = role.Selected() });
                    Toast("Member role updated.");
                }));
                fields.Children.Add(ActionButton("Remove", async () =>
                {
                    await api.Delete($"{path}/{Ui.PathId(userId)}");
                    await BoardMembers(await api.Get(BoardPath(board.Id())));
                }));
            }
            else fields.Children.Add(Ui.Subtitle(roleValue));
            body.Children.Add(Ui.Card(fields));
        }
        if (manage)
        {
            body.Children.Add(Ui.Button("Invite by search", () => FindPerson("Invite a collaborator", roles, async (person, role) =>
            {
                await api.Post(path, new { userId = person, role });
                await BoardMembers(await api.Get(BoardPath(board.Id())));
                Toast("Collaborator added.");
            }), true));
            body.Children.Add(Ui.Button("Copy invite link", () => ShareBoard(board.Id())));
        }
        if (body.Children.Count == 0) body.Children.Add(Ui.Subtitle("No members yet."));
        Drawer("Members", body);
        return Task.CompletedTask;
    }

    private async Task BoardComments(JsonElement board)
    {
        var path = BoardPath(board.Id()) + "/comments";
        var panel = Ui.Stack(Ui.Subtitle("Loading comments…"));
        Drawer("Comments", panel);
        var data = await api.Get(path, overlayCancellation.Token);
        panel.Children.Clear();
        var participants = board.Items("members").ToArray();
        foreach (var item in data.Items("comments"))
        {
            var author = item.Field("author");
            var fields = Ui.Stack(Ui.Subtitle(author.Text("fullName", "Comment")), Ui.Mentions(item.Text("content"), participants, OpenMention));
            if (!Demo && item.Text("authorId", author.Id()) == user.Id()) fields.Children.Add(ActionButton("Delete comment", async () =>
            {
                await api.Delete($"{path}/{Ui.PathId(item.Id())}");
                await BoardComments(board);
            }));
            panel.Children.Add(Ui.Card(fields));
        }
        if (CanDrawOnBoard(board))
        {
            var comment = Ui.Input("", multiline: true, placeholder: "Write a comment…");
            panel.Children.Add(Ui.MentionInput(comment, participants));
            panel.Children.Add(ActionButton("Comment", async () =>
            {
                if (comment.Text.Trim().Length == 0) return;
                await api.Post(path, new { content = comment.Text.Trim() });
                await BoardComments(board);
            }, true));
        }
        if (panel.Children.Count == 0) panel.Children.Add(Ui.Subtitle("No comments yet."));
    }
}
