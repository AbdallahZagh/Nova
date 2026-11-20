using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using NovaTaskflow.Api;
using NovaTaskflow.Controls;
using NovaTaskflow.ViewModels;
using System.Collections.ObjectModel;
using System.Text.Json;
using Windows.ApplicationModel.DataTransfer;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow
{
    private bool projectListView;

    private async Task Projects(WorkspacePage page, CancellationToken cancellation)
    {
        page.Subtitle = "Manage and track your active projects.";
        var data = (await api.Get("/api/projects", cancellation)).Items("projects").Where(project => !IsPendingDeletion(ProjectResource(project.Id()))).Select(project => WithPendingFields(project, ProjectResource(project.Id()))).Select(Card).ToArray();
        var scope = Ui.Choice("", ["All", "Owned", "Shared"], "All");
        var status = Ui.Choice("", new[] { "All statuses" }.Concat(Ui.ProjectStatuses), "All statuses");
        var search = Ui.Input("", placeholder: "Find a project");
        search.Width = 220;
        Ui.Name(search, "Find a project");
        var cards = new ProjectLibrary();
        cards.OpenRequested += card => Run(() => Go("Project", card.Project.Id()));
        cards.OptionsRequested += card => Run(() => ProjectActions(card.Project));
        page.ActionItems.Add(Ui.Button("New project", () => ProjectForm(default), true));
        page.FilterItems.Add(Ui.Wrap(search, scope, status));
        search.TextChanged += (_, _) => Draw();
        scope.SelectionChanged += (_, _) => Draw();
        status.SelectionChanged += (_, _) => Draw();
        Draw();

        void Draw()
        {
            var query = search.Text.Trim();
            var visible = data.Where(card =>
                (scope.SelectedIndex == 0 || (ProjectRole(card.Project) == "OWNER") == (scope.SelectedIndex == 1)) &&
                (status.SelectedIndex == 0 || card.Status == status.Selected()) &&
                (card.Title + " " + card.Description)
                    .Contains(query, StringComparison.OrdinalIgnoreCase))
                .ToArray();
            cards.Items = visible;
            if (visible.Length == 0) page.Empty(data.Length == 0 ? "No projects yet." : "No projects match.",
                data.Length == 0 ? "New project" : "Clear filters", data.Length == 0 ? () => ProjectForm(default) :
                    () => { search.Text = ""; scope.SelectedIndex = status.SelectedIndex = 0; return Task.CompletedTask; });
            else if (page.Body != cards) page.Body = cards;
        }
    }

    private static string ProjectResource(string id) => "/api/projects/" + Ui.PathId(id);
    private static string TaskResource(string id) => "/api/tasks/" + Ui.PathId(id);

    private ProjectCard Card(JsonElement project)
    {
        var owner = project.Field("owner");
        var ownerName = owner.Text("fullName", ProjectRole(project) == "OWNER" ? user.Text("fullName", "You") : "Project owner");
        var avatar = Uri.TryCreate(owner.Text("avatarUrl"), UriKind.Absolute, out var photo) && photo.Scheme is "https" or "http"
            ? new Microsoft.UI.Xaml.Media.Imaging.BitmapImage(photo) { DecodePixelWidth = 48 } : null;
        var work = $"{project.Number("completedTasks")} / {project.Number("totalTasks")} tasks · " +
                   $"{project.Number("completedSubtasks")} / {project.Number("totalSubtasks")} subtasks";
        var late = project.Number("overdueCount");
        var nextDue = project.Text("nextDueDate");
        var schedule = late > 0 ? $"{late} late" : "None late";
        if (nextDue.Length > 0) schedule += " · " + Ui.DateLabel(nextDue);
        return new ProjectCard(project, project.Text("name", project.Text("title")), project.Text("description"),
            ProjectStatus(project), ownerName, avatar, work, schedule, Math.Clamp(project.Number("completionPercentage"), 0, 100));
    }

    private string ProjectRole(JsonElement project)
    {
        var owner = project.Text("ownerId", project.Field("owner").Id());
        if (owner == user.Id()) return "OWNER";
        if (project.Text("myRole").Length > 0) return project.Text("myRole").ToUpperInvariant();
        return Members(project).FirstOrDefault(m => MemberId(m) == user.Id()).Text("role", "VIEWER").ToUpperInvariant();
    }

    private static IEnumerable<JsonElement> Members(JsonElement project)
        => new[] { "members", "teamMembers", "projectMembers", "project_members" }.SelectMany(field => project.Items(field))
            .DistinctBy(MemberId);

    private static string MemberId(JsonElement member) => member.Text("userId", member.Field("user").Id());
    private static string MemberName(JsonElement member) => member.Text("fullName",
        member.Field("user").Text("fullName", member.Text("name", member.Field("user").Text("name", "Team member"))));

    private static string ProjectStatus(JsonElement project)
    {
        var status = project.Text("status").Replace("_", " ");
        return Ui.ProjectStatuses.FirstOrDefault(s => s.Equals(status, StringComparison.OrdinalIgnoreCase)) ?? "Active";
    }

    private Task ProjectActions(JsonElement project)
    {
        var role = ProjectRole(project);
        var body = Ui.Stack(Ui.Subtitle(project.Text("description")),
            Ui.Button("Open", () => Go("Project", project.Id()), true));
        if (role is "OWNER" or "ADMIN")
        {
            body.Children.Add(Ui.Button("Edit", () => ProjectForm(project)));
            var archived = ProjectStatus(project) == "Archived";
            body.Children.Add(ActionButton(archived ? "Restore" : "Archive", async () =>
            {
                var change = await WriteWorkspace(HttpMethod.Patch, ProjectResource(project.Id()),
                    new { status = archived ? "Active" : "Archived" }, project, project.Text("name"));
                if (change.Queued) Toast("Project status saved on this PC.");
                await Go("Projects", refresh: true);
            }));
        }
        if (role == "OWNER" && !Demo) body.Children.Add(ActionButton("Delete", async () =>
        {
            if (!await Confirm("Delete project?", "This permanently removes the project and its tasks.", "Delete")) return;
            var change = await WriteWorkspace(HttpMethod.Delete, ProjectResource(project.Id()), null, project, "Delete " + project.Text("name"));
            await Go("Projects", refresh: true);
            Toast(change.Queued ? "Project deletion waiting to sync." : "Project deleted.");
        }));
        Drawer(project.Text("name"), body);
        return Task.CompletedTask;
    }

    private Task ProjectForm(JsonElement project)
    {
        var editing = project.Id().Length > 0;
        var name = Ui.Input("Name", project.Text("name"));
        var description = Ui.Input("Description", project.Text("description"), true);
        var status = Ui.Choice("Status", Ui.ProjectStatuses, ProjectStatus(project));
        var initialTeam = new Dictionary<string, InitialProjectMember>(StringComparer.Ordinal);
        var form = Ui.Stack(name, description, status, Ui.Row(
            Ui.Button("Cancel", CloseOverlay), ActionButton(editing ? "Save changes" : "Create project", async () =>
            {
                if (string.IsNullOrWhiteSpace(name.Text)) throw new InvalidOperationException("Enter a project name.");
                var body = new { name = name.Text.Trim(), description = description.Text.Trim(), status = status.Selected() };
                var change = await WriteWorkspace(editing ? HttpMethod.Patch : HttpMethod.Post,
                    editing ? ProjectResource(project.Id()) : "/api/projects", body, project, body.name,
                    projectTeam: initialTeam.Values.ToArray());
                if (change.Queued || initialTeam.Count == 0)
                    Toast(change.Queued ? "Project changes pending. Check Workspace sync for status." : "Project saved.");
                if (change.Queued && !editing) await Go("Projects", refresh: true);
                else await Go("Project", change.Data.Id().Length > 0 ? change.Data.Id() : project.Id(), true);
            }, true, "Saving…")));
        if (!Demo && systemAiAvailable)
            form.Children.Insert(2, ActionButton("Suggest a description", async () =>
            {
                var title = name.Text.Trim();
                if (title.Length == 0) throw new InvalidOperationException("Enter a project name first.");
                var suggestion = await api.Post("/api/projects/ai-description", new { title }, overlayCancellation.Token);
                var result = suggestion.Text("description");
                if (result.Length > 0) description.Text = result;
            }, busy: "Generating…"));
        if (!editing && !Demo)
        {
            var selected = Ui.Stack();
            var picker = PersonPicker(["ADMIN", "MEMBER", "VIEWER"], (person, role) =>
            {
                if (!initialTeam.TryAdd(person.Id(), new(person.Id(), role))) return Task.CompletedTask;
                var label = person.Text("fullName", person.Text("name"));
                var roles = Ui.Choice("Role", ["ADMIN", "MEMBER", "VIEWER"], role);
                var row = Ui.Wrap(Ui.Text(label), roles);
                roles.SelectionChanged += (_, _) => initialTeam[person.Id()] = new(person.Id(), roles.Selected());
                var remove = Ui.Button("Remove", () =>
                {
                    initialTeam.Remove(person.Id());
                    selected.Children.Remove(row);
                    return Task.CompletedTask;
                });
                Ui.Name(remove, $"Remove {label} from the new project");
                row.Children.Add(remove);
                selected.Children.Add(row);
                return Task.CompletedTask;
            }, person => person.Id() != user.Id());
            var team = new Expander { Header = "Add project members", Content = Ui.Stack(selected, picker),
                HorizontalContentAlignment = HorizontalAlignment.Stretch };
            form.Children.Insert(form.Children.Count - 1, team);
        }
        Drawer(editing ? "Edit project" : "New project", form);
        return Task.CompletedTask;
    }

    private async Task Project(WorkspacePage page, string id, CancellationToken cancellation)
    {
        var results = await Task.WhenAll(api.Get($"/api/projects/{Ui.PathId(id)}", cancellation),
            api.Get($"/api/tasks/project/{Ui.PathId(id)}", cancellation));
        var project = WithPendingFields(results[0], ProjectResource(id));
        var tasks = results[1].Items("tasks").Where(task => !IsPendingDeletion(TaskResource(task.Id()))).Select(task => WithPendingFields(task, TaskResource(task.Id()))).ToArray();
        var role = ProjectRole(project);
        var writable = role != "VIEWER";
        var members = Members(project).ToArray();
        page.Title = project.Text("name");
        page.Subtitle = string.Join(" · ", new[] { ProjectStatus(project), project.Text("description") }.Where(s => s.Length > 0));
        var teamFaces = Ui.Row();
        teamFaces.Spacing = 4;
        foreach (var member in members.Take(5).Select(TaskAvatar))
        {
            var avatar = new PersonPicture { Width = 26, Height = 26, DisplayName = member.Name, ProfilePicture = member.Avatar };
            ToolTipService.SetToolTip(avatar, member.Name);
            Ui.Name(avatar, member.Name);
            teamFaces.Children.Add(avatar);
        }
        if (members.Length > 5) teamFaces.Children.Add(Ui.Subtitle($"+{members.Length - 5}"));
        var teamRow = Ui.Wrap(Ui.Button("Projects", () => Go("Projects")), Ui.Button("Activity", () => ProjectActivity(project)), teamFaces);
        var canComplete = role is ("OWNER" or "ADMIN") && ProjectStatus(project) is ("Active" or "In Progress") &&
            tasks.Length > 0 && tasks.Count(task => TaskStatus(task) == "Completed") * 5 >= tasks.Length * 4;
        if (canComplete) teamRow.Children.Insert(2, ActionButton("Mark complete", Complete));
        page.FilterItems.Add(teamRow);
        var person = Ui.Choice("Assignee", new[] { "All people", "Unassigned" }.Concat(members.Select(MemberName)), "All people");
        var when = Ui.Choice("Due", ["Everything", "Late", "Today", "This week"], "Everything");
        var priority = Ui.Choice("Priority", new[] { "All priorities" }.Concat(Ui.Priorities).Append("Critical"), "All priorities");
        var filters = Ui.Wrap(person, when, priority);
        page.FilterItems.Add(filters);
        if (writable) page.ActionItems.Add(Ui.Button("New task", () => TaskForm(id, project, default), true));
        var layout = Ui.Button(projectListView ? "Board" : "List");
        layout.Click += (_, _) =>
        {
            projectListView = !projectListView;
            layout.Content = projectListView ? "Board" : "List";
            Draw();
        };
        page.ActionItems.Add(layout);
        var projectLinks = new (string Title, Func<Task> Open)[]
        {
            ("Notes", () => ProjectNotes(project)), ("Whiteboards", () => Go("Whiteboard", id)),
            ("Members", () => ProjectMembers(project)), ("Suggestions", () => Suggestions(project)),
            ("Project actions", () => ProjectActions(project))
        };
        var wideActions = projectLinks.Select(link => Ui.Button(link.Title, link.Open)).ToArray();
        foreach (var action in wideActions) page.ActionItems.Add(action);
        var menu = new MenuFlyout();
        AddProjectMenuItem("Back to projects", () => Go("Projects"));
        foreach (var link in projectLinks) AddProjectMenuItem(link.Title, link.Open);
        AddProjectMenuItem("Activity", () => ProjectActivity(project));
        if (canComplete) AddProjectMenuItem("Mark complete", Complete);
        var compactActions = Ui.Button("Project");
        compactActions.Flyout = menu;
        Ui.Name(compactActions, "Project menu");
        var filterToggle = new Microsoft.UI.Xaml.Controls.Primitives.ToggleButton { Content = "Filters" };
        Ui.Name(filterToggle, "Show task filters");
        page.ActionItems.Add(compactActions);
        page.ActionItems.Add(filterToggle);
        filterToggle.Checked += (_, _) => AdaptControls(page.ActualWidth, page.ActualHeight);
        filterToggle.Unchecked += (_, _) => AdaptControls(page.ActualWidth, page.ActualHeight);
        page.SizeChanged += (_, args) => AdaptControls(args.NewSize.Width, args.NewSize.Height);
        AdaptControls(page.ActualWidth, page.ActualHeight);
        person.SelectionChanged += (_, _) => Draw();
        when.SelectionChanged += (_, _) => Draw();
        priority.SelectionChanged += (_, _) => Draw();
        Draw();

        void AdaptControls(double width, double height)
        {
            var compact = width < 790 || height < 560;
            foreach (var action in wideActions) action.Visibility = compact ? Visibility.Collapsed : Visibility.Visible;
            teamRow.Visibility = compact ? Visibility.Collapsed : Visibility.Visible;
            compactActions.Visibility = filterToggle.Visibility = compact ? Visibility.Visible : Visibility.Collapsed;
            filters.Visibility = !compact || filterToggle.IsChecked == true ? Visibility.Visible : Visibility.Collapsed;
        }

        void AddProjectMenuItem(string label, Func<Task> open)
        {
            var entry = new MenuFlyoutItem { Text = label };
            entry.Click += (_, _) => Run(open);
            menu.Items.Add(entry);
        }

        async Task Complete()
        {
            if (!await Confirm("Complete project?", project.Text("name"), "Mark complete")) return;
            var change = await WriteWorkspace(HttpMethod.Patch, ProjectResource(id), new { status = "Completed" }, project, project.Text("name"));
            if (change.Queued) Toast("Project status saved on this PC.");
            await Go("Project", id, true);
        }

        void Draw()
        {
            var today = DateTime.Today;
            var weekStart = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
            var shown = tasks.Where(task =>
            {
                if (priority.SelectedIndex > 0 && !task.Text("priority").Equals(priority.Selected(), StringComparison.OrdinalIgnoreCase))
                    return false;
                if (person.SelectedIndex > 0)
                {
                    var people = AssignmentIds(task);
                    if (person.SelectedIndex == 1 && people.Length > 0) return false;
                    if (person.SelectedIndex > 1 && !people.Contains(MemberId(members[person.SelectedIndex - 2]))) return false;
                }
                if (when.SelectedIndex == 0) return true;
                if (!DateTimeOffset.TryParse(task.Text("dueDate"), out var date)) return false;
                return when.SelectedIndex switch
                {
                    1 => date.LocalDateTime.Date < today && TaskStatus(task) != "Completed",
                    2 => date.LocalDateTime.Date == today,
                    _ => date.LocalDateTime.Date >= weekStart && date.LocalDateTime.Date < weekStart.AddDays(7)
                };
            }).OrderBy(task => task.Text("priority").ToUpperInvariant() switch
            {
                "CRITICAL" => 0, "HIGH" => 1, "MEDIUM" => 2, _ => 3,
            }).ThenByDescending(task => task.Text("updatedAt", task.Text("createdAt")), StringComparer.Ordinal).ToArray();
            if (projectListView)
            {
                if (shown.Length == 0)
                {
                    if (tasks.Length == 0) page.Empty("No tasks yet.", writable ? "New task" : null, () => TaskForm(id, project, default));
                    else page.Empty("No tasks match these filters.", "Clear filters", () =>
                    {
                        person.SelectedIndex = when.SelectedIndex = priority.SelectedIndex = 0;
                        return Task.CompletedTask;
                    });
                    return;
                }
                page.Body = Ui.List(new(shown.Select(TaskRow)), row => Run(() => TaskDrawer(row.Id, project)));
                return;
            }

            var columns = new List<FrameworkElement>();
            foreach (var status in Ui.TaskStatuses)
            {
                var rows = shown.Where(item => TaskStatus(item) == status).Select(TaskCard).ToArray();
                var list = new ListView
                {
                    ItemsSource = rows, ItemTemplate = (DataTemplate)Application.Current.Resources["NovaBoardTask"],
                    ItemContainerStyle = Ui.Style("NovaRowContainer"), SelectionMode = ListViewSelectionMode.None,
                    IsItemClickEnabled = true, HorizontalContentAlignment = HorizontalAlignment.Stretch
                };
                list.ItemClick += (_, args) =>
                {
                    if (args.ClickedItem is BoardTaskCard row) Run(() => TaskDrawer(row.Id, project));
                };
                Ui.Name(list, status + " tasks");
                list.CanDragItems = writable;
                list.AllowDrop = writable;
                list.DragItemsStarting += (_, args) =>
                {
                    if (args.Items.FirstOrDefault() is not BoardTaskCard row) return;
                    args.Data.RequestedOperation = DataPackageOperation.Move;
                    args.Data.SetText("nova-task:" + row.Id);
                };
                list.DragOver += (_, args) =>
                {
                    if (args.DataView.Contains(StandardDataFormats.Text))
                        args.AcceptedOperation = DataPackageOperation.Move;
                };
                list.Drop += (_, args) => Run(async () =>
                {
                    var payload = await args.DataView.GetTextAsync();
                    if (!payload.StartsWith("nova-task:", StringComparison.Ordinal)) return;
                    var source = tasks.FirstOrDefault(task => task.Id() == payload[10..]);
                    if (source.Id().Length == 0 || TaskStatus(source) == status) return;
                    var change = await WriteWorkspace(HttpMethod.Patch, TaskResource(source.Id()), new { status }, source, source.Text("title"));
                    if (change.Queued) Toast("Task status saved on this PC.");
                    await Go("Project", id, true);
                });
                var lane = new Grid { RowSpacing = 10 };
                lane.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
                lane.RowDefinitions.Add(new RowDefinition());
                var laneHeader = new Grid { ColumnSpacing = 8 };
                laneHeader.ColumnDefinitions.Add(new ColumnDefinition());
                laneHeader.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                var laneTitle = Ui.Text($"{status}  {rows.Length}", size: 15);
                laneTitle.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
                laneTitle.VerticalAlignment = VerticalAlignment.Center;
                laneHeader.Children.Add(laneTitle);
                if (writable)
                {
                    var addTask = Ui.Button("+", () => TaskForm(id, project, default, status));
                    var label = $"New task in {status}";
                    Ui.Name(addTask, label);
                    ToolTipService.SetToolTip(addTask, label);
                    addTask.Padding = new Thickness(10, 3, 10, 3);
                    Grid.SetColumn(addTask, 1);
                    laneHeader.Children.Add(addTask);
                }
                lane.Children.Add(laneHeader);
                Grid.SetRow(list, 1);
                lane.Children.Add(list);
                var laneGlass = Ui.Card(lane);
                laneGlass.Padding = new Thickness(10);
                columns.Add(laneGlass);
            }
            var board = new Grid { ColumnSpacing = 12, MinWidth = 844 };
            for (var i = 0; i < columns.Count; i++)
            {
                board.ColumnDefinitions.Add(new());
                Grid.SetColumn(columns[i], i);
                board.Children.Add(columns[i]);
            }
            page.Body = new ScrollViewer
            {
                Content = board, HorizontalScrollMode = ScrollMode.Enabled, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
                VerticalScrollMode = ScrollMode.Disabled, VerticalScrollBarVisibility = ScrollBarVisibility.Disabled
            };
        }
    }

    private async Task ProjectActivity(JsonElement project)
    {
        var data = await api.Get($"/api/projects/{Ui.PathId(project.Id())}/activity", viewCancellation.Token);
        var body = Ui.Stack();
        foreach (var activity in data.Items("data"))
        {
            var task = activity.Field("task");
            var section = Ui.Stack(Ui.Text(activity.Text("content", Label(activity.Text("type")))),
                Ui.Subtitle($"{activity.Field("author").Text("name", "Workspace")} · {DateStamp(activity.Text("createdAt"))}"));
            if (task.Id().Length > 0) section.Children.Add(Ui.Button(task.Text("title", "Open task"), () => TaskDrawer(task.Id(), project)));
            body.Children.Add(Ui.Card(section));
        }
        if (body.Children.Count == 0) body.Children.Add(Ui.Subtitle("No project activity yet."));
        Drawer("Project activity", body);
    }

    private static string TaskStatus(JsonElement item)
    {
        var status = item.Text("status").Replace("_", " ");
        return Ui.TaskStatuses.FirstOrDefault(s => s.Equals(status, StringComparison.OrdinalIgnoreCase)) ??
            (status is "Done" or "DONE" ? "Completed" : "To Do");
    }

    private static RowItem TaskRow(JsonElement item)
    {
        var subtasks = item.Items("subtasks").ToArray();
        var title = item.Text("title");
        var details = $"{Ui.DateLabel(item.Text("dueDate"))} · {subtasks.Count(s => s.Flag("isCompleted"))}/{subtasks.Length}";
        var assignees = string.Join(", ", item.Items("assignees").Select(MemberName).Where(name => name != "Team member"));
        if (assignees.Length > 0) details += " · " + assignees;
        return new(item.Id(), title, details, item.Text("priority")) { Data = item };
    }

    private static TaskPerson TaskAvatar(JsonElement assignment)
    {
        var avatar = assignment.Text("avatarUrl", assignment.Field("user").Text("avatarUrl"));
        return new TaskPerson(MemberName(assignment), Uri.TryCreate(avatar, UriKind.Absolute, out var uri) &&
            uri.Scheme is "https" or "http" ? new BitmapImage(uri) { DecodePixelWidth = 48 } : null);
    }

    private static BoardTaskCard TaskCard(JsonElement item)
    {
        var priority = item.Text("priority", "Medium");
        var swatch = priority.ToUpperInvariant() switch { "CRITICAL" => 0xEC6766u, "HIGH" => 0xF5874Fu, "LOW" => 0x69BF95u, _ => 0xE4B66Au };
        var subtasks = item.Items("subtasks").ToArray();
        var people = item.Items("assignees").Select(TaskAvatar).ToArray();
        var extra = people.Length - 2;
        return new BoardTaskCard(item.Id(), item.Text("title"), priority, new SolidColorBrush(Ui.Rgb(swatch)),
            Ui.DateLabel(item.Text("dueDate")), $"{subtasks.Count(subtask => subtask.Flag("isCompleted"))}/{subtasks.Length}",
            people.Take(2).ToArray(), $"+{extra}", extra > 0 ? Visibility.Visible : Visibility.Collapsed);
    }

    private async Task ProjectMembers(JsonElement project)
    {
        var path = $"/api/projects/{Ui.PathId(project.Id())}/members";
        var canManage = !Demo && ProjectRole(project) is "OWNER" or "ADMIN";
        var body = Ui.Stack();
        string[] roles = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];
        foreach (var member in Members(project))
        {
            var row = Ui.Row(Ui.Text(MemberName(member)));
            var current = member.Text("role", "MEMBER");
            if (canManage && current != "OWNER")
            {
                var role = Ui.Choice("", roles.Skip(1), current);
                row.Children.Add(role);
                row.Children.Add(ActionButton("Save role", async () =>
                {
                    await api.Patch($"{path}/{Ui.PathId(MemberId(member))}", new { role = role.Selected() });
                    Toast("Member role updated.");
                }));
                row.Children.Add(ActionButton("Remove", async () =>
                {
                    await api.Delete($"{path}/{Ui.PathId(MemberId(member))}");
                    body.Children.Remove(row);
                }));
            }
            else row.Children.Add(Ui.Subtitle(current));
            body.Children.Add(Ui.Card(row));
        }
        if (canManage) body.Children.Add(Ui.Button("Add member", () => FindPerson("Add member", roles.Skip(1), async (person, role) =>
        {
            var projectPath = ProjectResource(project.Id());
            try
            {
                await api.Post(path, new { userId = person, role });
            }
            catch (Exception original) when (original is ApiFailure or IOException)
            {
                var latest = await api.GetFresh(projectPath, overlayCancellation.Token);
                if (!Members(latest).Any(member => MemberId(member) == person && member.Text("role") == role)) throw;
                await ProjectMembers(latest);
                Toast("Membership is saved. " + original.Message, InfoBarSeverity.Warning);
                return;
            }
            await ProjectMembers(await api.Get(projectPath));
            Toast("Member added.");
        }), true));
        if (body.Children.Count == 0) body.Children.Add(Ui.Subtitle("No members yet."));
        Drawer("Members", body);
        await Task.CompletedTask;
    }

    private Task FindPerson(string label, IEnumerable<string> roles, Func<string, string, Task> picked)
    {
        Drawer(label, PersonPicker(roles, (person, role) => picked(person.Id(), role)));
        return Task.CompletedTask;
    }

    private StackPanel PersonPicker(IEnumerable<string> roles, Func<JsonElement, string, Task> picked,
        Func<JsonElement, bool>? include = null)
    {
        var query = Ui.Input("Find a person", placeholder: "Name, username, or email");
        var role = Ui.Choice("Role", roles, "MEMBER");
        var matches = Ui.Stack();
        async Task Search()
        {
            matches.Children.Clear();
            if (string.IsNullOrWhiteSpace(query.Text)) return;
            var cancellation = overlayCancellation.Token;
            var data = await api.Get("/api/users/search?q=" + Uri.EscapeDataString(query.Text.Trim()), cancellation);
            cancellation.ThrowIfCancellationRequested();
            foreach (var match in data.Items("users").Where(person => include?.Invoke(person) != false).Take(20))
                matches.Children.Add(ActionButton(match.Text("fullName", match.Text("name")), () => picked(match, role.Selected())));
            if (matches.Children.Count == 0) matches.Children.Add(Ui.Subtitle("No results."));
        }
        query.KeyDown += (_, args) =>
        {
            if (args.Key != Windows.System.VirtualKey.Enter) return;
            args.Handled = true;
            Run(Search);
        };
        return Ui.Stack(query, role, ActionButton("Search people", Search), matches);
    }

    private async Task Suggestions(JsonElement project)
    {
        var body = Ui.Stack(Ui.Subtitle("Loading suggestions…"));
        Drawer("Suggestions", body);
        var data = await api.Get($"/api/project-suggestions/project/{Ui.PathId(project.Id())}", overlayCancellation.Token);
        body.Children.Clear();
        var role = ProjectRole(project);
        var participants = Members(project).Append(project.Field("owner")).ToArray();
        if (role != "VIEWER")
        {
            var input = Ui.Input("New suggestion", multiline: true);
            body.Children.Add(Ui.MentionInput(input, participants));
            body.Children.Add(ActionButton("New suggestion", async () =>
            {
                if (string.IsNullOrWhiteSpace(input.Text)) return;
                await api.Post("/api/project-suggestions", new { projectId = project.Id(), content = input.Text.Trim() });
                await Suggestions(project);
            }, true));
        }
        var items = data.Items("suggestions").ToArray();
        foreach (var item in items)
        {
            string[] states = ["In Review", "In Progress", "Done", "Rejected"];
            var buttons = Ui.Wrap();
            var path = $"/api/project-suggestions/{Ui.PathId(item.Id())}";
            var state = State(item);
            var author = item.Field("createdBy").ValueKind == JsonValueKind.Object ? item.Field("createdBy") : item.Field("author");
            var authorId = item.Text("createdById", item.Text("authorId", author.Id()));
            var authorName = author.Text("fullName", author.Text("name", "Project member"));
            var authorLabel = new TextBlock { Text = authorName, TextTrimming = TextTrimming.CharacterEllipsis, MaxLines = 1 };
            var authorLink = new HyperlinkButton { Content = authorLabel, Padding = new Thickness(0), IsEnabled = authorId.Length > 0 };
            authorLink.Click += (_, _) => OpenMention(authorId);
            var avatar = TaskAvatar(author);
            var authorDetails = Ui.Stack(authorLink, Ui.Subtitle(RelativeTime(item.Text("createdAt"))));
            authorDetails.Spacing = 2;
            var identity = new Grid { ColumnSpacing = 8 };
            identity.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            identity.ColumnDefinitions.Add(new ColumnDefinition());
            identity.Children.Add(new PersonPicture { DisplayName = authorName, ProfilePicture = avatar.Avatar, Width = 34, Height = 34 });
            Grid.SetColumn(authorDetails, 1);
            identity.Children.Add(authorDetails);
            var badgeText = Ui.Text(state, size: 11);
            badgeText.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
            var badge = new Border { Child = badgeText, Padding = new Thickness(7, 4, 7, 4), CornerRadius = new CornerRadius(10),
                VerticalAlignment = VerticalAlignment.Center };
            Button? convert = null;
            var canManage = role == "OWNER" || authorId == user.Id();
            var contentText = Ui.Mentions(item.Text("content"), participants, OpenMention);
            var card = Ui.Stack(Ui.InlineAction(identity, badge), contentText);
            if (canManage)
            {
                var quickStatus = Ui.Choice("", states, state);
                quickStatus.HorizontalAlignment = HorizontalAlignment.Left;
                Ui.Name(quickStatus, "Suggestion status");
                var changing = false;
                quickStatus.SelectionChanged += (_, _) =>
                {
                    var desired = quickStatus.Selected();
                    if (changing || desired.Length == 0 || desired == state) return;
                    Run(async () =>
                    {
                        changing = true;
                        quickStatus.IsEnabled = false;
                        foreach (var button in buttons.Children.OfType<Button>()) button.IsEnabled = false;
                        try
                        {
                            var saved = await api.Patch(path, new { status = desired }, overlayCancellation.Token);
                            state = State(saved);
                            UpdateStatus();
                        }
                        finally
                        {
                            quickStatus.SelectedItem = state;
                            quickStatus.IsEnabled = true;
                            foreach (var button in buttons.Children.OfType<Button>()) button.IsEnabled = true;
                            changing = false;
                        }
                    });
                };
                card.Children.Add(quickStatus);
                buttons.Children.Add(Ui.Button("Edit", () =>
                {
                    var content = Ui.Input("Suggestion", item.Text("content"), true);
                    var status = Ui.Choice("Status", states, state);
                    Drawer("Edit suggestion", Ui.Stack(Ui.MentionInput(content, participants), status,
                        Ui.Wrap(Ui.Button("Cancel", () => Suggestions(project)), ActionButton("Save suggestion", async () =>
                        {
                            if (string.IsNullOrWhiteSpace(content.Text)) throw new InvalidOperationException("Enter a suggestion.");
                            await api.Patch(path, new { content = content.Text.Trim(), status = status.Selected() }, overlayCancellation.Token);
                            await Suggestions(project);
                        }, true))));
                    return Task.CompletedTask;
                }));
                buttons.Children.Add(ActionButton("Delete", async () =>
                {
                    if (!await Confirm("Delete suggestion?", "This removes the suggestion from the project.", "Delete")) return;
                    await api.Delete(path, overlayCancellation.Token);
                    await Suggestions(project);
                }));
            }
            if (role != "VIEWER")
            {
                convert = ActionButton("Turn into task", async () =>
                {
                    var result = await api.Post(path + "/convert-to-task");
                    await Go("Project", project.Id(), true);
                    if (result.Field("task").Id() is { Length: > 0 } task) await TaskDrawer(task, project);
                    Toast("Suggestion converted to a task.");
                });
                buttons.Children.Insert(0, convert);
            }
            UpdateStatus();
            badge.Loaded += (_, _) => appearanceChanged += UpdateStatus;
            badge.Unloaded += (_, _) => appearanceChanged -= UpdateStatus;
            if (buttons.Children.Count > 0) card.Children.Add(buttons);
            body.Children.Add(Ui.Card(card));

            string State(JsonElement suggestion) => states.FirstOrDefault(value =>
                value.Equals(suggestion.Text("status").Replace('_', ' '), StringComparison.OrdinalIgnoreCase)) ?? states[0];

            void UpdateStatus()
            {
                badgeText.Text = state;
                var color = state switch
                {
                    "Done" => settings.Light ? 0x286048u : 0x8cccadu,
                    "Rejected" => settings.Light ? 0xb42318u : 0xff9086u,
                    "In Progress" => settings.Light ? 0x8e4a0du : 0xf0b66bu,
                    _ => settings.Light ? 0x65584fu : 0xb4aaa4u
                };
                var tone = Ui.Rgb(color);
                badgeText.Foreground = new SolidColorBrush(tone);
                badge.Background = new SolidColorBrush(Microsoft.UI.ColorHelper.FromArgb(28, tone.R, tone.G, tone.B));
                if (convert is not null) convert.Visibility = state == "Rejected" ? Visibility.Collapsed : Visibility.Visible;
            }
        }
        if (items.Length == 0) body.Children.Add(Ui.Subtitle("No suggestions yet."));
    }
}
