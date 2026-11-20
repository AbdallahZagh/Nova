using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using NovaTaskflow.Api;

namespace NovaTaskflow.Live;

internal sealed class NotesChannel
{
    private const string DefaultUrl = "https://tpgfsixtwhyrrfaxyjil.supabase.co";
    private const string DefaultPublishableKey = "sb_publishable_2AxdIS3zTJykWsJFMvxjQQ_ezC1znaL";

    private readonly Uri endpoint;
    private readonly string topic;
    private readonly Action<JsonElement> changed;
    private readonly Action reconnected;
    private readonly BoardPresence? presence;
    private readonly TableWatch[] tables;
    private readonly Action<IReadOnlyCollection<BoardPresence>>? peersChanged;
    private readonly Action<BoardPresence>? cursorChanged;
    private readonly SemaphoreSlim outgoing = new(1);
    private ActiveSession? active;
    private int nextReference;

    internal NotesChannel(string userId, Action<JsonElement> changed, Action reconnected)
        : this("notes:" + userId, changed, reconnected, null, null, null, []) { }

    internal static NotesChannel Whiteboard(string boardId, BoardPresence self, Action invalidated,
        Action<IReadOnlyCollection<BoardPresence>> peersChanged, Action<BoardPresence> cursorChanged)
        => new("whiteboard:" + boardId, _ => invalidated(), invalidated, self, peersChanged, cursorChanged, []);

    internal static NotesChannel WorkspaceChanges(string userId, Action<string> invalidated, Action joined)
        => new("desktop-workspace:" + userId, payload => invalidated(payload.Field("data").Text("table")), joined,
            null, null, null, [new("*", "notification", $"userId=eq.{userId}"), new("*", "system_settings", "id=eq.default")]);

    private NotesChannel(string channel, Action<JsonElement> changed, Action reconnected,
        BoardPresence? presence, Action<IReadOnlyCollection<BoardPresence>>? peersChanged, Action<BoardPresence>? cursorChanged, TableWatch[] tables)
    {
        var url = Environment.GetEnvironmentVariable("NOVA_SUPABASE_URL") ?? DefaultUrl;
        var key = Environment.GetEnvironmentVariable("NOVA_SUPABASE_PUBLISHABLE_KEY") ?? DefaultPublishableKey;
        var origin = new Uri(url);
        if (origin.Scheme != "https") throw new ArgumentException("Supabase requires an HTTPS origin.");
        endpoint = new UriBuilder(origin) { Scheme = "wss", Path = "/realtime/v1/websocket",
            Query = "apikey=" + Uri.EscapeDataString(key) + "&vsn=1.0.0", Port = origin.Port }.Uri;
        topic = "realtime:" + channel;
        this.changed = changed;
        this.reconnected = reconnected;
        this.presence = presence;
        this.tables = tables;
        this.peersChanged = peersChanged;
        this.cursorChanged = cursorChanged;
    }

    internal async Task Listen(CancellationToken cancellation)
    {
        var wait = TimeSpan.FromSeconds(2);
        while (!cancellation.IsCancellationRequested)
        {
            try
            {
                using var session = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
                using var socket = new ClientWebSocket();
                await socket.ConnectAsync(endpoint, session.Token).ConfigureAwait(false);
                await Send(socket, topic, "phx_join", new { config = new {
                    broadcast = new { ack = false, self = false }, @private = false,
                    postgres_changes = tables.Select(table => new { @event = table.Event, schema = "public", table = table.Table, filter = table.Filter }).ToArray(),
                    presence = new { key = presence is null ? "" : $"{presence.UserId}:desktop", enabled = presence is not null }
                } }, "1", session.Token).ConfigureAwait(false);
                var heartbeat = Heartbeat(socket, session.Token);
                var receive = Receive(socket, session.Token);
                await Task.WhenAny(receive, heartbeat).ConfigureAwait(false);
                Volatile.Write(ref active, null);
                await session.CancelAsync().ConfigureAwait(false);
                socket.Abort();
                try { await Task.WhenAll(receive, heartbeat).ConfigureAwait(false); }
                catch (OperationCanceledException) { }
                wait = TimeSpan.FromSeconds(2);
            }
            catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { return; }
            catch (Exception error) when (error is WebSocketException or IOException or JsonException or InvalidOperationException) { }
            finally { Volatile.Write(ref active, null); }
            if (presence is not null) peersChanged?.Invoke([]);
            try { await Task.Delay(wait, cancellation).ConfigureAwait(false); }
            catch (OperationCanceledException) { return; }
            wait = TimeSpan.FromSeconds(Math.Min(30, wait.TotalSeconds * 2));
        }
    }

    internal async Task Broadcast(string action, object payload, CancellationToken cancellation)
    {
        var session = Volatile.Read(ref active);
        if (presence is null || session is null) return;
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(session.Cancellation, cancellation);
        // Drawing is already saved through the REST API. Realtime delivery is best effort.
        linked.CancelAfter(TimeSpan.FromSeconds(3));
        try
        {
            await outgoing.WaitAsync(linked.Token).ConfigureAwait(false);
            try
            {
                if (session.Socket.State == WebSocketState.Open)
                    await Send(session.Socket, topic, "broadcast", new { type = "broadcast", @event = action, payload },
                        $"board-{Interlocked.Increment(ref nextReference)}", linked.Token).ConfigureAwait(false);
            }
            finally { outgoing.Release(); }
        }
        catch (Exception error) when (error is WebSocketException or OperationCanceledException or InvalidOperationException) { }
    }

