using CommunityToolkit.Mvvm.ComponentModel;
using NovaTaskflow.Api;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace NovaTaskflow.ViewModels;

internal sealed record ChecklistItem(string Id, string Text, bool Done);
internal sealed record NoteProject(string Id, string Name);
internal sealed record NoteDocument(string Id = "", string? Title = null, string Body = "",
    ChecklistItem[]? Checklist = null, string Color = "AMBER", bool Pinned = false, bool Floating = false,
    string? ProjectId = null, NoteProject? Project = null, double? PosX = null, double? PosY = null,
    double? Width = null, double? Height = null, string Preview = "", DateTimeOffset UpdatedAt = default,
    DateTimeOffset CreatedAt = default)
{
    internal string Label => !string.IsNullOrWhiteSpace(Title) ? Title : Preview.Length > 0 ? Preview : "Untitled note";
    internal ChecklistItem[] Checks => Checklist ?? [];
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
    internal static NoteDocument Read(JsonElement source) => source.Deserialize<NoteDocument>(Options)
        ?? throw new InvalidOperationException("Nova returned an invalid note.");

    internal bool Blank => string.IsNullOrWhiteSpace(Title) && string.IsNullOrWhiteSpace(Body) &&
        Checks.All(item => string.IsNullOrWhiteSpace(item.Text));
}

internal sealed class NoteDraft : ObservableObject, IDisposable
{
    private readonly NovaApi api;
    private readonly NoteDraftStore? store;
    private readonly Guid key;
    private readonly SemaphoreSlim serial = new(1);
    private readonly HashSet<string> pending = new(StringComparer.Ordinal);
    private string[] sending = [];
    private CancellationTokenSource? timer;
    private bool retired;
    private string status = "Saves automatically as you write";

    internal NoteDocument Value { get; private set; }
    internal string EditorId => Value.Id.Length > 0 ? Value.Id : $"draft:{key:N}";
    internal bool Dirty => sending.Length > 0 || pending.Count > 0;
    internal bool StoredLocally { get; private set; }
    internal bool NeedsCreateReview { get; private set; }
    internal event Action<NoteDraft>? Saved;
    internal event Action<NoteDraft>? RemoteChanged;
    internal event Action<NoteDraft>? Changed;
    internal string Status { get => status; private set => SetProperty(ref status, value); }

    internal NoteDraft(NovaApi api, NoteDocument note, NoteDraftStore? store, StoredNote? recovered = null)
    {
        this.api = api;
        this.store = store;
        key = recovered?.Key ?? Guid.NewGuid();
        Value = recovered?.Value ?? note;
        if (recovered is not null)
        {
            pending.UnionWith(recovered.Fields);
            NeedsCreateReview = recovered.NeedsCreateReview;
            StoredLocally = true;
            Status = NeedsCreateReview ? ReviewMessage : "Draft recovered · waiting to sync";
        }
        else if (Value.Id.Length > 0) Status = Stamp(Value);
    }

    private const string ReviewMessage = "Saved on this PC · check and sync from the note menu.";

    internal void Set(NoteDocument next, bool immediate, params string[] fields)
    {
        if (retired || next == Value) return;
        Value = next;
        pending.UnionWith(fields);
        Checkpoint();
        Changed?.Invoke(this);
        timer?.Cancel();
        timer?.Dispose();
        timer = new CancellationTokenSource();
        _ = Queue(immediate, timer.Token);
    }

    private async Task Queue(bool immediate, CancellationToken cancellation)
    {
        try
        {
            if (!immediate) await Task.Delay(700, cancellation);
            if (!cancellation.IsCancellationRequested) await Flush();
        }
        catch (OperationCanceledException) { }
        catch (Exception) { }
    }

    internal async Task Flush(bool retryCreate = false)
    {
        await serial.WaitAsync();
        try
        {
            if (retired || pending.Count == 0) return;
            if (NeedsCreateReview && !retryCreate) { Status = ReviewMessage; return; }
            if (Value.Blank)
            {
                Status = Value.Id.Length == 0 ? "Saves automatically as you write" : "Write a title, some text, or a checklist item.";
                return;
            }
            if (api.IsOffline && StoredLocally && !retryCreate)
            {
                Status = "Saved on this PC · waiting to sync";
                return;
            }
            var creating = Value.Id.Length == 0;
            var body = pending.ToDictionary(field => field, Field, StringComparer.Ordinal);
            if (creating)
            {
                if (Value.Floating) body["floating"] = true;
                body.TryAdd("color", Value.Color);
                if (Value.ProjectId is not null) body.TryAdd("projectId", Value.ProjectId);
                Checkpoint();
                if (store is not null && !StoredLocally)
                    throw new IOException(Status);
            }
            sending = pending.ToArray();
            pending.Clear();
            Status = "Saving…";
            try
            {
                var result = creating
                    ? await Create(body)
                    : await api.Patch("/api/notes/" + Uri.EscapeDataString(Value.Id), body);
                if (retired) return;
                var saved = NoteDocument.Read(result);
                if (saved.Id.Length == 0) throw new IOException("Nova did not confirm the note save.");
                Value = Value with { Id = saved.Id, UpdatedAt = saved.UpdatedAt, Preview = saved.Preview,
                    CreatedAt = saved.CreatedAt == default ? Value.CreatedAt : saved.CreatedAt };
                NeedsCreateReview = false;
                sending = [];
                Checkpoint();
                if (StoredLocally || store is null)
                    Status = pending.Count == 0 ? Stamp(saved) : "Saving…";
                Saved?.Invoke(this);
            }
            catch (Exception error)
            {
                if (retired) throw;
                pending.UnionWith(sending);
                sending = [];
                Checkpoint();
                if (NeedsCreateReview)
                {
                    Status = retryCreate ? error.Message : ReviewMessage;
                    if (StoredLocally && !retryCreate) return;
                }
                if (error is IOException && StoredLocally)
                {
                    Status = "Saved on this PC · waiting to sync";
                    return;
                }
                Status = error.Message;
                throw;
            }
            finally { sending = []; }
        }
        finally { serial.Release(); }
    }

