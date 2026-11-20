using Microsoft.Windows.AppNotifications;
using Microsoft.Windows.AppNotifications.Builder;
using NovaTaskflow.Api;
using NovaTaskflow.Auth;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace NovaTaskflow.Shell;

internal sealed class NotificationDelivery(string endpoint, string account)
{
    private readonly string key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(endpoint + "|" + account)));
    private string StateFile => Path.Combine(DesktopSettings.AppFolder, "notifications", key + ".json");
    internal string Group => key[..16];

    private sealed record Bookmark(DateTimeOffset Time, string[] Ids);
    private sealed record Entry(DateTimeOffset Time, string Id, JsonElement Data);

    internal async Task Observe(NovaApi api, JsonElement first, int limit, Func<bool> stillCurrent, Action<JsonElement> publish,
        CancellationToken cancellation)
    {
        var baseline = Read();
        var entries = Entries(first).ToList();
        var lastPage = first.Number("totalPages");
        for (var page = 2; baseline is not null && page <= lastPage && entries.Count > 0 && entries[^1].Time >= baseline.Time; page++)
        {
            cancellation.ThrowIfCancellationRequested();
            var next = await api.GetFresh($"/api/device-tokens/notifications?page={page}&limit={limit}", cancellation);
            var nextEntries = Entries(next).ToArray();
            if (nextEntries.Length == 0) break;
            entries.AddRange(nextEntries);
        }

        using var mutex = new Mutex(false, @"Local\NovaTaskflow.Notifications." + key);
        try { if (!mutex.WaitOne(TimeSpan.FromSeconds(3))) return; }
        catch (AbandonedMutexException) { }
        try
        {
            cancellation.ThrowIfCancellationRequested();
            if (!stillCurrent()) return;
            var current = Read();
            if (current is null)
            {
                // The first successful poll establishes a baseline without replaying the inbox.
                Advance(entries, new(DateTimeOffset.MinValue, []));
                return;
            }
            var pending = entries.Where(item => item.Time > current.Time ||
                (item.Time == current.Time && !current.Ids.Contains(item.Id, StringComparer.Ordinal)))
                .DistinctBy(item => item.Id).OrderBy(item => item.Time).ToArray();
            var observed = new List<Entry>();
            try
            {
                foreach (var item in pending)
                {
                    if (!item.Data.Flag("isRead")) publish(item.Data);
                    observed.Add(item);
                }
            }
            finally
            {
                if (observed.Count > 0) Advance(observed, current);
            }
        }
        finally { mutex.ReleaseMutex(); }
    }

    internal void ShowToast(JsonElement notification)
    {
        var id = notification.Id();
        var builder = new AppNotificationBuilder().SetGroup(Group).SetTag(id.Replace("-", "", StringComparison.Ordinal))
            .AddArgument("notification", id).AddArgument("inbox", Group);
        if (DateTimeOffset.TryParse(notification.Text("createdAt"), out var created))
            builder.AddArgument("created", created.UtcTicks.ToString(System.Globalization.CultureInfo.InvariantCulture));
        var toast = builder.AddText(notification.Text("title", "Nova Taskflow"))
            .AddText(notification.Text("message")).BuildNotification();
        AppNotificationManager.Default.Show(toast);
    }

    private Bookmark? Read()
    {
        try { return File.Exists(StateFile) ? JsonSerializer.Deserialize<Bookmark>(File.ReadAllText(StateFile)) : null; }
        catch (JsonException) { return null; }
        catch (FileNotFoundException) { return null; }
    }

    private void Advance(IReadOnlyList<Entry> entries, Bookmark current)
    {
        var time = entries.Count == 0 ? current.Time : entries.Max(item => item.Time);
        var ids = entries.Where(item => item.Time == time).Select(item => item.Id);
        if (time == current.Time) ids = ids.Concat(current.Ids);
        Directory.CreateDirectory(Path.GetDirectoryName(StateFile)!);
        var temporary = StateFile + ".new";
        File.WriteAllText(temporary, JsonSerializer.Serialize(new Bookmark(time, ids.Distinct(StringComparer.Ordinal).ToArray())));
        File.Move(temporary, StateFile, true);
    }

    private static IEnumerable<Entry> Entries(JsonElement result)
    {
        if (result.Field("data").ValueKind != JsonValueKind.Array) throw new JsonException("Nova returned an invalid notifications list.");
        foreach (var row in result.Items("data"))
            if (Guid.TryParse(row.Id(), out _) && DateTimeOffset.TryParse(row.Text("createdAt"), out var created))
                yield return new Entry(created, row.Id(), row);
    }

    internal static async Task CheckAfterExit(Func<bool> workspaceActive, CancellationToken cancellation)
    {
        var settings = DesktopSettings.Read();
        var account = settings.Account;
        if (!settings.NotificationsAfterExit || account is not { Length: > 0 } || workspaceActive()) return;
        var token = SessionVault.Read(SessionVault.Key(settings.Server, account));
        if (token is null) return;
        var api = new NovaApi(settings.Server, Path.Combine(DesktopSettings.AppFolder, "cache"));
        api.SetSession(token, null);
        const int limit = 60;
        var result = await api.GetFresh($"/api/device-tokens/notifications?page=1&limit={limit}", cancellation).ConfigureAwait(false);
        var delivery = new NotificationDelivery(settings.Server, account);
        var registered = false;
        try
        {
            await delivery.Observe(api, result, limit, () =>
            {
                var latest = DesktopSettings.Read();
                return !workspaceActive() && latest.NotificationsAfterExit && latest.Server == settings.Server && latest.Account == account;
            }, item =>
            {
                if (!registered) { AppNotificationManager.Default.Register(); registered = true; }
                delivery.ShowToast(item);
            }, cancellation).ConfigureAwait(false);
        }
        finally { if (registered) AppNotificationManager.Default.Unregister(); }
    }
}
