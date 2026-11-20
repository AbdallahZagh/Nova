using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using NovaTaskflow.Api;
using NovaTaskflow.Controls;
using NovaTaskflow.ViewModels;
using System.Text.Json;
using Windows.System;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow
{
    private async Task TaskDrawer(string id, JsonElement project = default)
    {
        var loading = Ui.Stack(Ui.Subtitle("Loading task…"));
        Drawer("Task details", loading);
        var cancellation = overlayCancellation.Token;
        var task = WithPendingFields(await api.Get(TaskResource(id), cancellation), TaskResource(id));
        var projectId = task.Text("projectId", task.Field("project").Id());
        if (project.Id().Length == 0 && projectId.Length > 0)
            project = await api.Get($"/api/projects/{Ui.PathId(projectId)}", cancellation);
        cancellation.ThrowIfCancellationRequested();
        await TaskForm(projectId, project, task);
    }

    private async Task TaskForm(string projectId, JsonElement project, JsonElement task, string initialStatus = "To Do")
    {
        var editing = task.Id().Length > 0;
        var role = ProjectRole(project);
        var writable = role != "VIEWER";
        var canAssignTasks = !Demo && role is "OWNER" or "ADMIN";
        var canAssignSubtasks = !Demo && role is "OWNER" or "ADMIN" or "MEMBER";
        var ownAssignment = role == "MEMBER" ? user.Id() : null;
        var title = Ui.Input("Task title", task.Text("title"));
        var description = Ui.Input("Description", task.Text("description"), true, "Add a description...");
        var status = Ui.Choice("Status", Ui.TaskStatuses, editing ? TaskStatus(task) : initialStatus);
        var priorities = task.Text("priority") == "Critical" ? Ui.Priorities.Append("Critical") : Ui.Priorities;
        var priority = Ui.Choice("Priority", priorities, task.Text("priority", "Medium"));
        var due = Ui.Date("Due date", task.Text("dueDate"));
        var list = Ui.Stack();
        var panel = Ui.Stack(title);
        var path = $"/api/tasks/{Ui.PathId(task.Id())}";
        var members = Members(project).Where(member => member.Text("role") != "VIEWER").ToArray();
        var assignments = AssignmentIds(task);
        var assigned = AssignmentPicker(members, assignments, canAssignTasks);
        var draftSubtasks = new List<(TextBox Title, CalendarDatePicker Due, CheckBox Done, Func<string[]> Selected)>();
        var aiCaption = Ui.Subtitle("");
        var existingSubtasks = task.Items("subtasks")
            .Where(item => !IsPendingDeletion("/api/subtasks/" + Ui.PathId(item.Id())))
            .Select(item => WithPendingFields(item, "/api/subtasks/" + Ui.PathId(item.Id()))).ToList();
        var progress = new ProgressBar { Minimum = 0, Maximum = Math.Max(1, existingSubtasks.Count), Value = existingSubtasks.Count(s => s.Flag("isCompleted")) };
        var progressLabel = Ui.Subtitle($"{progress.Value}/{existingSubtasks.Count} complete");
        var aiFields = Ui.Stack();
        if (writable && !Demo && systemAiAvailable)
        {
            var generate = ActionButton(editing ? "Suggest an update" : "Generate with AI", async () =>
            {
                var existing = existingSubtasks.Select(s => s.Text("title")).Concat(draftSubtasks.Select(s => s.Title.Text)).Where(s => s.Length > 0).ToArray();
                var suggestion = await api.Post("/api/tasks/ai-suggest", new
                {
                    title = title.Text.Trim(), description = description.Text.Trim(), existingSubtasks = existing
                });
                description.Text = suggestion.Text("description");
                priority.SelectedItem = Ui.Priorities.FirstOrDefault(p => p.Equals(suggestion.Text("priority"), StringComparison.OrdinalIgnoreCase)) ?? "Medium";
                var date = suggestion.Text("dueDate");
                due.Date = Ui.ParseCalendarDate(date);
                var known = new HashSet<string>(existing.Select(s => s.Trim()), StringComparer.OrdinalIgnoreCase);
                foreach (var item in suggestion.Items("subTasks"))
                {
                    var next = item.ValueKind == JsonValueKind.String ? item.GetString()?.Trim() : item.Text("title").Trim();
                    if (!string.IsNullOrWhiteSpace(next) && known.Add(next)) DraftRow(next);
                }
                aiCaption.Text = "AI draft";
                if (editing) Toast("Update suggested. Review the description, date, and new subtasks, then save.");
            }, busy: "Generating task draft");
            generate.HorizontalAlignment = HorizontalAlignment.Stretch;
            generate.IsEnabled = !string.IsNullOrWhiteSpace(title.Text);
            title.TextChanged += (_, _) => generate.IsEnabled = !string.IsNullOrWhiteSpace(title.Text);
            aiFields.Children.Add(generate);
            aiFields.Children.Add(Ui.Subtitle(editing ? "Refresh the description, priority, due date, and missing subtasks."
                : "Fill description, priority, due date, and subtasks."));
            aiFields.Children.Add(aiCaption);
            description.TextChanged += (_, _) => aiCaption.Text = "";
            priority.SelectionChanged += (_, _) => aiCaption.Text = "";
            due.DateChanged += (_, _) => aiCaption.Text = "";
            panel.Children.Add(aiFields);
        }
        panel.Children.Add(Ui.AdaptiveColumns(270, status, priority));
        panel.Children.Add(due);
        if (members.Length > 0)
        {
            var assignmentArea = Ui.Stack(Ui.Subtitle("Assigned to"), assigned.Panel);
            if (editing && canAssignTasks) assignmentArea.Children.Add(ActionButton("Save assignment", async () =>
            {
                await SaveAssignments("tasks", task.Id(), assignments, assigned.Selected());
                assignments = assigned.Selected();
                Toast("Assignment saved.");
            }));
            panel.Children.Add(Ui.Card(assignmentArea));
        }
        panel.Children.Add(description);
        title.IsReadOnly = description.IsReadOnly = !writable;
        status.IsEnabled = priority.IsEnabled = due.IsEnabled = writable;
        foreach (var item in existingSubtasks) list.Children.Add(SubtaskRow(item, task.Id(), writable, canAssignSubtasks, members, progress, progressLabel, ownAssignment));
        var subtasks = Ui.Stack(Ui.Section("Subtasks"), progressLabel, progress, list);
        if (writable)
        {
            var add = Ui.Input("", placeholder: "Add a subtask…");
            async Task AddSubtask()
            {
                var name = add.Text.Trim();
                if (name.Length == 0) return;
                add.Text = "";
                if (!editing) { DraftRow(name); return; }
                try
                {
                    var change = await WriteWorkspace(HttpMethod.Post, "/api/subtasks", new { taskId = task.Id(), title = name }, default, name);
                    if (change.Queued) { Toast("Subtask saved on this PC."); return; }
                    var row = change.Data;
                    list.Children.Add(SubtaskRow(row, task.Id(), true, canAssignSubtasks, members, progress, progressLabel, ownAssignment));
                    progress.Maximum++;
                    progressLabel.Text = $"{progress.Value}/{progress.Maximum} complete";
                }
                catch { add.Text = name; throw; }
            }
            add.KeyDown += (_, args) =>
            {
                if (args.Key == VirtualKey.Enter) { args.Handled = true; Run(AddSubtask); }
            };
            var addButton = ActionButton("+", AddSubtask, true);
            Ui.Name(addButton, "Add subtask");
            subtasks.Children.Add(Ui.InlineAction(add, addButton));
            if (!editing) subtasks.Children.Add(ActionButton("Add a subtask", () => { DraftRow(""); return Task.CompletedTask; }));
        }
        panel.Children.Add(Ui.Card(subtasks));
        StackPanel? comments = null;
        if (editing)
        {
            comments = Ui.Stack(Ui.Subtitle("Loading comments…"));
            panel.Children.Add(Ui.Card(comments));
            panel.Children.Add(Ui.Card(TaskActivity(task)));
        }
        if (writable)
        {
            var actions = Ui.Row();
            if (editing) actions.Children.Add(ActionButton("Delete task", async () =>
            {
                if (!await Confirm("Delete task?", "This permanently removes the task and its subtasks.", "Delete")) return;
                var change = await WriteWorkspace(HttpMethod.Delete, path, null, task, "Delete " + task.Text("title"));
                await CloseOverlay();
                await Go(route, routeId, true);
                Toast(change.Queued ? "Task deletion waiting to sync." : "Task deleted.");
            }));
            else actions.Children.Add(Ui.Button("Cancel", CloseOverlay));

            actions.Children.Add(ActionButton(editing ? "Save" : "Create task", async () =>
            {
                if (title.Text.Trim().Length == 0) throw new InvalidOperationException("Enter a task title.");
                var update = new Dictionary<string, object?>
                {
                    ["title"] = title.Text.Trim(), ["description"] = description.Text.Trim(),
                    ["status"] = status.Selected(), ["priority"] = priority.Selected()
                };
                if (editing || due.Date is not null) update["dueDate"] = due.DateValue();
                var drafted = draftSubtasks.Select(item => new InitialSubtask(item.Title.Text.Trim(), item.Due.DateValue(),
                    item.Done.IsChecked == true, item.Selected())).Where(item => item.Title.Length > 0).ToArray();
                var queued = false;
                if (editing)
                {
                    var change = await WriteWorkspace(HttpMethod.Patch, path, update, task, title.Text.Trim());
                    queued = change.Queued;
                    var latest = drafted.Length > 0 && !change.Queued
                        ? (await api.Get(path)).Items("subtasks")
                        : existingSubtasks;
                    var known = new HashSet<string>(latest.Select(s => s.Text("title").Trim()), StringComparer.OrdinalIgnoreCase);
                    foreach (var item in drafted)
                    {
                        if (!known.Add(item.Title)) continue;
                        var subtask = await WriteWorkspace(HttpMethod.Post, "/api/subtasks", new { taskId = task.Id(), title = item.Title, dueDate = item.DueDate }, default, item.Title);
                        queued |= subtask.Queued;
                    }
                }
                else
                {
                    update["projectId"] = projectId;
                    var wantsSetup = drafted.Any(item => item.Done || item.Assignees.Length > 0);
                    if (wantsSetup && drafted.GroupBy(item => (item.Title, item.DueDate)).Any(group => group.Count() > 1))
                        throw new InvalidOperationException("Use a different title or date for matching subtasks with completion or assignees.");
                    update["subtasks"] = drafted.Select(item => new { title = item.Title, dueDate = item.DueDate }).ToArray();
                    var change = await WriteWorkspace(HttpMethod.Post, "/api/tasks", update, default, title.Text.Trim(),
                        canAssignTasks ? assigned.Selected() : [], setup: wantsSetup ? drafted : null);
                    queued = change.Queued;
                }
                await CloseOverlay();
                await Go(route, routeId, true);
                Toast(queued ? "Task changes saved on this PC. Check Workspace sync for status." : "Task saved.");
            }, true, "Saving…"));
            panel.Children.Add(actions);
        }
        Drawer(editing ? "Task details" : "New task", panel);
        if (comments is not null) await Comments(comments, task.Id(), role, Members(project).Append(project.Field("owner")).ToArray(), overlayCancellation.Token);

        void DraftRow(string name)
        {
            var text = Ui.Input("", name, placeholder: "Subtask title");
            text.HorizontalAlignment = HorizontalAlignment.Stretch;
            var dueDate = Ui.Date("Subtask date", "");
            var done = new CheckBox { Content = "Completed", Visibility = editing ? Visibility.Collapsed : Visibility.Visible };
            var draftMembers = ownAssignment is null ? members : members.Where(member => MemberId(member) == ownAssignment).ToArray();
            var selected = AssignmentPicker(canAssignSubtasks && !editing ? draftMembers : [], [], true);
            var fields = Ui.Stack(text, Ui.Wrap(dueDate, done));
            if (canAssignSubtasks && !editing && draftMembers.Length > 0)
                fields.Children.Add(new Expander { Header = "Subtask assignees", Content = selected.Panel });
            var draft = (text, dueDate, done, selected.Selected);
            var remove = Ui.Button("Remove", () =>
            {
                draftSubtasks.Remove(draft);
                if (fields.Parent is Border container && container.Parent is Panel parent) parent.Children.Remove(container);
                return Task.CompletedTask;
            });
            fields.Children.Add(remove);
            draftSubtasks.Add(draft);
            list.Children.Add(Ui.Card(fields));
            if (name.Length == 0) text.Focus(FocusState.Programmatic);
        }
    }

    private FrameworkElement SubtaskRow(JsonElement item, string taskId, bool writable, bool canAssign, JsonElement[] members,
        ProgressBar progress, TextBlock progressLabel, string? ownAssignment)
    {
        var path = $"/api/subtasks/{Ui.PathId(item.Id())}";
        var current = item.Text("title");
        var completed = item.Flag("isCompleted");
        var check = new CheckBox { IsChecked = completed, IsEnabled = writable, MinWidth = 28 };
        Ui.Name(check, completed ? "Mark incomplete" : "Mark complete");
        check.Click += (_, _) => Run(async () =>
        {
            var next = check.IsChecked == true;
            check.IsEnabled = false;
            try
            {
                await EditSubtask(new { isCompleted = next });
                if (next != completed) progress.Value += next ? 1 : -1;
                progressLabel.Text = $"{progress.Value}/{progress.Maximum} complete";
                completed = next;
                Ui.Name(check, completed ? "Mark incomplete" : "Mark complete");
            }
            catch { check.IsChecked = completed; throw; }
            finally { check.IsEnabled = writable; }
        });
        var label = Ui.Input("", current);
        label.IsReadOnly = !writable;
        async Task Rename()
        {
            var value = label.Text.Trim();
            if (!writable || value.Length == 0 || value == current) return;
            await EditSubtask(new { title = value });
            current = value;
        }
        label.KeyDown += (_, args) =>
        {
            if (args.Key == VirtualKey.Enter) { args.Handled = true; Run(Rename); }
            if (args.Key == VirtualKey.Escape) { args.Handled = true; label.Text = current; }
        };
        var line = new Grid { ColumnSpacing = 7 };
        line.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        line.ColumnDefinitions.Add(new ColumnDefinition());
        line.Children.Add(check);
        var apply = ActionButton("✓", Rename);
        Ui.Name(apply, "Save subtask title");
        FrameworkElement titleRow = writable ? Ui.InlineAction(label, apply) : label;
        Grid.SetColumn(titleRow, 1);
        line.Children.Add(titleRow);
        var date = Ui.Date("Subtask date", item.Text("dueDate"));
        date.IsEnabled = writable;
        var oldDate = date.Date;
        bool restoring = false;
        date.DateChanged += (_, _) =>
        {
            if (restoring || !writable) return;
            Run(async () =>
            {
                date.IsEnabled = false;
                try { await EditSubtask(new { dueDate = date.DateValue() }); oldDate = date.Date; }
                catch { restoring = true; date.Date = oldDate; restoring = false; throw; }
                finally { date.IsEnabled = writable; }
            });
        };
        var content = Ui.Stack(line, date);
        if (members.Length > 0)
        {
            var initial = AssignmentIds(item);
            var picked = AssignmentPicker(members, initial, canAssign, ownAssignment);
            var assignments = Ui.Stack(picked.Panel);
            if (canAssign) assignments.Children.Add(ActionButton("Save subtask assignment", async () =>
            {
                await SaveAssignments("subtasks", item.Id(), initial, picked.Selected());
                initial = picked.Selected();
                Toast("Subtask assignment saved.");
            }));
            content.Children.Add(new Expander { Header = "Subtask assignees", Content = assignments });
        }
        var row = Ui.Card(content);
        if (writable) content.Children.Add(ActionButton("Remove", async () =>
        {
            await WriteWorkspace(HttpMethod.Delete, path, null, item, "Delete " + current, parentTask: taskId);
            if (row.Parent is Panel parent) parent.Children.Remove(row);
            if (completed) progress.Value--;
            progress.Maximum = Math.Max(1, progress.Maximum - 1);
            progressLabel.Text = $"{progress.Value}/{progress.Maximum} complete";
        }));
        return row;

        async Task EditSubtask(object fields)
        {
            var change = await WriteWorkspace(HttpMethod.Patch, path, fields, item, current, parentTask: taskId);
            if (change.Queued) Toast("Subtask saved on this PC.");
            item = WithPendingFields(change.Data.ValueKind == JsonValueKind.Object ? change.Data : item, path);
        }
    }

    private static string[] AssignmentIds(JsonElement task)
        => task.Items("assignees").Concat(task.Items("assignments")).Concat(task.Items("taskAssignments"))
            .Select(entry => entry.Text("userId", entry.Field("user").Text("id", entry.Id())))
            .Append(task.Text("assigneeId")).Where(id => id.Length > 0).Distinct().ToArray();

    private static (StackPanel Panel, Func<string[]> Selected) AssignmentPicker(JsonElement[] members, string[] initial, bool enabled,
        string? onlyEditableId = null)
    {
        var box = Ui.Stack();
        var checks = new List<(CheckBox Check, string Id)>();
        foreach (var member in members)
        {
            var id = MemberId(member);
            if (id.Length == 0) continue;
            var check = new CheckBox { Content = MemberName(member), IsChecked = initial.Contains(id),
                IsEnabled = enabled && (onlyEditableId is null || onlyEditableId == id) };
            box.Children.Add(check);
            checks.Add((check, id));
        }
        var others = initial.Except(checks.Select(item => item.Id)).ToArray();
        return (box, () => checks.Where(item => item.Check.IsChecked == true).Select(item => item.Id).Concat(others).ToArray());
    }

    private async Task SaveAssignments(string group, string id, string[] previous, string[] selected)
    {
        var added = selected.Except(previous).ToArray();
        var idProperty = group == "tasks" ? "taskIds" : "subtaskIds";
        if (added.Length > 0) await api.Post($"/api/{group}/assign", new
        {
            assignments = added.Select(person => new Dictionary<string, object> { ["userId"] = person, [idProperty] = new[] { id } }).ToArray()
        });
        foreach (var person in previous.Except(selected))
            await api.Delete($"/api/{group}/{Ui.PathId(id)}/assignees/{Ui.PathId(person)}");
    }

    private void OpenMention(string id) => Run(() => id == user.Id() ? Go("Profile") : Go("Person", id));

    private FrameworkElement TaskActivity(JsonElement task)
    {
        var activity = task.Items("activities").OrderByDescending(item => item.Text("createdAt"), StringComparer.Ordinal).ToArray();
        var rows = Ui.Stack();
        foreach (var item in activity)
        {
            var author = item.Field("createdBy").Text("fullName");
            var details = string.Join(" · ", new[] { Label(item.Text("type")), author, RelativeTime(item.Text("createdAt")) }
                .Where(value => !string.IsNullOrWhiteSpace(value)));
            rows.Children.Add(Ui.Card(Ui.Stack(Ui.Text(item.Text("content")), Ui.Subtitle(details))));
        }
        if (rows.Children.Count == 0) rows.Children.Add(Ui.Subtitle("No activity yet."));
        return new Expander { Header = "Task activity", Content = rows, HorizontalContentAlignment = HorizontalAlignment.Stretch };
    }

    private async Task Comments(StackPanel panel, string taskId, string role, JsonElement[] participants, CancellationToken cancellation)
    {
        var data = (await api.Get($"/api/task-comments/task/{Ui.PathId(taskId)}", cancellation)).Items().ToArray();
        panel.Children.Clear();
        panel.Children.Add(Ui.Section($"Comments ({data.Length})"));
        foreach (var item in data)
        {
            var author = item.Field("createdBy");
            if (author.Id().Length == 0) author = item.Field("author");
            var path = $"/api/task-comments/{Ui.PathId(item.Id())}";
            var isClosed = item.Text("status").Equals("CLOSED", StringComparison.OrdinalIgnoreCase);
            var authorName = author.Text("fullName", author.Text("name", "Project member"));
            var content = Ui.Stack(Ui.Subtitle($"{authorName} · {(isClosed ? "Closed" : "Open")} · {RelativeTime(item.Text("createdAt"))}"),
                Ui.Mentions(item.Text("content"), participants, OpenMention));
            if (item.Text("replyContent") is { Length: > 0 } reply)
            {
                var replier = item.Field("repliedBy").Text("fullName", "Project admin");
                content.Children.Add(Ui.Card(Ui.Stack(Ui.Subtitle($"{replier} replied"), Ui.Mentions(reply, participants, OpenMention))));
            }
            if (!Demo && !isClosed && role is "OWNER" or "ADMIN")
            {
                var entry = Ui.Input("Reply", item.Text("replyContent"), multiline: true);
                var form = Ui.Stack(Ui.MentionInput(entry, participants));
                form.Visibility = Visibility.Collapsed;
                var replyButton = Ui.Button("Reply", () =>
                {
                    form.Visibility = Visibility.Visible;
                    entry.Focus(FocusState.Programmatic);
                    return Task.CompletedTask;
                });
                form.Children.Add(Ui.Wrap(Ui.Button("Cancel", () =>
                {
                    form.Visibility = Visibility.Collapsed;
                    entry.Text = item.Text("replyContent");
                    replyButton.Focus(FocusState.Programmatic);
                    return Task.CompletedTask;
                }), ActionButton("Send reply", async () =>
                {
                    if (string.IsNullOrWhiteSpace(entry.Text)) return;
                    await api.Patch(path + "/reply", new { replyContent = entry.Text.Trim() });
                    await Comments(panel, taskId, role, participants, cancellation);
                }, true)));
                content.Children.Add(Ui.Wrap(replyButton, ActionButton("Close comment", async () =>
                {
                    await api.Patch(path + "/close", new { });
                    await Comments(panel, taskId, role, participants, cancellation);
                })));
                content.Children.Add(form);
            }
            panel.Children.Add(Ui.Card(content));
        }
        if (role == "VIEWER") return;
        var comment = Ui.Input("", multiline: true, placeholder: "Write a comment…");
        panel.Children.Add(Ui.MentionInput(comment, participants));
        panel.Children.Add(ActionButton("Comment", async () =>
        {
            if (string.IsNullOrWhiteSpace(comment.Text)) return;
            await api.Post("/api/task-comments", new { taskId, content = comment.Text.Trim() });
            await Comments(panel, taskId, role, participants, cancellation);
        }, true));
    }
}