    private static async Task Send(ClientWebSocket socket, string topic, string action, object payload, string reference,
        CancellationToken cancellation)
    {
        var request = JsonSerializer.SerializeToUtf8Bytes(new { topic, @event = action, payload, @ref = reference,
            join_ref = action == "heartbeat" ? null : "1" });
        await socket.SendAsync(request.AsMemory(), WebSocketMessageType.Text, true, cancellation).ConfigureAwait(false);
    }

    private async Task Heartbeat(ClientWebSocket socket, CancellationToken cancellation)
    {
        var id = 1;
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(25));
        while (await timer.WaitForNextTickAsync(cancellation).ConfigureAwait(false))
        {
            await outgoing.WaitAsync(cancellation).ConfigureAwait(false);
            try { await Send(socket, "phoenix", "heartbeat", new { }, (++id).ToString(), cancellation).ConfigureAwait(false); }
            finally { outgoing.Release(); }
        }
    }

    private async Task Receive(ClientWebSocket socket, CancellationToken cancellation)
    {
        var buffer = new byte[8192];
        using var message = new MemoryStream();
        var peers = new Dictionary<string, BoardPresence>();
        while (socket.State == WebSocketState.Open)
        {
            var part = await socket.ReceiveAsync(buffer.AsMemory(), cancellation).ConfigureAwait(false);
            if (part.MessageType == WebSocketMessageType.Close) return;
            if (part.MessageType != WebSocketMessageType.Text) continue;
            await message.WriteAsync(buffer.AsMemory(0, part.Count), cancellation).ConfigureAwait(false);
            if (message.Length > 1_048_576) throw new IOException("Realtime message was too large.");
            if (!part.EndOfMessage) continue;
            using var parsed = JsonDocument.Parse(message.GetBuffer().AsMemory(0, (int)message.Length));
            message.SetLength(0);
            var entry = parsed.RootElement;
            if (entry.Text("topic") != topic) continue;
            var payload = entry.Field("payload");
            switch (entry.Text("event"))
            {
                case "phx_reply" when entry.Text("ref") == "1":
                    if (payload.Text("status") != "ok") throw new IOException("Notes channel join was rejected.");
                    if (tables.Length > 0 && payload.Field("response").Items("postgres_changes").Count() != tables.Length)
                        throw new IOException("Nova’s realtime filters were not accepted.");
                    reconnected();
                    if (presence is not null)
                    {
                        Volatile.Write(ref active, new ActiveSession(socket, cancellation));
                        await outgoing.WaitAsync(cancellation).ConfigureAwait(false);
                        try
                        {
                            await Send(socket, topic, "presence", new
                            {
                                type = "presence", @event = "track",
                                payload = new { userId = presence.UserId, name = presence.Name, color = presence.Color, platform = "desktop" }
                            }, "presence-track", cancellation).ConfigureAwait(false);
                        }
                        finally { outgoing.Release(); }
                    }
                    break;
                case "postgres_changes" when tables.Length > 0:
                    if (tables.Any(table => table.Table == payload.Field("data").Text("table"))) changed(payload.Clone());
                    break;
                case "broadcast" when payload.Text("event") == "note":
                    changed(payload.Field("payload").Clone());
                    break;
                case "broadcast" when presence is not null && payload.Text("event") is "stroke:add" or "stroke:remove" or "history:undo" or "history:redo" or "page:add" or "page:remove":
                    changed(payload.Field("payload").Clone());
                    break;
                case "broadcast" when presence is not null && payload.Text("event") == "cursor":
                    var cursor = payload.Field("payload");
                    var key = cursor.Text("userId") + ":" + cursor.Text("platform", "web");
                    var peer = peers.Values.FirstOrDefault(item => item.Key == key);
                    if (peer is not null)
                        cursorChanged?.Invoke(peer with { X = Coordinate(cursor, "x"), Y = Coordinate(cursor, "y") });
                    break;
                case "presence_state" when presence is not null:
                    peers.Clear();
                    AddPeers(payload);
                    break;
                case "presence_diff" when presence is not null:
                    var leaves = payload.Field("leaves");
                    if (leaves.ValueKind == JsonValueKind.Object)
                        foreach (var leave in leaves.EnumerateObject()) peers.Remove(leave.Name);
                    AddPeers(payload.Field("joins"));
                    break;
                case "phx_error":
                case "phx_close": return;
            }
        }

        void AddPeers(JsonElement joined)
        {
            if (joined.ValueKind == JsonValueKind.Object)
                foreach (var peer in joined.EnumerateObject())
                {
                    var item = peer.Value.Items("metas").FirstOrDefault();
                    var id = item.Text("userId");
                    if (id.Length == 0 || peer.Name == $"{presence?.UserId}:desktop") continue;
                    peers[peer.Name] = new BoardPresence(id, item.Text("name", "Collaborator"), item.Text("color", "#E66A17"),
                        item.Text("platform", "web"));
                }
            peersChanged?.Invoke(peers.Values.ToArray());
        }
    }

    private static double? Coordinate(JsonElement payload, string name)
    {
        var field = payload.Field(name);
        return field.ValueKind == JsonValueKind.Number && field.TryGetDouble(out var value) && double.IsFinite(value) ? value : null;
    }

    private sealed record TableWatch(string Event, string Table, string Filter);
    private sealed record ActiveSession(ClientWebSocket Socket, CancellationToken Cancellation);
}

internal sealed record BoardPresence(string UserId, string Name, string Color, string Platform = "desktop", double? X = null, double? Y = null)
{
    internal string Key => UserId + ":" + Platform;
}
