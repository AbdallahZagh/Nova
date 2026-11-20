using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Windows.Security.Cryptography;
using Windows.Security.Cryptography.DataProtection;

namespace NovaTaskflow.Api;

internal sealed class ApiFailure(HttpStatusCode status, string message) : Exception(message)
{
    public HttpStatusCode Status { get; } = status;
}

internal sealed class NovaApi
{
    private readonly HttpClient client = new() { Timeout = TimeSpan.FromSeconds(30) };
    private readonly string cacheDirectory;
    private string? token;
    private string? account;
    private int session;
    private bool offline;
    private Uri server;

    public NovaApi(string endpoint, string cacheDirectory)
    {
        server = new Uri(endpoint.TrimEnd('/') + "/");
        this.cacheDirectory = cacheDirectory;
    }

    public event Action<int>? Unauthorized;
    public event Action<bool>? OfflineChanged;
    public string Endpoint => server.AbsoluteUri.TrimEnd('/');
    public bool IsOffline => Volatile.Read(ref offline);
    internal bool IsCurrentSession(int generation) => generation == Volatile.Read(ref session);

    public void SetSession(string? accessToken, string? accountId, string? endpoint = null)
    {
        Interlocked.Increment(ref session);
        if (endpoint is not null) server = new Uri(endpoint.TrimEnd('/') + "/");
        token = accessToken;
        account = accountId;
        SetOffline(false);
    }

    public Task<JsonElement> Get(string path, CancellationToken cancellation = default)
        => Send(HttpMethod.Get, path, cancellation: cancellation);

    public Task<JsonElement> Post(string path, object? body = null, CancellationToken cancellation = default)
        => Send(HttpMethod.Post, path, body, cancellation: cancellation);

    public Task<JsonElement> Patch(string path, object body, CancellationToken cancellation = default)
        => Send(HttpMethod.Patch, path, body, cancellation: cancellation);

    public Task<JsonElement> Delete(string path, CancellationToken cancellation = default)
        => Send(HttpMethod.Delete, path, cancellation: cancellation);

    internal Task<JsonElement> GetFresh(string path, CancellationToken cancellation)
        => Send(HttpMethod.Get, path, cancellation: cancellation, allowCached: false);

    internal Task<(JsonElement Data, bool Cached)> GetWithSource(string path, CancellationToken cancellation)
        => SendWithSource(HttpMethod.Get, path, null, false, cancellation, true);

    public async Task<JsonElement> Send(HttpMethod method, string path, object? body = null,
        bool anonymous = false, CancellationToken cancellation = default, bool allowCached = true)
        => (await SendWithSource(method, path, body, anonymous, cancellation, allowCached).ConfigureAwait(false)).Data;

    private async Task<(JsonElement Data, bool Cached)> SendWithSource(HttpMethod method, string path, object? body,
        bool anonymous, CancellationToken cancellation, bool allowCached)
    {
        var generation = Volatile.Read(ref session);
        var currentServer = server;
        var currentToken = token;
        var currentAccount = account;
        var sensitive = path.StartsWith("/api/admin/", StringComparison.Ordinal)
            || path.StartsWith("/api/oauth/", StringComparison.Ordinal)
            || path.StartsWith("/api/whiteboard-invites/", StringComparison.Ordinal);
        var cache = !anonymous && !sensitive && method == HttpMethod.Get && currentAccount is not null
            ? CachePath(currentServer, currentAccount, path) : null;
        try
        {
            using var request = Request(method, currentServer, path, anonymous ? null : currentToken);
            if (body is HttpContent content) request.Content = content;
            else if (body is not null) request.Content = JsonContent.Create(body);
            using var response = await client.SendAsync(request, cancellation).ConfigureAwait(false);
            var raw = await response.Content.ReadAsByteArrayAsync(cancellation).ConfigureAwait(false);
            if (generation != Volatile.Read(ref session))
                throw new OperationCanceledException();
            if (!response.IsSuccessStatusCode)
            {
                if (!anonymous && currentToken is not null && response.StatusCode == HttpStatusCode.Unauthorized)
                    Unauthorized?.Invoke(generation);
                throw new ApiFailure(response.StatusCode, Error(raw, response.ReasonPhrase));
            }
            JsonElement result = default;
            if (raw.Length > 0)
            {
                using var document = JsonDocument.Parse(raw);
                result = document.RootElement.Clone();
                if (cache is not null) await WriteCache(cache, raw).ConfigureAwait(false);
            }
            if (!anonymous) SetOffline(false);
            return (result, false);
        }
        catch (Exception error) when (error is HttpRequestException ||
            (error is OperationCanceledException && !cancellation.IsCancellationRequested &&
             generation == Volatile.Read(ref session)))
        {
            if (generation != Volatile.Read(ref session)) throw new OperationCanceledException();
            if (!anonymous) SetOffline(true);
            if (allowCached && cache is not null)
            {
                var cached = await ReadCache(cache).ConfigureAwait(false);
                if (cached.HasValue) return (cached.Value, true);
            }
            throw new IOException("Nova’s server did not respond. Try again in a moment.", error);
        }
    }

