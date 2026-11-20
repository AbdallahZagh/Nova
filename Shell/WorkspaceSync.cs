using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using NovaTaskflow.Api;
using NovaTaskflow.Controls;
using NovaTaskflow.ViewModels;
using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow
{
    private const string UnknownCreate = "The connection ended before Nova confirmed this create. Check the workspace for an existing copy before retrying.";
    private WorkspaceOutbox? outbox;
    private List<PendingChange> pendingChanges = [];
    private readonly SemaphoreSlim replayGate = new(1);
    private string? outboxError;

    private void LoadOutbox()
    {
        outbox = new WorkspaceOutbox(Path.Combine(DesktopSettings.AppFolder, "workspace-outbox"), api.Endpoint, user.Id());
        pendingChanges = [];
        outboxError = null;
        try { pendingChanges = outbox.Read(); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Security.Cryptography.CryptographicException or JsonException)
        { outboxError = "Windows could not read the saved workspace changes. The file was kept on this PC."; }
        UpdateSyncBanner();
    }

    private void UpdateSyncBanner()
    {
        var review = pendingChanges.Count(item => item.Review is not null);
        SyncBanner.IsOpen = outboxError is not null || pendingChanges.Count > 0;
        SyncBanner.Severity = review > 0 || outboxError is not null ? InfoBarSeverity.Warning : InfoBarSeverity.Informational;
        SyncBanner.Title = outboxError ?? (review > 0
            ? $"{review} workspace {(review == 1 ? "change needs" : "changes need")} review"
            : $"{pendingChanges.Count} workspace {(pendingChanges.Count == 1 ? "change" : "changes")} waiting to sync");
    }

    private void SaveOutbox(List<PendingChange> updated)
    {
        if (outbox is null || outboxError is not null) throw new IOException(outboxError ?? "Sign in to save this change.");
        outbox.Write(updated);
        pendingChanges = updated;
        UpdateSyncBanner();
    }

    private void ReplaceChange(Guid id, PendingChange? replacement)
    {
        var updated = new List<PendingChange>(pendingChanges);
        var index = updated.FindIndex(item => item.Id == id);
        if (index < 0) return;
        if (replacement is null) updated.RemoveAt(index);
        else updated[index] = replacement;
        SaveOutbox(updated);
    }

    private async Task<(JsonElement Data, bool Queued)> WriteWorkspace(HttpMethod method, string path, object? fields,
        JsonElement original, string label, string[]? assignees = null, string? parentTask = null, InitialSubtask[]? setup = null, InitialProjectMember[]? projectTeam = null)
    {
        var scope = outbox;
        await replayGate.WaitAsync();
        try
        {
            if (scope is null || !ReferenceEquals(scope, outbox)) throw new OperationCanceledException();
            return await WriteWorkspaceCore(method, path, fields, original, label, assignees, parentTask, setup, projectTeam);
        }
        finally { replayGate.Release(); }
    }

    private async Task<(JsonElement Data, bool Queued)> WriteWorkspaceCore(HttpMethod method, string path, object? fields,
        JsonElement original, string label, string[]? assignees, string? parentTask, InitialSubtask[]? setup, InitialProjectMember[]? projectTeam)
    {
        if (outboxError is not null)
        {
            if (api.IsOffline || assignees is { Length: > 0 } || setup is { Length: > 0 } || projectTeam is { Length: > 0 })
                throw new IOException(outboxError);
            return (await api.Send(method, path, fields), false);
        }
        var currentOutbox = outbox;
        var proposal = JsonSerializer.SerializeToElement(fields);
        var baseline = new Dictionary<string, JsonElement>();
        if (original.ValueKind == JsonValueKind.Object)
        {
            var keys = method == HttpMethod.Delete
                ? new[] { "updatedAt", "title", "name", "service" }
                : proposal.EnumerateObject().Select(field => field.Name);
            foreach (var key in keys)
                if (original.TryGetProperty(key, out var value)) baseline[key] = value;
        }
        var change = new PendingChange(Guid.NewGuid(), method.Method, path, label, proposal, baseline, assignees ?? [], ParentTask: parentTask, Setup: setup, ProjectTeam: projectTeam);
        if (method == HttpMethod.Patch && proposal.ValueKind == JsonValueKind.Object)
        {
            var modified = proposal.EnumerateObject().Where(field => !baseline.TryGetValue(field.Name, out var before) ||
                !SameField(field.Name, before, field.Value)).ToDictionary(field => field.Name, field => field.Value);
            if (modified.Count == 0) return (original, false);
            change = change with
            {
                Fields = JsonSerializer.SerializeToElement(modified),
                Base = baseline.Where(field => modified.ContainsKey(field.Key)).ToDictionary()
            };
        }
        var preceding = method != HttpMethod.Post && pendingChanges.Any(item => item.Path == path);
        if (!api.IsOffline && !preceding && method != HttpMethod.Post)
        {
            try
            {
                var result = await api.Send(method, path, change.Fields.ValueKind == JsonValueKind.Null ? null : change.Fields);
                return (result, false);
            }
            catch (IOException) when (ReferenceEquals(outbox, currentOutbox)) { }
        }
        if (!ReferenceEquals(outbox, currentOutbox)) throw new OperationCanceledException();
        // Record creates before sending. If the process stops mid-request, the same POST needs review.
        SaveOutbox([..pendingChanges, change]);
        if (api.IsOffline || preceding)
        {
            return (original, true);
        }
        try
        {
            var result = await ReplayChange(change, CancellationToken.None);
            return (result, pendingChanges.Any(item => item.Id == change.Id));
        }
        catch (IOException) { return (original, true); }
        catch (ApiFailure error) when (error.Status is HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests ||
            (int)error.Status >= 500)
        { return (original, true); }
        catch (ApiFailure error)
        {
            if (!ReferenceEquals(outbox, currentOutbox)) throw new OperationCanceledException();
            var latest = pendingChanges.FirstOrDefault(item => item.Id == change.Id);
            if (latest is { SavedId: not null })
            {
                ReplaceChange(change.Id, latest with { Review = error.Message });
                return (original, true);
            }
            if (latest is not null) ReplaceChange(change.Id, null);
            throw;
        }
    }

    private static bool SameField(string key, JsonElement left, JsonElement right)
    {
        if (key is "dueDate" or "trialEndsAt" or "nextChargeAt" && DateTimeOffset.TryParse(left.ToString(), out var first) &&
            DateTimeOffset.TryParse(right.ToString(), out var second)) return first.UtcDateTime.Date == second.UtcDateTime.Date;
        return JsonNode.DeepEquals(JsonNode.Parse(left.GetRawText()), JsonNode.Parse(right.GetRawText()));
    }

    private bool IsPendingDeletion(string path) =>
        pendingChanges.Any(item => item.Path == path && item.Method == "DELETE" && item.Review is null);

    private JsonElement WithPendingFields(JsonElement row, string path)
    {
        if (row.ValueKind != JsonValueKind.Object) return row;
        var changes = pendingChanges.Where(item => item.Path == path && item.Method == "PATCH" && item.Review is null).ToArray();
        if (changes.Length == 0) return row;
        var fields = row.EnumerateObject().ToDictionary(field => field.Name, field => field.Value);
        foreach (var item in changes)
            foreach (var field in item.Fields.EnumerateObject()) fields[field.Name] = field.Value;
        return JsonSerializer.SerializeToElement(fields);
    }

    private async Task<JsonElement> ReplayChange(PendingChange item, CancellationToken cancellation)
    {
        var store = outbox;
        JsonElement saved = default;
        if (item.Method == "POST" && item.SavedId is null)
        {
            cancellation.ThrowIfCancellationRequested();
            ReplaceChange(item.Id, item with { Review = UnknownCreate });
            try { saved = await api.Post(item.Path, item.Fields, cancellation); }
            catch (ApiFailure error) when (error.Status == HttpStatusCode.TooManyRequests)
            {
                if (ReferenceEquals(store, outbox)) ReplaceChange(item.Id, item);
                throw;
            }
            cancellation.ThrowIfCancellationRequested();
            if (!ReferenceEquals(store, outbox)) throw new OperationCanceledException();
            if (item.Assignees.Length == 0 && item.Setup is not { Length: > 0 } && item.ProjectTeam is not { Length: > 0 })
            {
                ReplaceChange(item.Id, null);
                return saved;
            }
            if (saved.Id().Length == 0) return saved;
            item = item with { SavedId = saved.Id(), Review = null };
            ReplaceChange(item.Id, item);
        }
        if (item.Method == "POST")
        {
            if (item.ProjectTeam is { Length: > 0 } team)
            {
                var projectPath = ProjectResource(item.SavedId!);
                var project = await api.GetFresh(projectPath, cancellation);
                var existing = Members(project).Select(MemberId).ToHashSet(StringComparer.Ordinal);
                foreach (var member in team.Where(member => !existing.Contains(member.UserId)))
                {
                    cancellation.ThrowIfCancellationRequested();
                    if (!ReferenceEquals(store, outbox)) throw new OperationCanceledException();
                    try { await api.Post(projectPath + "/members", new { userId = member.UserId, role = member.Role }, cancellation); }
                    catch (Exception error) when (error is ApiFailure or IOException)
                    {
                        // The server commits the membership before sending invite email.
                        var latest = await api.GetFresh(projectPath, cancellation);
                        if (!Members(latest).Any(row => MemberId(row) == member.UserId)) throw;
                        Toast("Membership is saved. " + error.Message, InfoBarSeverity.Warning);
                    }
                }
                saved = await api.GetFresh(projectPath, cancellation);
            }
            else
            {
                var assigned = await api.GetFresh(TaskResource(item.SavedId!), cancellation);
                cancellation.ThrowIfCancellationRequested();
                if (!ReferenceEquals(store, outbox)) throw new OperationCanceledException();
                await ApplyCreateAssignments("tasks", assigned, item.Assignees, cancellation);
                await ApplyInitialSubtasks(assigned.Items("subtasks"), item.Setup ?? [], cancellation);
                saved = saved.ValueKind == JsonValueKind.Undefined ? assigned : saved;
            }
        }
        else
        {
            JsonElement current;
            try
            {
                current = await api.GetFresh(item.ParentTask is null ? item.Path : "/api/tasks/" + Ui.PathId(item.ParentTask), cancellation);
                if (item.ParentTask is not null)
                {
                    var subtask = item.Path[(item.Path.LastIndexOf('/') + 1)..];
                    current = current.Items("subtasks").FirstOrDefault(row => row.Id() == subtask);
                    if (current.ValueKind == JsonValueKind.Undefined)
                        throw new ApiFailure(HttpStatusCode.NotFound, "This subtask was removed.");
                }
            }
            catch (ApiFailure error) when (error.Status == HttpStatusCode.NotFound && item.Method == "DELETE")
            {
                if (ReferenceEquals(store, outbox)) ReplaceChange(item.Id, null);
                return default;
            }
            cancellation.ThrowIfCancellationRequested();
            if (!ReferenceEquals(store, outbox)) throw new OperationCanceledException();
            var remaining = item.Method == "PATCH" ? item.Fields.EnumerateObject().Where(field =>
                current.Field(field.Name).ValueKind == JsonValueKind.Undefined || !SameField(field.Name, current.Field(field.Name), field.Value))
                .ToDictionary(field => field.Name, field => field.Value) : null;
            var mergeTask = item.Method == "PATCH" && item.Path.StartsWith("/api/tasks/", StringComparison.Ordinal);
            var conflict = !mergeTask && item.Base.Any(field => (remaining is null || remaining.ContainsKey(field.Key)) &&
                current.Field(field.Key).ValueKind != JsonValueKind.Undefined && !SameField(field.Key, field.Value, current.Field(field.Key)));
            if (conflict)
            {
                ReplaceChange(item.Id, item with { Review = "This item changed on another device. Open the latest copy before applying your change." });
                return current;
            }
            if (remaining is { Count: 0 }) saved = current;
            else if (item.Method == "DELETE") saved = await api.Delete(item.Path, cancellation);
            else
            {
                var edit = remaining!.ToDictionary(field => field.Key, field => (object?)field.Value);
                if (mergeTask && item.Base.Count > 0)
                    edit["base"] = item.Base;
                saved = await api.Patch(item.Path, edit, cancellation);
                var conflicts = saved.Items("conflicts").Select(field => field.Text("field")).ToHashSet(StringComparer.Ordinal);
                if (conflicts.Count > 0)
                {
                    if (ReferenceEquals(store, outbox))
                        ReplaceChange(item.Id, item with
                        {
                            Fields = JsonSerializer.SerializeToElement(remaining!.Where(field => conflicts.Contains(field.Key))
                                .ToDictionary()),
                            Review = "A teammate edited one or more of the same fields. Other changes were saved."
                        });
                    return saved;
                }
            }
        }
        cancellation.ThrowIfCancellationRequested();
        if (!ReferenceEquals(store, outbox)) throw new OperationCanceledException();
        ReplaceChange(item.Id, null);
        return saved;
    }

    private async Task ApplyInitialSubtasks(IEnumerable<JsonElement> saved, InitialSubtask[] setup, CancellationToken cancellation)
    {
        var subtasks = saved.ToList();
        foreach (var initial in setup)
        {
            var expectedDate = JsonSerializer.SerializeToElement(initial.DueDate);
            bool Matches(JsonElement row) => row.Text("title") == initial.Title &&
                (initial.DueDate is null ? row.Text("dueDate").Length == 0 : row.Text("dueDate").Length > 0 &&
                    SameField("dueDate", row.Field("dueDate"), expectedDate));
            // A retry can see rows already completed by a previous attempt. Count those first.
            var index = initial.Done ? subtasks.FindIndex(row => Matches(row) && row.Flag("isCompleted")) : -1;
            if (index < 0) index = subtasks.FindIndex(Matches);
            if (index < 0) throw new ApiFailure(HttpStatusCode.Conflict, $"Couldn’t match the new subtask “{initial.Title}”. Review it on the saved task.");
            var row = subtasks[index];
            subtasks.RemoveAt(index);
            if (initial.Done && !row.Flag("isCompleted"))
                await api.Patch("/api/subtasks/" + Ui.PathId(row.Id()), new { isCompleted = true }, cancellation);
            await ApplyCreateAssignments("subtasks", row, initial.Assignees, cancellation);
        }
    }

    private async Task ApplyCreateAssignments(string group, JsonElement resource, string[] requested, CancellationToken cancellation)
    {
        var missing = requested.Except(AssignmentIds(resource)).ToArray();
        if (missing.Length == 0) return;
        var key = group == "tasks" ? "taskIds" : "subtaskIds";
        await api.Post($"/api/{group}/assign", new
        {
            assignments = missing.Select(person => new Dictionary<string, object>
                { ["userId"] = person, [key] = new[] { resource.Id() } }).ToArray()
        }, cancellation);
    }

    private async Task SyncOutbox(CancellationToken cancellation)
    {
        if (outboxError is not null || pendingChanges.Count == 0 || !await replayGate.WaitAsync(0, cancellation)) return;
        var store = outbox;
        try
        {
            var blocked = new HashSet<string>(StringComparer.Ordinal);
            foreach (var item in pendingChanges.ToArray())
            {
                cancellation.ThrowIfCancellationRequested();
                if (!ReferenceEquals(outbox, store)) return;
                if (item.Method != "POST" && blocked.Contains(item.Path)) continue;
                if (item.Review is not null) { blocked.Add(item.Path); continue; }
                if (!pendingChanges.Any(change => change.Id == item.Id)) continue;
                try
                {
                    await ReplayChange(item, cancellation);
                    if (pendingChanges.Any(change => change.Id == item.Id)) blocked.Add(item.Path);
                }
                catch (IOException) { break; }
                catch (ApiFailure error) when (error.Status == HttpStatusCode.Unauthorized) { break; }
                catch (ApiFailure error) when (error.Status is HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests ||
                    (int)error.Status >= 500) { break; }
                catch (ApiFailure error)
                {
                    if (!ReferenceEquals(outbox, store)) return;
                    var latest = pendingChanges.FirstOrDefault(change => change.Id == item.Id);
                    if (latest is not null) ReplaceChange(item.Id, latest with { Review = error.Message });
                    blocked.Add(item.Path);
                }
            }
        }
        finally { replayGate.Release(); }
    }

    private void OpenOutbox(object sender, RoutedEventArgs args) => ShowOutbox();

    private void ShowOutbox()
    {
        var scope = outbox;
        var body = Ui.Stack();
        if (outboxError is not null) body.Children.Add(Ui.Subtitle(outboxError));
        else if (pendingChanges.Count == 0) body.Children.Add(Ui.Subtitle("All workspace changes are synced."));
        else body.Children.Add(ActionButton("Sync now", async () =>
        {
            await SyncOutbox(background?.Token ?? CancellationToken.None);
            ShowOutbox();
        }, true));
        foreach (var item in pendingChanges)
        {
            var details = Ui.Stack(Ui.Section(item.Label), Ui.Subtitle(item.Review ?? "Waiting to sync"));
            var actions = Ui.Wrap();
            if (item.Review is not null && item.Fields.ValueKind == JsonValueKind.Object)
            {
                var changed = item.Fields.EnumerateObject()
                    .Where(field => field.Name is "title" or "name" or "description" or "status" or "priority" or "dueDate")
                    .Select(field => field.Name == "dueDate" ? "due date" : field.Name).ToArray();
                if (changed.Length > 0) details.Children.Add(Ui.Subtitle("Saved fields · " + string.Join(", ", changed)));
            }
            var editId = item.SavedId ?? (item.Method != "POST" ? item.Path[(item.Path.LastIndexOf('/') + 1)..] : null);
            if (editId is not null && item.Review is not null)
            {
                if (item.Path.StartsWith("/api/tasks", StringComparison.Ordinal)) actions.Children.Add(Ui.Button("Open task", () => TaskDrawer(editId)));
                if (item.Path.StartsWith("/api/projects", StringComparison.Ordinal)) actions.Children.Add(Ui.Button("Open project", () => Go("Project", editId, true)));
            }
            if (item.Review is not null)
            {
                actions.Children.Add(ActionButton(item.Method == "POST" ? "Retry" : "Apply my change", async () =>
                {
                    if (!await Confirm("Apply this change?", item.Review, "Continue")) return;
                    await replayGate.WaitAsync();
                    try
                    {
                        if (!ReferenceEquals(outbox, scope)) return;
                        var latest = pendingChanges.FirstOrDefault(change => change.Id == item.Id);
                        if (latest is not { Review: not null }) return;
                        ReplaceChange(item.Id, latest with { Base = [], Review = null });
                    }
                    finally { replayGate.Release(); }
                    await SyncOutbox(background?.Token ?? CancellationToken.None);
                    ShowOutbox();
                }));
            }
            actions.Children.Add(ActionButton("Discard", async () =>
            {
                if (!await Confirm("Discard saved change?", item.Label, "Discard")) return;
                await replayGate.WaitAsync();
                try
                {
                    if (!ReferenceEquals(outbox, scope)) return;
                    ReplaceChange(item.Id, null);
                }
                finally { replayGate.Release(); }
                ShowOutbox();
            }));
            details.Children.Add(actions);
            body.Children.Add(Ui.Card(details));
        }
        Drawer("Workspace sync", body);
    }
}
