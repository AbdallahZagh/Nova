using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using NovaTaskflow.Controls;
using NovaTaskflow.Api;
using NovaTaskflow.ViewModels;
using Windows.System;
using Windows.ApplicationModel.DataTransfer;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow
{
    private const int StickyLimit = 6;
    private readonly Dictionary<NoteDraft, (StickyToolWindow Window, Action Unsubscribe)> floating = new();
    private StickyToolWindow? stickyPickerWindow;
    private StickyPicker? stickyPicker;
    private CancellationTokenSource? stickyRefresh;
    private bool stickiesHidden;

    private async Task ShowStickies()
    {
        if (stickyPickerWindow is { Visible: true } current)
        {
            current.Show(true);
            if (SignedIn) stickyPicker?.FocusSearch();
            return;
        }

        var picker = new StickyPicker();
        var window = new StickyToolWindow("Nova Stickies", () =>
        {
            CloseStickyPicker();
            return Task.CompletedTask;
        });
        stickyPickerWindow = window;
        stickyPicker = picker;
        window.Chrome.Body = picker;
        PaintPicker(window);
        window.Place(null, 0, 420, 460, picker: true);
        var escape = new KeyboardAccelerator { Key = VirtualKey.Escape };
        escape.Invoked += (_, args) => { args.Handled = true; CloseStickyPicker(); };
        window.Chrome.KeyboardAccelerators.Add(escape);
        var newShortcut = new KeyboardAccelerator { Key = VirtualKey.N, Modifiers = VirtualKeyModifiers.Control };
        newShortcut.Invoked += (sender, args) =>
        {
            if (!SignedIn) return;
            args.Handled = true;
            _ = PickerAction(NewSticky);
        };
        window.Chrome.KeyboardAccelerators.Add(newShortcut);
        picker.NewRequested += () => _ = PickerAction(NewSticky);
        picker.NoteRequested += id => _ = PickerAction(() => OpenSticky(id));
        picker.ToggleVisibilityRequested += ToggleStickyVisibility;
        picker.SignInRequested += () => { CloseStickyPicker(); ShowNova(); };
        notesChanged += RenderStickyPicker;
        stickyRefresh = new();
        RenderStickyPicker();
        window.Show(true);
        if (SignedIn) picker.FocusSearch();
        if (!SignedIn) return;
        try { await RefreshNotes(stickyRefresh.Token); }
        catch (OperationCanceledException) { }
        catch (Exception error)
        {
            if (stickyPickerWindow == window) window.Chrome.StatusText = error.Message;
        }
        finally
        {
            if (stickyPickerWindow == window)
            {
                stickyRefresh?.Dispose();
                stickyRefresh = null;
                RenderStickyPicker();
            }
        }
    }

    private async Task PickerAction(Func<Task> action)
    {
        try { await action(); }
        catch (OperationCanceledException) { }
        catch (Exception error)
        {
            if (stickyPickerWindow is { } picker) picker.Chrome.StatusText = error.Message;
            else if (!hidden) Toast(error.Message, InfoBarSeverity.Error);
        }
    }

    private void RenderStickyPicker()
    {
        if (stickyPicker is null) return;
        var openIds = floating.ToDictionary(item => item.Key.EditorId, item => item.Value.Window.Visible);
        var rows = OrderedNotes().Select(note => new StickyPickerRow(note.Id, note.Label,
            note.Project?.Name ?? (note.Checks.Length > 0 ? $"{note.Checks.Count(item => item.Done)}/{note.Checks.Length} checked" : "Personal"),
            openIds.TryGetValue(note.Id, out var visible) ? visible ? "On screen" : "Hidden"
                : note.Id.StartsWith("draft:", StringComparison.Ordinal) ? "Draft" : note.Pinned ? "Pinned" : "",
            NoteColorBrush(note.Color), note.Pinned, openIds.ContainsKey(note.Id),
            note.Label + " " + note.Body + " " + (note.Project?.Name ?? "Personal") + " " +
                string.Join(" ", note.Checks.Select(item => item.Text)))).ToArray();
        stickyPicker.Update(rows, SignedIn, stickyRefresh is not null, stickiesHidden, floating.Count);
    }

    private void CloseStickyPicker()
    {
        stickyRefresh?.Cancel();
        stickyRefresh?.Dispose();
        stickyRefresh = null;
        notesChanged -= RenderStickyPicker;
        stickyPickerWindow?.Destroy();
        stickyPickerWindow = null;
        stickyPicker = null;
    }

    private Task NewSticky()
    {
        RequireFreeSticky();
        var draft = Draft(new NoteDocument(Floating: true));
        ShowSticky(draft, activate: true);
        CloseStickyPicker();
        return Task.CompletedTask;
    }

    private async Task OpenSticky(string id)
    {
        if (FindDraft(id) is not { } draft) return;
        if (!floating.ContainsKey(draft)) RequireFreeSticky();
        ShowSticky(draft, activate: true);
        CloseStickyPicker();
        if (draft.Value.Floating) return;
        draft.Set(draft.Value with { Floating = true }, false, "floating");
        try { await draft.Flush(); }
        catch (Exception error)
        {
            if (floating.TryGetValue(draft, out var open)) open.Window.Chrome.StatusText = error.Message;
        }
    }

    private void RequireFreeSticky()
    {
        if (floating.Count >= StickyLimit)
            throw new InvalidOperationException("Six stickies are open. Close one before opening another.");
    }

    private void ShowSticky(NoteDraft draft, bool activate = false)
    {
        if (floating.TryGetValue(draft, out var current))
        {
            if (activate)
            {
                current.Window.SetCollapsed(false);
                current.Window.Show(true);
            }
            return;
        }
        if (floating.Count >= StickyLimit) return;
        var window = new StickyToolWindow("Nova Sticky", async () =>
        {
            await draft.Flush();
            if (draft.Value.Blank && draft.Value.Id.Length == 0)
            {
                drafts.Remove(draft);
                draft.Discard();
            }
            else
            {
                if (draft.Value.Blank) throw new InvalidOperationException("Restore some text or delete the note before closing.");
                draft.Set(draft.Value with { Floating = false }, false, "floating");
                await draft.Flush();
                if (draft.Dirty && !draft.StoredLocally)
                    throw new IOException("Windows couldn’t save this note. Keep the sticky open until it syncs.");
            }
            DestroySticky(draft);
        });
        var editor = NoteEditor(draft, true, [], viewport: window.Chrome.WritingArea);
        editor.Padding = new Thickness(14, 10, 14, 12);
        window.Chrome.Body = Ui.Scroll(editor);
        var collapse = StickyIcon("\uE70E", "Collapse or expand sticky", () =>
        {
            window.SetCollapsed(!window.Collapsed);
            return Task.CompletedTask;
        });
        var pin = StickyIcon("\uE718", "Toggle always on top", () => Task.CompletedTask);
        var menu = new MenuFlyout();
        MenuFlyoutItem? convert = null;
        pin.Click += (_, _) =>
        {
            window.SetAlwaysOnTop(!window.AlwaysOnTop);
            UpdateChrome(draft);
        };
        var options = StickyIcon("\uE712", "Sticky options", () => Task.CompletedTask);
        options.Flyout = menu;
        window.Chrome.Actions.Add(collapse);
        window.Chrome.Actions.Add(pin);
        window.Chrome.Actions.Add(options);
        var closeShortcut = new KeyboardAccelerator { Key = VirtualKey.W, Modifiers = VirtualKeyModifiers.Control };
        closeShortcut.Invoked += (sender, args) => { args.Handled = true; _ = window.Dismiss(); };
        window.Chrome.KeyboardAccelerators.Add(closeShortcut);
        Add("Pin in Notes", () => PatchPin(draft));
        var sizeMenu = new MenuFlyoutSubItem { Text = "Window size" };
        foreach (var (label, width, height) in new[] { ("Compact", 322, 278), ("Default", 363, 425), ("Large", 482, 585) })
        {
            var item = new MenuFlyoutItem { Text = label };
            item.Click += (_, _) => window.ResizeTo(width, height);
            sizeMenu.Items.Add(item);
        }
        menu.Items.Add(sizeMenu);
        var retrySave = Add("Check and sync draft", () => draft.Flush(retryCreate: true));
        menu.Opening += (_, _) => retrySave.IsEnabled = draft.Dirty;
        Add("Copy text", () =>
        {
            var note = draft.Value;
            var checklist = string.Join(Environment.NewLine, note.Checks.Where(item => item.Text.Length > 0)
                .Select(item => $"{(item.Done ? "[x]" : "[ ]")} {item.Text}"));
            var content = new DataPackage();
            content.SetText(string.Join(Environment.NewLine + Environment.NewLine,
                new[] { note.Title, note.Body, checklist }.Where(value => !string.IsNullOrWhiteSpace(value))));
            Clipboard.SetContent(content);
            return Task.CompletedTask;
        });
        Add("Choose project", async () =>
        {
            var projects = (await api.Get("/api/projects")).Items("projects").ToArray();
            var choice = Ui.Choice("Project", new[] { "Personal" }.Concat(projects.Select(project => project.Text("name"))), "Personal");
            choice.SelectedIndex = Array.FindIndex(projects, project => project.Id() == draft.Value.ProjectId) + 1;
            var dialog = new ContentDialog
            {
                XamlRoot = window.Chrome.XamlRoot, Title = "Organize sticky", Content = choice,
                PrimaryButtonText = "Apply", CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Primary
            };
            if (await dialog.ShowAsync() != ContentDialogResult.Primary) return;
            var selected = choice.SelectedIndex > 0 ? projects[choice.SelectedIndex - 1] : default;
            var project = selected.Id().Length > 0 ? new NoteProject(selected.Id(), selected.Text("name")) : null;
            draft.Set(draft.Value with { ProjectId = project?.Id, Project = project }, false, "projectId");
            await draft.Flush();
        });
        convert = Add("Turn into a task", async () =>
        {
            var result = await CreateTaskFromNote(draft);
            window.Chrome.StatusText = result.Queued ? "Task waiting to sync" : "Task created in " + result.Project.Text("name");
        });
        Add("Open in Nova", async () =>
        {
            await draft.Flush();
            if (draft.Value.Blank) throw new InvalidOperationException("Add a title or start writing first.");
            ShowNova();
            await Go("Note", draft.EditorId);
        });
        Add("Duplicate sticky", async () =>
        {
            RequireFreeSticky();
            await draft.Flush();
            var copy = await CopyNote(draft.Value, true);
            ShowSticky(Draft(copy), activate: true);
        });
        Add("Delete note", async () =>
        {
            var local = draft.Value.Id.Length == 0;
            var confirmation = Ui.Confirmation(window.Chrome.XamlRoot, local ? "Discard local draft?" : "Delete this note?",
                local ? "This removes this draft from this PC." : "This removes the note from Nova on all your devices.",
                local ? "Discard" : "Delete");
            if (await confirmation.ShowAsync() != ContentDialogResult.Primary) return;
            if (local)
            {
                draft.Discard();
                drafts.Remove(draft);
                DestroySticky(draft);
                notesChanged?.Invoke();
                return;
            }
            await draft.Flush();
            await api.Delete("/api/notes/" + Ui.PathId(draft.Value.Id));
            RemoveNote(draft.Value.Id);
        });

        StickyPlacement? saved = null;
        settings.StickyPlacements.TryGetValue(StickyKey(draft.EditorId), out saved);
        window.Place(saved, floating.Count, Math.Clamp((int)(draft.Value.Width ?? 352), 305, 1400),
            Math.Clamp((int)(draft.Value.Height ?? 410), 220, 1400), offsetX: draft.Value.PosX, offsetY: draft.Value.PosY);
        window.ApplyTheme(settings.Light);
        var logicalPlacement = window.SharedPlacement();
        System.ComponentModel.PropertyChangedEventHandler status = (_, _) => UpdateChrome(draft);
        draft.PropertyChanged += status;
        draft.Changed += UpdateChrome;
        draft.Saved += SaveAfterCreation;
        window.PlacementChanged += () =>
        {
            SaveStickyPlacement(draft, window);
            var shared = window.SharedPlacement();
            if (window.Visible && shared != logicalPlacement)
            {
                logicalPlacement = shared;
                draft.Set(draft.Value with { PosX = shared.X, PosY = shared.Y, Width = shared.Width, Height = shared.Height },
                    false, "posX", "posY", "width", "height");
            }
            UpdateChrome(draft);
        };
        floating.Add(draft, (window, () =>
        {
            draft.PropertyChanged -= status;
            draft.Changed -= UpdateChrome;
            draft.Saved -= SaveAfterCreation;
        }));
        UpdateChrome(draft);
        if (activate || !stickiesHidden) window.Show(activate);
        if (activate && draft.Value.Id.Length == 0 && DesktopSettings.TestFolder is null)
            DispatcherQueue.TryEnqueue(() => editor.Children.OfType<TextBox>().FirstOrDefault()?.Focus(FocusState.Programmatic));
        notesChanged?.Invoke();

        void UpdateChrome(NoteDraft item)
        {
            var title = item.Value.Title?.Trim() ?? "";
            window.SetTitle(title.Length > 0 ? title : "Sticky note");
            if (!window.Collapsed) window.Chrome.Title = item.Value.Project?.Name ?? "Sticky note";
            window.Chrome.StatusText = item.Status;
            window.Chrome.HeaderBrush = StickyBrush(item.Value.Color);
            window.Chrome.SurfaceBrush = StickyBrush(item.Value.Color, subtle: true);
            ToolTipService.SetToolTip(pin, window.AlwaysOnTop ? "Disable always on top" : "Keep on top");
            pin.Opacity = window.AlwaysOnTop ? 1 : .52;
            if (convert is not null) convert.IsEnabled = item.Value.ProjectId is not null && !item.Value.Blank;
            if (menu.Items[0] is MenuFlyoutItem pinItem)
                pinItem.Text = item.Value.Pinned ? "Unpin in Notes" : "Pin in Notes";
        }

        void SaveAfterCreation(NoteDraft item)
        {
            if (floating.ContainsKey(item)) SaveStickyPlacement(item, window);
        }

        MenuFlyoutItem Add(string label, Func<Task> action)
        {
            var item = new MenuFlyoutItem { Text = label };
            var running = false;
            item.Click += async (_, _) =>
            {
                if (running) return;
                running = true;
                try { await action(); }
                catch (OperationCanceledException) { }
                catch (Exception error) { window.Chrome.StatusText = error.Message; }
                finally { running = false; }
            };
            menu.Items.Add(item);
            return item;
        }
    }

    private static Button StickyIcon(string glyph, string label, Func<Task> action)
    {
        var button = Ui.Button("", action);
        button.Style = Ui.Style("NovaCommand");
        button.Content = new FontIcon { Glyph = glyph, FontSize = 13 };
        button.Padding = new Thickness(7, 3, 7, 3);
        button.MinHeight = 29;
        Ui.Name(button, label);
        ToolTipService.SetToolTip(button, label);
        return button;
    }

    private void ToggleStickyVisibility()
    {
        stickiesHidden = !stickiesHidden;
        foreach (var (window, _) in floating.Values)
        {
            if (stickiesHidden) window.Hide();
            else window.Show(false);
        }
        notesChanged?.Invoke();
    }

    private string StickyKey(string noteId) => $"{settings.Server}|{settings.Account}|{noteId}";

    private void SaveStickyPlacement(NoteDraft draft, StickyToolWindow window)
    {
        if (draft.Value.Id.Length == 0 && draft.Value.Blank) return;
        var current = window.CurrentPlacement();
        var key = StickyKey(draft.EditorId);
        if (settings.StickyPlacements.GetValueOrDefault(key) == current) return;
        settings.StickyPlacements[key] = current;
        try { settings.Save(); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        { window.Chrome.StatusText = "Windows could not save the sticky position."; }
    }

    private void SaveStickyPlacements()
    {
        foreach (var (draft, item) in floating) SaveStickyPlacement(draft, item.Window);
    }

    private void DestroySticky(NoteDraft draft)
    {
        if (!floating.Remove(draft, out var item)) return;
        SaveStickyPlacement(draft, item.Window);
        item.Unsubscribe();
        item.Window.Destroy();
        notesChanged?.Invoke();
    }

    private void ReleaseStickyWindows()
    {
        CloseStickyPicker();
        foreach (var draft in floating.Keys.ToArray()) DestroySticky(draft);
        stickiesHidden = false;
    }

    private void ApplyStickyTheme()
    {
        if (stickyPickerWindow is { } picker) PaintPicker(picker);
        foreach (var (draft, item) in floating)
        {
            item.Window.ApplyTheme(settings.Light);
            item.Window.Chrome.HeaderBrush = StickyBrush(draft.Value.Color);
            item.Window.Chrome.SurfaceBrush = StickyBrush(draft.Value.Color, subtle: true);
        }
    }

    private void PaintPicker(StickyToolWindow picker)
    {
        picker.ApplyTheme(settings.Light);
        picker.Chrome.SurfaceBrush = StickyBrush("AMBER", subtle: true);
        picker.Chrome.HeaderBrush = StickyBrush("AMBER");
    }

    private static SolidColorBrush NoteColorBrush(string color)
    {
        var tone = ColorsByNote.FirstOrDefault(item => item.Value == color);
        return new SolidColorBrush(Ui.Rgb(tone.Value is null ? ColorsByNote[0].Swatch : tone.Swatch));
    }
}