    internal async Task<byte[]> Download(string path, CancellationToken cancellation = default)
    {
        var generation = Volatile.Read(ref session);
        var currentToken = token;
        using var request = Request(HttpMethod.Get, server, path, currentToken);
        using var response = await client.SendAsync(request, cancellation).ConfigureAwait(false);
        var bytes = await response.Content.ReadAsByteArrayAsync(cancellation).ConfigureAwait(false);
        if (!IsCurrentSession(generation)) throw new OperationCanceledException();
        if (currentToken is not null && response.StatusCode == HttpStatusCode.Unauthorized) Unauthorized?.Invoke(generation);
        if (!response.IsSuccessStatusCode) throw new ApiFailure(response.StatusCode, Error(bytes, response.ReasonPhrase));
        return bytes;
    }

    public void ClearCache(string endpoint, string accountId)
    {
        var folder = AccountCache(new Uri(endpoint.TrimEnd('/') + "/"), accountId);
        try { if (Directory.Exists(folder)) Directory.Delete(folder, true); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    private static HttpRequestMessage Request(HttpMethod method, Uri host, string path, string? token)
    {
        if (!path.StartsWith("/api/", StringComparison.Ordinal))
            throw new ArgumentException("Expected a Nova API path.", nameof(path));
        var request = new HttpRequestMessage(method, new Uri(host, path.TrimStart('/')));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return request;
    }

    private void SetOffline(bool value)
    {
        if (offline == value) return;
        offline = value;
        OfflineChanged?.Invoke(value);
    }

    private static string Error(byte[] data, string? fallback)
    {
        try
        {
            using var document = JsonDocument.Parse(data);
            var message = document.RootElement.Field("message");
            if (message.ValueKind == JsonValueKind.String) return message.GetString()!;
            if (message.ValueKind == JsonValueKind.Array)
                return string.Join(" ", message.EnumerateArray().Select(item => item.ToString()));
        }
        catch (JsonException) { }
        return fallback ?? "The request failed.";
    }

    private string CachePath(Uri host, string owner, string path) => Path.Combine(AccountCache(host, owner), Hash(path));
    private string AccountCache(Uri host, string owner) => Path.Combine(cacheDirectory, Hash(host.AbsoluteUri + owner));
    private static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private static async Task WriteCache(string path, byte[] raw)
    {
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var protectedBuffer = await new DataProtectionProvider("LOCAL=user").ProtectAsync(CryptographicBuffer.CreateFromByteArray(raw));
            CryptographicBuffer.CopyToByteArray(protectedBuffer, out var protectedBytes);
            await File.WriteAllBytesAsync(temporary, protectedBytes);
            File.Move(temporary, path, true);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or CryptographicException or System.Runtime.InteropServices.COMException)
        {
            try { File.Delete(temporary); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }
    }

    private static async Task<JsonElement?> ReadCache(string path)
    {
        try
        {
            var buffer = CryptographicBuffer.CreateFromByteArray(await File.ReadAllBytesAsync(path));
            var decrypted = await new DataProtectionProvider().UnprotectAsync(buffer);
            CryptographicBuffer.CopyToByteArray(decrypted, out var raw);
            using var document = JsonDocument.Parse(raw);
            return document.RootElement.Clone();
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or CryptographicException or JsonException or System.Runtime.InteropServices.COMException)
        { return null; }
    }
}

internal static class JsonFields
{
    public static JsonElement Field(this JsonElement data, string name) =>
        data.ValueKind == JsonValueKind.Object && data.TryGetProperty(name, out var value) ? value : default;

    public static string Text(this JsonElement data, string name, string fallback = "") =>
        data.Field(name).ValueKind switch
        {
            JsonValueKind.String => data.Field(name).GetString() ?? fallback,
            JsonValueKind.Number => data.Field(name).ToString(),
            _ => fallback
        };

    public static bool Flag(this JsonElement data, string name) => data.Field(name).ValueKind == JsonValueKind.True;
    public static string Id(this JsonElement data) => data.Text("id");
    public static int Number(this JsonElement data, string name) =>
        data.Field(name).TryNumber(out var result) ? result : 0;
    private static bool TryNumber(this JsonElement data, out int result) =>
        int.TryParse(data.ToString(), out result);

    public static IEnumerable<JsonElement> Items(this JsonElement data, string name = "items")
    {
        var list = data.ValueKind == JsonValueKind.Array ? data : data.Field(name);
        return list.ValueKind == JsonValueKind.Array ? list.EnumerateArray().ToArray() : [];
    }
}
