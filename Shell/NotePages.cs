using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Automation.Peers;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using NovaTaskflow.Api;
using NovaTaskflow.Controls;
using NovaTaskflow.ViewModels;
using System.Collections.ObjectModel;
using System.Text.Json;
using Windows.System;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow
{
    private readonly Dictionary<string, NoteDocument> notes = new();
    private readonly HashSet<string> deletedNotes = new(StringComparer.Ordinal);
    private readonly HashSet<NoteDraft> drafts = [];
    private Action? notesChanged;
    private NoteDraft? editingNote;
    // Swatches and surfaces follow the Nova mobile notes palette.
    private static readonly (string Value, string Label, uint Swatch, uint Light, uint Dark)[] ColorsByNote =
    [
        ("SLATE", "Stone", 0xa8a29e, 0xe6ddd0, 0x262120),
        ("AMBER", "Amber", 0xfbbf24, 0xfdeeb8, 0x3a2c12),
        ("CORAL", "Coral", 0xfb923c, 0xfcd9c4, 0x3b2316),
        ("SAGE", "Sage", 0x34d399, 0xd3ecd9, 0x1f3226),
        ("SKY", "Sky", 0x38bdf8, 0xcfe8f6, 0x1b2f3d),
        ("VIOLET", "Violet", 0xa78bfa, 0xe2d8f7, 0x2d2342),
    ];

    private NoteDraftStore? noteDraftStore;

    private void RecoverNoteDrafts()
    {
        noteDraftStore = new NoteDraftStore(Path.Combine(DesktopSettings.AppFolder, "note-drafts"), api.Endpoint, user.Id());
        try
        {
            foreach (var saved in noteDraftStore.Read())
            {
                var draft = Draft(saved.Value, saved);
                if (settings.RestoreStickies && draft.Value.Floating && !draft.Value.Blank &&
                    (draft.Value.Id.Length == 0 || settings.StickyPlacements.ContainsKey(StickyKey(draft.Value.Id))))
                    ShowSticky(draft);
            }
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Security.Cryptography.CryptographicException or JsonException)
        { Toast("Windows couldn’t open a saved note draft. Its file was kept on this PC.", InfoBarSeverity.Warning); }
    }

    private NoteDraft? FindDraft(string id)
        => drafts.FirstOrDefault(item => item.EditorId == id) ??
            (notes.TryGetValue(id, out var note) ? Draft(note) : null);

    private NoteDraft Draft(NoteDocument note, StoredNote? recovered = null)
    {
        var existing = note.Id.Length == 0 ? null : drafts.FirstOrDefault(item => item.Value.Id == note.Id);
        if (existing is not null) return existing;
        var draft = new NoteDraft(api, note, noteDraftStore, recovered);
        draft.Saved += item => ApplyNote(item.Value, true);
        draft.Changed += _ => notesChanged?.Invoke();
        drafts.Add(draft);
        return draft;
    }

    private async Task RefreshNotes(CancellationToken cancellation, bool restore = false)
    {
        var known = notes.Values.ToDictionary(note => note.Id, note => note.UpdatedAt);
        var (data, cached) = await api.GetWithSource("/api/notes", cancellation);
        cancellation.ThrowIfCancellationRequested();
        var list = data.ValueKind == JsonValueKind.Array ? data : data.Field("items");
        if (list.ValueKind != JsonValueKind.Array)
            throw new JsonException("Nova returned an invalid notes list.");
        var result = list.EnumerateArray().Select(NoteDocument.Read).ToArray();
        if (result.Any(note => note.Id.Length == 0)) throw new JsonException("Nova returned a note without an ID.");
        var available = result.Select(item => item.Id).ToHashSet(StringComparer.Ordinal);
        foreach (var note in result) ApplyNote(note, notify: false);
        if (!cached)
        {
            foreach (var id in known.Keys.Except(available))
            {
                if (!notes.TryGetValue(id, out var current) || current.UpdatedAt != known[id]) continue;
                var local = drafts.FirstOrDefault(draft => draft.Value.Id == id);
                if (local is { Dirty: true }) continue;
                if (local is not null)
                    await RefreshNote(id, cancellation, notify: false);
                else
                    notes.Remove(id);
            }
            cancellation.ThrowIfCancellationRequested();
            if (restore && settings.RestoreStickies && !stickiesHidden && !quitting)
            {
                foreach (var note in result.Where(note => note.Floating))
                {
                    if (floating.Count >= StickyLimit) break;
                    var draft = FindDraft(note.Id);
                    if (draft is not null && draft != editingNote && draft.Value.Floating && !draft.Value.Blank)
                        ShowSticky(draft);
                }
            }
        }
        notesChanged?.Invoke();
    }

    private async Task RefreshNote(string id, CancellationToken cancellation, bool notify = true)
    {
        if (deletedNotes.Contains(id)) return;
        try
        {
            var fresh = await api.GetFresh("/api/notes/" + Ui.PathId(id), cancellation);
            cancellation.ThrowIfCancellationRequested();
            ApplyNote(NoteDocument.Read(fresh), notify: notify);
        }
        catch (ApiFailure error) when (error.Status == System.Net.HttpStatusCode.NotFound)
        {
            cancellation.ThrowIfCancellationRequested();
            RemoveNote(id, notify);
        }
        catch (IOException) { }
    }

    private void ApplyNote(NoteDocument note, bool local = false, bool notify = true)
    {
        if (note.Id.Length == 0 || deletedNotes.Contains(note.Id)) return;
        if (notes.TryGetValue(note.Id, out var earlier) && earlier.UpdatedAt > note.UpdatedAt) return;
        notes[note.Id] = note;
        var draft = drafts.FirstOrDefault(item => item.Value.Id == note.Id);
        if (!local) draft?.Remote(note);
        if (notify) notesChanged?.Invoke();
    }

    private void RemoveNote(string id, bool notify = true)
    {
        deletedNotes.Add(id);
        notes.Remove(id);
        var draft = drafts.FirstOrDefault(item => item.Value.Id == id);
        if (draft is not null)
        {
            DestroySticky(draft);
            drafts.Remove(draft);
            draft.Discard();
            if (editingNote == draft)
            {
                editingNote = null;
                leavePage = null;
                Run(() => Go("Notes"));
            }
        }
        if (notify) notesChanged?.Invoke();
    }

    private void ResetNotes()
    {
        foreach (var draft in drafts) draft.Dispose();
        drafts.Clear();
        notes.Clear();
        deletedNotes.Clear();
        noteDraftStore = null;
        ReleaseStickyWindows();
        notesChanged = null;
        editingNote = null;
    }

    private async Task FlushNotes()
    {
        foreach (var draft in drafts.Where(item => item.Dirty).ToArray())
        {
            try { await draft.Flush(); }
            catch (Exception error) when (draft.StoredLocally && error is ApiFailure or IOException) { }
        }
    }

    private async Task Notes(WorkspacePage page, string filterProjectId, CancellationToken cancellation)
    {
        page.Subtitle = "Personal notes, project ideas, and desktop stickies";
        page.ActionItems.Add(Ui.Button("Stickies", ShowStickies));
        var query = Ui.Search("Search notes", 195);
        var scope = Ui.Choice("", ["All notes", "Personal", "Projects", "Pinned", "On desktop"], "All notes");
        var color = Ui.Choice("", new[] { "All colors" }.Concat(ColorsByNote.Select(item => item.Label)), "All colors");
        var projects = Array.Empty<NoteProject>();
        var project = Ui.Choice("", ["All projects"], "All projects");
        page.ActionItems.Add(Ui.Button("New note", NewNote, true));
        var sort = Ui.Choice("", ["Recently edited", "Title", "Oldest first"], "Recently edited");
        Ui.Name(scope, "Note scope");
        Ui.Name(project, "Filter by project");
        Ui.Name(color, "Filter by colour");
        Ui.Name(sort, "Sort notes");
        var filterRow = Ui.Wrap(query, scope, project, color, sort);
        page.FilterItems.Add(filterRow);
        var library = CreateNoteLibrary();
        var initialProject = filterProjectId;
        NoteProject? extraProject = null;
        if (initialProject.Length > 0)
        {
            try
            {
                var details = await api.Get(ProjectResource(initialProject), cancellation);
                if (details.Id().Length > 0) extraProject = new NoteProject(details.Id(), details.Text("name"));
            }
            catch (ApiFailure) { }
            catch (IOException) { }
        }
        query.TextChanged += (_, _) => Draw();
        scope.SelectionChanged += (_, _) => Draw();
        project.SelectionChanged += (_, _) => Draw();
        color.SelectionChanged += (_, _) => Draw();
        sort.SelectionChanged += (_, _) => Draw();
        notesChanged += Draw;
        page.Unloaded += (_, _) => notesChanged -= Draw;
        try { await RefreshNotes(cancellation); }
        catch (IOException) when (notes.Count > 0 || drafts.Any(draft => draft.StoredLocally)) { }
        Draw();

        void Draw()
        {
            if (cancellation.IsCancellationRequested) return;
            var actualProjects = OrderedNotes().Select(note => note.Project).Append(extraProject).OfType<NoteProject>().DistinctBy(item => item.Id)
                .OrderBy(item => item.Name, StringComparer.CurrentCultureIgnoreCase).ToArray();
            if (!projects.SequenceEqual(actualProjects))
            {
                var selected = project.SelectedIndex > 0 ? projects[project.SelectedIndex - 1].Id : initialProject;
                projects = actualProjects;
                initialProject = "";
                project.ItemsSource = new[] { "All projects" }.Concat(projects.Select(item => item.Name)).ToArray();
                project.SelectedIndex = Array.FindIndex(projects, item => item.Id == selected) + 1;
            }
            var projectId = project.SelectedIndex > 0 ? projects[project.SelectedIndex - 1].Id : null;
            var search = query.Text.Trim();
            var matches = OrderedNotes().Where(note =>
                (scope.SelectedIndex <= 0 || (scope.SelectedIndex == 1 && note.ProjectId is null) ||
                 (scope.SelectedIndex == 2 && note.ProjectId is not null) || (scope.SelectedIndex == 3 && note.Pinned) ||
                 (scope.SelectedIndex == 4 && floating.Keys.Any(draft => draft.EditorId == note.Id))) &&
                (projectId is null || note.ProjectId == projectId) &&
                (color.SelectedIndex <= 0 || note.Color == ColorsByNote[color.SelectedIndex - 1].Value) &&
                NoteMatches(note, search));
            var ordered = sort.SelectedIndex switch
            {
                1 => matches.OrderByDescending(note => note.Pinned).ThenBy(note => note.Label, StringComparer.CurrentCultureIgnoreCase),
                2 => matches.OrderByDescending(note => note.Pinned).ThenBy(note => note.UpdatedAt),
                _ => matches
            };
            var cards = ordered.Select(NoteCard).ToArray();
            page.Subtitle = $"{cards.Length} {(cards.Length == 1 ? "note" : "notes")} · Private to you";
            if (cards.Length > 0)
            {
                library.ShowItems(cards);
                if (page.Body != library) page.Body = library;
            }
            else
            {
                var filtered = scope.SelectedIndex > 0 || project.SelectedIndex > 0 || color.SelectedIndex > 0 || search.Length > 0;
                page.Empty(filtered ? "No notes match." : "Capture your first note.", filtered ? "Clear filters" : "New note",
                    filtered ? () =>
                    {
                        query.Text = "";
                        scope.SelectedIndex = project.SelectedIndex = color.SelectedIndex = 0;
                        return Task.CompletedTask;
                    } : NewNote);
            }
        }

        Task NewNote() => Go("Note", project.SelectedIndex > 0 ? $"new:{projects[project.SelectedIndex - 1].Id}" : "new");
    }

    private NoteLibrary CreateNoteLibrary()
    {
        var library = new NoteLibrary();
        library.OpenRequested += id => Run(() => Go("Note", id));
        library.StickyRequested += id => Run(() => OpenSticky(id));
        library.OptionsRequested += NoteOptions;
        library.ChecklistChanged += (item, next) => Run(async () =>
        {
            if (FindDraft(item.NoteId) is not { } draft) return;
            var current = draft.Value;
            draft.Set(current with
            {
                Checklist = current.Checks.Select(entry => entry.Id == item.Id ? entry with { Done = next } : entry).ToArray()
            }, false, "checklist");
            await draft.Flush();
        });
        return library;
    }

    private static bool NoteMatches(NoteDocument note, string search) =>
        (note.Title + " " + note.Body + " " + note.Project?.Name + " " + string.Join(" ", note.Checks.Select(item => item.Text)))
            .Contains(search, StringComparison.OrdinalIgnoreCase);

    private NoteCardItem NoteCard(NoteDocument note) => new(note.Id, note.Label, note.Body, note.Project?.Name ?? "Personal",
        note.Id.StartsWith("draft:", StringComparison.Ordinal) ? "Local draft" : note.Floating ? "On screen" : "",
        note.UpdatedAt == default ? "" : note.UpdatedAt.ToLocalTime().ToString("MMM d"),
        note.Checks.Length > 0 ? $"{note.Checks.Count(item => item.Done)}/{note.Checks.Length}" : "",
        note.Pinned, StickyBrush(note.Color, subtle: true), NoteBorderBrush(note.Color),
        note.Checks.Take(3).Select(item => new NoteCardCheck(note.Id, item.Id, item.Text, item.Done)).ToArray());

    private void NoteOptions(string id, FrameworkElement anchor)
    {
        if (FindDraft(id) is not { } draft) return;
        var note = draft.Value;
        var menu = new MenuFlyout();
        Add(menu.Items, "Open note", () => Go("Note", id));
        Add(menu.Items, "Open as sticky", () => OpenSticky(id));
        Add(menu.Items, note.Pinned ? "Unpin" : "Pin", () => PatchPin(draft));
        var colors = new MenuFlyoutSubItem { Text = "Change color" };
        foreach (var tone in ColorsByNote)
            Add(colors.Items, tone.Label, async () =>
            {
                draft.Set(draft.Value with { Color = tone.Value }, false, "color");
                await draft.Flush();
            });
        menu.Items.Add(colors);
        if (note.Id.Length > 0) Add(menu.Items, "Duplicate", () => DuplicateNote(draft.Value));
        Add(menu.Items, "Delete?", () => DeleteNote(draft));
        menu.ShowAt(anchor);

        void Add(IList<MenuFlyoutItemBase> collection, string label, Func<Task> action)
        {
            var item = new MenuFlyoutItem { Text = label };
            item.Click += (_, _) => Run(action);
            collection.Add(item);
        }
    }

    private IEnumerable<NoteDocument> OrderedNotes()
    {
        var local = drafts.Where(draft => draft.Dirty && (!draft.Value.Blank || draft.Value.Id.Length > 0))
            .ToDictionary(draft => draft.EditorId, draft => draft.Value with { Id = draft.EditorId });
        return notes.Values.Where(note => !local.ContainsKey(note.Id)).Concat(local.Values)
            .OrderByDescending(note => note.Pinned).ThenByDescending(note => note.UpdatedAt);
    }

    private async Task EditNote(WorkspacePage page, string id, CancellationToken cancellation)
    {
        var creating = id == "new" || id.StartsWith("new:", StringComparison.Ordinal);
        NoteProject? projectContext = null;
        if (id.StartsWith("new:", StringComparison.Ordinal))
        {
            var project = await api.Get(ProjectResource(id[4..]), cancellation);
            if (project.Id().Length > 0) projectContext = new NoteProject(project.Id(), project.Text("name"));
        }
        var draft = creating ? Draft(new NoteDocument(ProjectId: projectContext?.Id, Project: projectContext)) : FindDraft(id);
        if (draft is null)
        {
            if (id.StartsWith("draft:", StringComparison.Ordinal))
                throw new InvalidOperationException("This local draft was already closed or saved.");
            draft = Draft(NoteDocument.Read(await api.Get($"/api/notes/{Ui.PathId(id)}", cancellation)));
        }
        editingNote = draft;
        JsonElement[] projects;
        try { projects = (await api.Get("/api/projects", cancellation)).Items("projects").ToArray(); }
        catch (IOException)
        {
            projects = draft.Value.Project is { } project ? [JsonSerializer.SerializeToElement(new { id = project.Id, name = project.Name })] : [];
        }
        cancellation.ThrowIfCancellationRequested();
        var workspace = new NoteWorkspace();
        var details = Ui.Stack();
        details.Spacing = 12;
        var more = Ui.Button("");
        more.Content = new FontIcon { Glyph = "\uE712", FontSize = 16 };
        more.Width = 40;
        more.Padding = new Thickness(0);
        Ui.Name(more, "Note actions");
        ToolTipService.SetToolTip(more, "Note actions");
        var menu = new MenuFlyout();
        more.Flyout = menu;
        workspace.Actions.Add(more);
        workspace.Actions.Add(ActionButton("Done", Finish, true));
        workspace.BackRequested += () => Run(Finish);
        var openStickyOnLeave = false;
        workspace.Writing = NoteEditor(draft, false, projects, details,
            keepOnWindows: value => openStickyOnLeave = value);
        var convert = NoteAction("Turn into a task", "\uE9D5", Convert);
        var duplicate = NoteAction("Duplicate", "\uE8C8", Duplicate);
        var delete = NoteAction("Delete note", "\uE74D", () => DeleteNote(draft), destructive: true);
        var actions = Ui.Stack(convert, duplicate, delete);
        actions.Spacing = 7;
        details.Children.Add(NoteSection("Actions", "\uE945", actions));
        var created = Ui.Subtitle("");
        var edited = Ui.Subtitle("");
        details.Children.Add(Ui.Stack(DateRow("Created", created), DateRow("Edited", edited)));
        workspace.Inspector = details;
        page.UseFullPage();
        page.Body = workspace;
        (string Color, bool Light)? paperTone = null;

        void RefreshAppearance()
        {
            var tone = (draft.Value.Color, settings.Light);
            if (paperTone == tone) return;
            paperTone = tone;
            workspace.Paper.Background = StickyBrush(draft.Value.Color, subtle: true);
            workspace.Paper.BorderBrush = NoteBorderBrush(draft.Value.Color);
        }

        void RefreshState(NoteDraft current)
        {
            var note = current.Value;
            workspace.DocumentTitle = note.Blank ? "New note" : note.Label;
            var status = current.Status;
            var settled = !current.Dirty && status.StartsWith("Saved ·", StringComparison.Ordinal);
            var waiting = current.Dirty && (current.StoredLocally || status == "Saving…");
            var message = current.Dirty && status.StartsWith("Saved ·", StringComparison.Ordinal) ? "Changes waiting to save" : status;
            workspace.SaveState(message, settled ? 0x349867u : waiting ? 0xd99a49u : current.Dirty ? 0xe87a70u : 0x9b918au);
            created.Text = NoteDate(note.CreatedAt);
            edited.Text = NoteDate(note.UpdatedAt);
            duplicate.IsEnabled = note.Id.Length > 0 && !note.Blank;
            delete.IsEnabled = note.Id.Length > 0 || current.Dirty;
            convert.IsEnabled = note.Id.Length > 0 && !note.Blank && note.ProjectId is not null;
            ToolTipService.SetToolTip(convert, note.ProjectId is null ? "Choose a project first" : null);
            RefreshAppearance();
        }

        menu.Opening += (_, _) =>
        {
            menu.Items.Clear();
            Add(draft.Value.Pinned ? "Unpin" : "Pin to top", () => PatchPin(draft));
            if (draft.Dirty) Add("Check and sync draft", () => draft.Flush(retryCreate: true));
            if (duplicate.IsEnabled) Add("Duplicate", Duplicate);
            if (convert.IsEnabled) Add("Turn into a task", Convert);
            if (delete.IsEnabled) Add(draft.Value.Id.Length == 0 ? "Discard local draft" : "Delete note", () => DeleteNote(draft));
        };
        RefreshState(draft);
        System.ComponentModel.PropertyChangedEventHandler statusChanged = (_, _) => RefreshState(draft);
        draft.PropertyChanged += statusChanged;
        draft.Saved += RefreshState;
        draft.Changed += RefreshState;
        appearanceChanged += RefreshAppearance;
        page.Unloaded += (_, _) =>
        {
            draft.PropertyChanged -= statusChanged;
            draft.Saved -= RefreshState;
            draft.Changed -= RefreshState;
            appearanceChanged -= RefreshAppearance;
            if (editingNote != draft) return;
            editingNote = null;
            if (openStickyOnLeave && SignedIn && !quitting && !draft.Value.Blank) ShowSticky(draft);
        };

        leavePage = async () =>
        {
            try { await draft.Flush(); }
            catch (Exception error)
            {
                Toast(error.Message, InfoBarSeverity.Warning);
                return draft.StoredLocally;
            }
            return !draft.Dirty || draft.StoredLocally || draft.Value.Blank;
        };

        async Task Finish()
        {
            await draft.Flush();
            if (draft.Value.Id.Length > 0 && draft.Value.Blank)
                throw new InvalidOperationException("Restore some text or delete the note.");
            await Go("Notes");
        }

        async Task Duplicate()
        {
            await draft.Flush();
            if (draft.Dirty) throw new InvalidOperationException("Sync this note before duplicating it.");
            await DuplicateNote(draft.Value);
        }

        async Task Convert()
        {
            var (project, task, queued) = await CreateTaskFromNote(draft);
            await Go("Project", project.Id());
            if (queued) { Toast("Task saved on this PC. Check Workspace sync for status."); return; }
            if (task.Id().Length > 0) await TaskDrawer(task.Id(), project);
            Toast("Task created from the note.");
        }

        void Add(string label, Func<Task> callback)
        {
            var item = new MenuFlyoutItem { Text = label };
            item.Click += (_, _) => Run(callback);
            menu.Items.Add(item);
        }
    }

    private async Task<(JsonElement Project, JsonElement Task, bool Queued)> CreateTaskFromNote(NoteDraft draft)
    {
        var value = draft.Value;
        if (value.ProjectId is not { Length: > 0 } projectId || value.Blank)
            throw new InvalidOperationException("Choose a project and add note content before creating a task.");
        var project = await api.Get(ProjectResource(projectId));
        if (ProjectRole(project) == "VIEWER")
            throw new InvalidOperationException("You need permission to create tasks in this project.");
        await draft.Flush();
        var title = value.Title?.Trim();
        if (string.IsNullOrWhiteSpace(title))
            title = value.Body.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault()
                ?? value.Checks.First(check => !string.IsNullOrWhiteSpace(check.Text)).Text.Trim();
        if (title.Length > 160) title = title[..160];
        var checklist = value.Checks.Where(check => !string.IsNullOrWhiteSpace(check.Text)).ToArray();
        var setup = checklist.Where(check => check.Done).Select(check => new InitialSubtask(check.Text.Trim(), null, true, [])).ToArray();
        var change = await WriteWorkspace(HttpMethod.Post, "/api/tasks", new
        {
            projectId, title, description = value.Body, status = "To Do", priority = "Medium",
            subtasks = checklist.Select(check => new { title = check.Text.Trim() }).ToArray()
        }, default, title, setup: setup);
        return (project, change.Data, change.Queued);
    }

    private async Task PatchPin(NoteDraft draft)
    {
        draft.Set(draft.Value with { Pinned = !draft.Value.Pinned }, false, "pinned");
        await draft.Flush();
    }

    private async Task DuplicateNote(NoteDocument note)
    {
        var saved = await CopyNote(note, false);
        await Go("Note", saved.Id);
    }

    private async Task<NoteDocument> CopyNote(NoteDocument note, bool floatOnDesktop)
    {
        if (note.Blank) throw new InvalidOperationException("Add text or a checklist before duplicating the note.");
        var response = await api.Post("/api/notes", new
        {
            title = note.Title, body = note.Body, color = note.Color, projectId = note.ProjectId,
            floating = floatOnDesktop,
            checklist = note.Checks.Where(item => !string.IsNullOrWhiteSpace(item.Text))
                .Select(i => new { id = Guid.NewGuid().ToString("N"), text = i.Text, done = i.Done })
        });
        var saved = NoteDocument.Read(response);
        ApplyNote(saved);
        return saved;
    }

    private async Task DeleteNote(NoteDraft draft)
    {
        if (draft.Value.Id.Length == 0)
        {
            if (!await Confirm("Discard local draft?", "This removes the draft from this PC.", "Discard")) return;
            DestroySticky(draft);
            draft.Discard();
            drafts.Remove(draft);
            notesChanged?.Invoke();
            if (editingNote == draft)
            {
                leavePage = null;
                await Go("Notes");
            }
            return;
        }
        if (!await Confirm("Delete note?", "This removes the note from your account.", "Delete")) return;
        await draft.Flush();
        await api.Delete("/api/notes/" + Ui.PathId(draft.Value.Id));
        RemoveNote(draft.Value.Id);
    }

    private async Task ProjectNotes(JsonElement project)
    {
        var context = new NoteProject(project.Id(), project.Text("name"));
        var library = CreateNoteLibrary();
        var empty = Ui.Subtitle("No notes on this project yet.");
        empty.Margin = new Thickness(3, 9, 0, 0);
        var quick = Ui.Input("", placeholder: $"Jot something down about {context.Name}");
        Ui.Name(quick, "Quick note");
        var query = Ui.Search("Search project notes", double.NaN);
        var cancellation = CancellationToken.None;
        var add = ActionButton("Add", Add, true, "Adding…");
        add.IsEnabled = false;
        var controls = Ui.Stack(Ui.InlineAction(quick, add), Ui.Wrap(
            Ui.Button("Write a full note", () => Go("Note", $"new:{context.Id}")),
            Ui.Button("Open in Notes", () => Go("Notes", context.Id))), query);
        var content = new Grid { Margin = new Thickness(16, 0, 16, 16), RowSpacing = 12 };
        content.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        content.RowDefinitions.Add(new RowDefinition());
        content.Children.Add(controls);
        Grid.SetRow(library, 1);
        Grid.SetRow(empty, 1);
        content.Children.Add(library);
        content.Children.Add(empty);
        cancellation = ShowOverlay("Project notes", content);
        quick.TextChanged += (_, _) => add.IsEnabled = !string.IsNullOrWhiteSpace(quick.Text);
        quick.KeyDown += (_, args) =>
        {
            if (args.Key != VirtualKey.Enter || add.Command?.CanExecute(null) != true || !add.IsEnabled) return;
            args.Handled = true;
            add.Command.Execute(null);
        };
        query.TextChanged += (_, _) => Draw();
        notesChanged += Draw;
        content.Unloaded += (_, _) => notesChanged -= Draw;
        Draw();
        try { await RefreshNotes(cancellation); }
        catch (IOException) when (notes.Count > 0 || drafts.Any(draft => draft.StoredLocally)) { }
        Draw();

        void Draw()
        {
            if (cancellation.IsCancellationRequested) return;
            var search = query.Text.Trim();
            var cards = OrderedNotes().Where(note => note.ProjectId == context.Id && NoteMatches(note, search)).Select(NoteCard).ToArray();
            library.ShowItems(cards);
            library.Visibility = cards.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
            empty.Visibility = cards.Length == 0 ? Visibility.Visible : Visibility.Collapsed;
            empty.Text = search.Length == 0 ? "No notes on this project yet." : "No notes match your search.";
        }

        async Task Add()
        {
            var body = quick.Text.ReplaceLineEndings("\n");
            if (string.IsNullOrWhiteSpace(body) || cancellation.IsCancellationRequested) return;
            var draft = Draft(new NoteDocument(ProjectId: context.Id, Project: context));
            draft.Set(draft.Value with { Body = body }, false, "body");
            quick.Text = "";
            await draft.Flush();
            if (draft.Dirty && draft.StoredLocally) Toast("Note saved on this PC · waiting to sync.");
        }
    }

    private StackPanel NoteEditor(NoteDraft draft, bool sticky, JsonElement[] projects, StackPanel? details = null,
        FrameworkElement? viewport = null, Action<bool>? keepOnWindows = null)
    {
        var applying = false;
        var requestedOnWindows = false;
        var title = WritingField(draft.Value.Title ?? "", sticky ? "Title" : "Untitled", sticky: sticky);
        Ui.Name(title, "Title");
        title.FontSize = sticky ? 17 : 34;
        title.FontWeight = Microsoft.UI.Text.FontWeights.Bold;
        var body = WritingField(draft.Value.Body, "Start writing…", multiline: true, sticky: sticky);
        body.MinHeight = sticky ? 100 : 155;
        body.MaxHeight = sticky ? 230 : 520;
        body.FontSize = sticky ? 14 : 17;
        Ui.Name(body, "Note text");
        ScrollViewer.SetVerticalScrollMode(body, ScrollMode.Enabled);
        ScrollViewer.SetVerticalScrollBarVisibility(body, ScrollBarVisibility.Auto);
        if (viewport is not null)
            viewport.SizeChanged += (_, args) =>
            {
                body.MinHeight = Math.Clamp(args.NewSize.Height - 144, 55, 720);
                body.MaxHeight = Math.Max(body.MinHeight, args.NewSize.Height - 80);
            };
        var checkRows = Ui.Stack();
        checkRows.Spacing = 3;
        var completion = new ProgressBar { Height = 5, VerticalAlignment = VerticalAlignment.Center };
        var completionLabel = Ui.Subtitle("");
        var completionRow = new Grid { ColumnSpacing = 10 };
        completionRow.ColumnDefinitions.Add(new ColumnDefinition());
        completionRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        completionRow.Children.Add(completion);
        Grid.SetColumn(completionLabel, 1);
        completionRow.Children.Add(completionLabel);
        Ui.Name(completion, "Checklist completion");
        var checkWidgets = new Dictionary<string, (CheckBox Check, TextBox Text, TextBlock Done)>();
        var colorRow = Ui.Row();
        colorRow.Spacing = 5;
        (string Color, bool Light)? controlTone = null;
        var metadata = Ui.Subtitle("");
        metadata.FontSize = 12;
        var checklistHeading = Ui.Subtitle("CHECKLIST");
        checklistHeading.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
        checklistHeading.CharacterSpacing = 100;
        checklistHeading.FontSize = 11;
        var checklistCard = sticky ? null : Ui.Card(Ui.Stack(checklistHeading, completionRow, checkRows));
        if (checklistCard is not null) checklistCard.Padding = new Thickness(16, 13, 16, 13);
        var addChecklist = Ui.Button("Add a checklist", () => { AddItem(); return Task.CompletedTask; });
        addChecklist.HorizontalAlignment = HorizontalAlignment.Left;
        var panel = sticky
            ? Ui.Stack(title, body, completionRow, checkRows, addChecklist, colorRow)
            : Ui.Stack(title, metadata, NoteDivider(), body, checklistCard!, addChecklist);
        panel.Spacing = sticky ? 7 : 13;
        if (!sticky) panel.SizeChanged += (_, args) =>
        {
            title.FontSize = args.NewSize.Width < 580 ? 29 : 34;
            body.MinHeight = args.NewSize.Width < 580 ? 116 : 155;
        };
        var project = Ui.Choice("", new[] { "Personal (no project)" }.Concat(projects.Select(item => item.Text("name"))), "");
        Ui.Name(project, "Project");
        var pinned = new ToggleSwitch { OnContent = null, OffContent = null };
        var onScreen = new ToggleSwitch { OnContent = null, OffContent = null };
        if (!sticky && details is not null)
        {
            details.Children.Add(NoteSection("Colour", "\uE790", colorRow));
            details.Children.Add(NoteSection("Project", "\uE8B7", Ui.Stack(project, Ui.Subtitle("Projects group notes. Your note stays private."))));
            details.Children.Add(NoteSection("Options", "\uE713", Ui.Stack(
                NoteOption("Pin to top", "Show it first in Notes", "\uE718", pinned),
                NoteOption("Keep on screen", "Open as a sticky when you leave", "\uE7F4", onScreen))));
        }
        foreach (var (value, label, swatch, _, _) in ColorsByNote)
        {
            var dot = new Border { Width = 14, Height = 14, CornerRadius = new CornerRadius(7),
                Background = new SolidColorBrush(Ui.Rgb(swatch)) };
            var button = Ui.Button("", () =>
            {
                draft.Set(draft.Value with { Color = value }, true, "color");
                return Task.CompletedTask;
            });
            button.Content = dot;
            button.Tag = value;
            button.Background = new SolidColorBrush(Colors.Transparent);
            button.BorderThickness = new Thickness(2);
            button.CornerRadius = new CornerRadius(15);
            button.Padding = new Thickness(0);
            button.Width = button.Height = 30;
            button.MinHeight = button.MinWidth = 0;
            ToolTipService.SetToolTip(button, label);
            Ui.Name(button, label);
            colorRow.Children.Add(button);
        }
        title.TextChanged += (_, _) =>
        {
            if (!applying && title.Text != (draft.Value.Title ?? ""))
                draft.Set(draft.Value with { Title = title.Text }, false, "title");
        };
        body.TextChanged += (_, _) =>
        {
            if (applying) return;
            var writing = body.Text.ReplaceLineEndings("\n");
            if (writing != draft.Value.Body.ReplaceLineEndings("\n"))
                draft.Set(draft.Value with { Body = writing }, false, "body");
        };
        project.SelectionChanged += (_, _) =>
        {
            if (applying) return;
            var selected = project.SelectedIndex > 0 ? projects[project.SelectedIndex - 1] : default;
            draft.Set(draft.Value with { ProjectId = selected.Id().Length > 0 ? selected.Id() : null,
                Project = selected.Id().Length > 0 ? new NoteProject(selected.Id(), selected.Text("name")) : null }, true, "projectId");
        };
        pinned.Toggled += (_, _) =>
        {
            if (!applying && pinned.IsOn != draft.Value.Pinned) Run(() => PatchPin(draft));
        };
        onScreen.Toggled += (_, _) =>
        {
            if (applying || onScreen.IsOn == (requestedOnWindows || floating.ContainsKey(draft))) return;
            if (onScreen.IsOn && floating.Count >= StickyLimit && !floating.ContainsKey(draft))
            {
                Sync(draft);
                Toast("Six stickies are already on screen.", InfoBarSeverity.Warning);
                return;
            }
            requestedOnWindows = onScreen.IsOn;
            keepOnWindows?.Invoke(requestedOnWindows);
            if (!requestedOnWindows) DestroySticky(draft);
            if (draft.Value.Floating != requestedOnWindows)
                draft.Set(draft.Value with { Floating = requestedOnWindows }, true, "floating");
        };
        Sync(draft);
        panel.Loaded += (_, _) =>
        {
            draft.Changed += Sync;
            appearanceChanged += Paint;
            if (!sticky) notesChanged += SyncWindowPreference;
            Sync(draft);
        };
        panel.Unloaded += (_, _) =>
        {
            draft.Changed -= Sync;
            appearanceChanged -= Paint;
            if (!sticky) notesChanged -= SyncWindowPreference;
        };
        if (!sticky && draft.Value.Id.Length == 0)
        {
            void FocusTitle(object sender, RoutedEventArgs args)
            {
                panel.Loaded -= FocusTitle;
                title.Focus(FocusState.Programmatic);
            }
            panel.Loaded += FocusTitle;
        }
        return panel;

        void SyncWindowPreference()
        {
            if (applying) return;
            applying = true;
            onScreen.IsOn = requestedOnWindows || floating.ContainsKey(draft);
            applying = false;
        }

        void Paint()
        {
            var tone = (draft.Value.Color, settings.Light);
            if (controlTone == tone) return;
            controlTone = tone;
            foreach (var button in colorRow.Children.OfType<Button>())
            {
                var selected = (string)button.Tag == draft.Value.Color;
                button.BorderBrush = selected ? NoteColorBrush(draft.Value.Color) : new SolidColorBrush(Colors.Transparent);
                AutomationProperties.SetItemStatus(button, selected ? "Selected" : "");
            }
            completion.Foreground = new SolidColorBrush(Ui.Rgb(settings.Light ? 0xc56010u : 0xe66a17u));
            if (checklistCard is not null)
                checklistCard.Background = new SolidColorBrush(settings.Light
                    ? ColorHelper.FromArgb(71, 255, 255, 255) : ColorHelper.FromArgb(27, 0, 0, 0));
        }

        void Sync(NoteDraft value)
        {
            applying = true;
            var note = value.Value;
            SyncWriting(title, note.Title ?? "");
            SyncWriting(body, note.Body);
            var selected = Array.FindIndex(projects, p => p.Id() == note.ProjectId);
            project.SelectedIndex = selected + 1;
            pinned.IsOn = note.Pinned;
            onScreen.IsOn = requestedOnWindows || floating.ContainsKey(draft);
            var words = (note.Title + " " + note.Body).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).Length;
            metadata.Text = string.Join("  ·  ", new[] { note.Project?.Name ?? "Personal",
                note.UpdatedAt == default ? "" : NoteDate(note.UpdatedAt), words > 0 ? $"{words} {(words == 1 ? "word" : "words")}" : "" }.Where(value => value.Length > 0));
            Paint();
            var done = note.Checks.Count(item => item.Done);
            completionRow.Visibility = note.Checks.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
            completion.Maximum = Math.Max(1, note.Checks.Length);
            completion.Value = done;
            completionLabel.Text = $"{done}/{note.Checks.Length}";
            if (checklistCard is not null) checklistCard.Visibility = note.Checks.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
            addChecklist.Visibility = note.Checks.Length == 0 ? Visibility.Visible : Visibility.Collapsed;
            if (checkRows.Children.Count == 0 || !checkWidgets.Keys.SequenceEqual(note.Checks.Select(item => item.Id))) Checklist();
            else foreach (var item in note.Checks)
            {
                var control = checkWidgets[item.Id];
                if (control.Text.Text != item.Text) control.Text.Text = item.Text;
                if (control.Check.IsChecked != item.Done) control.Check.IsChecked = item.Done;
                PaintCheck(control);
            }
            applying = false;
        }

        void Checklist()
        {
            checkRows.Children.Clear();
            checkWidgets.Clear();
            foreach (var item in draft.Value.Checks)
            {
                var line = new Grid { ColumnSpacing = 5 };
                line.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                line.ColumnDefinitions.Add(new ColumnDefinition());
                line.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                var check = new CheckBox { IsChecked = item.Done, MinWidth = 26 };
                var text = WritingField(item.Text, "List item");
                text.MinHeight = 32;
                text.FontSize = sticky ? 13 : 15;
                var crossed = Ui.Subtitle(item.Text);
                crossed.IsHitTestVisible = false;
                crossed.TextWrapping = TextWrapping.NoWrap;
                crossed.TextTrimming = TextTrimming.CharacterEllipsis;
                crossed.FontSize = text.FontSize;
                crossed.TextDecorations = Windows.UI.Text.TextDecorations.Strikethrough;
                crossed.VerticalAlignment = VerticalAlignment.Center;
                crossed.Margin = new Thickness(3, 0, 3, 0);
                AutomationProperties.SetAccessibilityView(crossed, AccessibilityView.Raw);
                var entry = new Grid();
                entry.Children.Add(text);
                entry.Children.Add(crossed);
                Ui.Name(check, "Checklist item completed");
                var widgets = (check, text, crossed);
                checkWidgets[item.Id] = widgets;
                text.GotFocus += (_, _) => PaintCheck(widgets);
                text.LostFocus += (_, _) => PaintCheck(widgets);
                check.Click += (_, _) => Update(item.Id, text.Text, check.IsChecked == true, true);
                text.TextChanged += (_, _) => Update(item.Id, text.Text, check.IsChecked == true, false);
                text.PreviewKeyDown += (_, args) =>
                {
                    if (args.Key == VirtualKey.Enter && !string.IsNullOrWhiteSpace(text.Text))
                    {
                        args.Handled = true;
                        AddItem(item.Id);
                    }
                    else if (args.Key == VirtualKey.Back && text.Text.Length == 0)
                    {
                        args.Handled = true;
                        RemoveItem(item.Id);
                    }
                };
                var remove = Ui.Button("×", () => { RemoveItem(item.Id); return Task.CompletedTask; });
                remove.Style = Ui.Style("NovaCommand");
                remove.MinHeight = 30;
                remove.Padding = new Thickness(7, 1, 7, 1);
                Ui.Name(remove, "Remove checklist item");
                line.Children.Add(check);
                Grid.SetColumn(entry, 1); line.Children.Add(entry);
                Grid.SetColumn(remove, 2); line.Children.Add(remove);
                checkRows.Children.Add(line);
                PaintCheck(widgets);
            }
            if (draft.Value.Checks.Length > 0)
            {
                var add = Ui.Button("+  Add item", () => { AddItem(); return Task.CompletedTask; });
                add.Style = Ui.Style("NovaCommand");
                Ui.Name(add, "Add item");
                checkRows.Children.Add(add);
            }
        }

        static void PaintCheck((CheckBox Check, TextBox Text, TextBlock Done) widgets)
        {
            var crossed = widgets.Check.IsChecked == true && widgets.Text.FocusState == FocusState.Unfocused;
            widgets.Text.Opacity = crossed ? 0 : 1;
            widgets.Done.Text = widgets.Text.Text;
            widgets.Done.Visibility = crossed ? Visibility.Visible : Visibility.Collapsed;
        }

        void AddItem(string after = "")
        {
            var list = draft.Value.Checks.ToList();
            var item = new ChecklistItem(Guid.NewGuid().ToString("N"), "", false);
            var index = list.FindIndex(value => value.Id == after);
            list.Insert(index < 0 ? list.Count : index + 1, item);
            draft.Set(draft.Value with { Checklist = list.ToArray() }, false, "checklist");
            if (checkWidgets.TryGetValue(item.Id, out var added)) added.Text.Focus(FocusState.Programmatic);
        }

        void RemoveItem(string id)
        {
            var items = draft.Value.Checks;
            var index = Array.FindIndex(items, item => item.Id == id);
            if (index < 0) return;
            var next = items.Where(item => item.Id != id).ToArray();
            draft.Set(draft.Value with { Checklist = next }, true, "checklist");
            if (next.Length > 0) checkWidgets[next[Math.Clamp(index - 1, 0, next.Length - 1)].Id].Text.Focus(FocusState.Programmatic);
            else addChecklist.Focus(FocusState.Programmatic);
        }

        void Update(string id, string text, bool done, bool immediate)
        {
            if (applying) return;
            var previous = draft.Value.Checks.FirstOrDefault(item => item.Id == id);
            if (previous is null || (previous.Text == text && previous.Done == done)) return;
            draft.Set(draft.Value with { Checklist = draft.Value.Checks.Select(item => item.Id == id ? item with { Text = text, Done = done } : item).ToArray() },
                immediate, "checklist");
        }
    }

    private static void SyncWriting(TextBox field, string text)
    {
        if (field.Text == text || field.Text.ReplaceLineEndings("\n") == text.ReplaceLineEndings("\n")) return;
        var start = field.SelectionStart;
        var length = field.SelectionLength;
        field.Text = text;
        start = Math.Min(start, field.Text.Length);
        field.Select(start, Math.Min(length, field.Text.Length - start));
    }

    private static TextBox WritingField(string value, string placeholder, bool multiline = false, bool sticky = false)
    {
        var field = Ui.Input("", value, multiline, placeholder);
        field.Style = Ui.Style(sticky ? "NovaStickyField" : "NovaNoteField");
        var transparent = new SolidColorBrush(Colors.Transparent);
        field.Resources["TextControlBackgroundPointerOver"] = transparent;
        field.Resources["TextControlBackgroundFocused"] = transparent;
        field.Resources["TextControlBorderBrushPointerOver"] = transparent;
        field.Resources["TextControlBorderBrushFocused"] = transparent;
        field.Resources["TextControlBorderThemeThicknessFocused"] = new Thickness(0);
        field.UseSystemFocusVisuals = false;
        return field;
    }

    private static Border NoteDivider() => new()
    {
        Height = 1, Opacity = .14,
        Background = new SolidColorBrush(Colors.Gray)
    };

    private static Border NoteSection(string label, string glyph, UIElement content)
    {
        var heading = Ui.Subtitle(label.ToUpperInvariant());
        heading.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
        heading.CharacterSpacing = 90;
        heading.FontSize = 11;
        var row = Ui.Row(new FontIcon { Glyph = glyph, FontSize = 13 }, heading);
        row.Spacing = 8;
        var card = Ui.Card(Ui.Stack(row, content));
        card.Padding = new Thickness(14);
        return card;
    }

    private static Grid NoteOption(string label, string description, string glyph, ToggleSwitch toggle)
    {
        var title = Ui.Text(label);
        title.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
        var hint = Ui.Subtitle(description);
        hint.FontSize = 11;
        var labels = Ui.Stack(title, hint);
        labels.Spacing = 2;
        Ui.Name(toggle, label);
        toggle.MinWidth = 0;
        toggle.VerticalAlignment = VerticalAlignment.Center;
        var icon = new FontIcon { Glyph = glyph, FontSize = 15, VerticalAlignment = VerticalAlignment.Center };
        var grid = Ui.InlineAction(labels, toggle);
        grid.ColumnDefinitions.Insert(0, new ColumnDefinition { Width = new GridLength(25) });
        Grid.SetColumn(labels, 1);
        Grid.SetColumn(toggle, 2);
        grid.Children.Add(icon);
        return grid;
    }

    private static Button NoteAction(string label, string glyph, Func<Task> action, bool destructive = false)
    {
        var button = Ui.Button(label, action);
        button.Content = Ui.Row(new FontIcon { Glyph = glyph, FontSize = 14 }, new TextBlock { Text = label });
        Ui.Name(button, label);
        button.HorizontalAlignment = HorizontalAlignment.Stretch;
        button.HorizontalContentAlignment = HorizontalAlignment.Left;
        if (destructive) button.Style = Ui.Style("NovaDangerButton");
        return button;
    }

    private static Grid DateRow(string label, TextBlock value)
    {
        value.FontSize = 11;
        var name = Ui.Subtitle(label);
        name.FontSize = 11;
        return Ui.InlineAction(name, value);
    }

    private static string NoteDate(DateTimeOffset stamp) => stamp == default ? "—" : stamp.ToLocalTime().ToString("MMM d, yyyy · HH:mm");

    private Brush NoteBorderBrush(string color)
    {
        var palette = ColorsByNote.FirstOrDefault(item => item.Value == color);
        var swatch = Ui.Rgb(palette.Value is null or "SLATE" ? (settings.Light ? 0x261808u : 0xffffffu) : palette.Swatch);
        return new SolidColorBrush(ColorHelper.FromArgb(palette.Value is null or "SLATE" ? (byte)29 : (byte)82, swatch.R, swatch.G, swatch.B));
    }

    private Brush StickyBrush(string color, bool subtle = false)
    {
        var palette = ColorsByNote.FirstOrDefault(item => item.Value == color);
        if (palette.Value is null) palette = ColorsByNote[0];
        var surface = Ui.Rgb(settings.Light ? palette.Light : palette.Dark);
        if (subtle) return new SolidColorBrush(surface);
        var swatch = Ui.Rgb(palette.Swatch);
        byte Mix(byte background, byte foreground) => (byte)Math.Round(background * .82 + foreground * .18);
        return new SolidColorBrush(ColorHelper.FromArgb(255, Mix(surface.R, swatch.R),
            Mix(surface.G, swatch.G), Mix(surface.B, swatch.B)));
    }
}