    private async Task<JsonElement> Create(Dictionary<string, object?> body)
    {
        var path = $"/api/notes/{key:D}";
        JsonElement existing = default;
        if (NeedsCreateReview)
        {
            var local = Value;
            var current = await api.GetFresh("/api/notes", CancellationToken.None);
            var list = current.ValueKind == JsonValueKind.Array ? current : current.Field("items");
            if (list.ValueKind != JsonValueKind.Array) throw new IOException("Could not verify your notes before retrying.");
            var title = local.Title?.Trim() ?? "";
            var matches = list.EnumerateArray().Where(note =>
                note.Text("projectId") == (local.ProjectId ?? "") &&
                note.Text("title").Trim() == title &&
                (title.Length > 0 || SameBody(note.Text("body"), local.Body))).ToArray();
            if (matches.Length == 1 && SameBody(matches[0].Text("body"), local.Body))
            {
                existing = matches[0];
                path = "/api/notes/" + Uri.EscapeDataString(existing.Id());
            }
            else if (matches.Length > 0)
                throw new InvalidOperationException("A note with the same title exists on Nova. Open it before retrying this draft.");
            NeedsCreateReview = false;
            Checkpoint();
        }

        if (existing.ValueKind == JsonValueKind.Undefined)
        {
            try { existing = await api.Send(HttpMethod.Put, path, body); }
            catch (ApiFailure error) when (error.Status == System.Net.HttpStatusCode.NotFound)
            {
                // Older Nova servers accept POST only. Check for a previous PUT before falling back.
                try { existing = await api.GetFresh(path, CancellationToken.None); }
                catch (ApiFailure absent) when (absent.Status == System.Net.HttpStatusCode.NotFound)
                {
                    NeedsCreateReview = true;
                    Checkpoint();
                    if (store is not null && !StoredLocally) throw new IOException(Status);
                    try { return await api.Post("/api/notes", body); }
                    catch (ApiFailure rejection) when ((int)rejection.Status is >= 400 and < 500 &&
                        rejection.Status != System.Net.HttpStatusCode.RequestTimeout)
                    {
                        NeedsCreateReview = false;
                        throw;
                    }
                }
            }
        }
        if (existing.Id().Length == 0) throw new IOException("Nova did not confirm the note save.");
        Value = Value with { Id = existing.Id() };
        Checkpoint();
        return body.Any(field => existing.TryGetProperty(field.Key, out var value) &&
                !JsonNode.DeepEquals(JsonNode.Parse(value.GetRawText()), JsonSerializer.SerializeToNode(field.Value)))
            ? await api.Patch(path, body)
            : existing;

        static bool SameBody(string left, string right) => left.ReplaceLineEndings("\n").Trim() == right.ReplaceLineEndings("\n").Trim();
    }

    internal void Remote(NoteDocument note)
    {
        if (retired || Dirty || note.UpdatedAt <= Value.UpdatedAt) return;
        Value = note;
        Status = Stamp(note);
        RemoteChanged?.Invoke(this);
        Changed?.Invoke(this);
    }

    internal void Discard()
    {
        store?.Remove(key);
        Dispose();
    }

    private object? Field(string field) => field switch
    {
        "title" => Value.Title, "body" => Value.Body,
        "checklist" => Value.Checks.Where(item => item.Text.Trim().Length > 0)
            .Select(item => new { id = item.Id, text = item.Text, done = item.Done }).ToArray(),
        "color" => Value.Color, "pinned" => Value.Pinned, "floating" => Value.Floating,
        "projectId" => Value.ProjectId, "posX" => Value.PosX, "posY" => Value.PosY,
        "width" => Value.Width, "height" => Value.Height, _ => null
    };

    private void Checkpoint()
    {
        if (store is null) return;
        try
        {
            store.Write(new(key, Value, pending.Concat(sending).Distinct().ToArray(), NeedsCreateReview));
            StoredLocally = true;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Security.Cryptography.CryptographicException)
        {
            StoredLocally = false;
            Status = "Windows could not save a local copy. Keep Nova open until it syncs.";
        }
    }

    private static string Stamp(NoteDocument note) => "Saved · edited " + note.UpdatedAt.ToLocalTime().ToString("g");

    public void Dispose()
    {
        retired = true;
        timer?.Cancel();
        timer?.Dispose();
        pending.Clear();
    }
}
