using Microsoft.Windows.PushNotifications;
using NovaTaskflow.Api;
using NovaTaskflow.Auth;
using System.Reflection;
using System.Runtime.InteropServices;
using Windows.Foundation;

namespace NovaTaskflow.Shell;

internal sealed class WindowsPush : IDisposable
{
    internal const string ActivationArgument = "----WindowsAppRuntimePushServer:";
    private static readonly Guid AppId = Guid.TryParse(typeof(WindowsPush).Assembly
        .GetCustomAttributes<AssemblyMetadataAttribute>().FirstOrDefault(value => value.Key == "NovaWindowsPushAppId")?.Value,
        out var id) ? id : Guid.Empty;
    internal static bool Registered { get; private set; }
    private static PushNotificationChannel? currentChannel;
    private readonly PushNotificationManager manager;
    private readonly TypedEventHandler<PushNotificationManager, PushNotificationReceivedEventArgs> receiver;

    private WindowsPush(PushNotificationManager manager, TypedEventHandler<PushNotificationManager, PushNotificationReceivedEventArgs> receiver)
    {
        this.manager = manager;
        this.receiver = receiver;
    }

    internal static WindowsPush? Start(Action inboxChanged)
    {
        if (AppId == Guid.Empty || !StartupRegistration.HasPackageIdentity()) return null;
        try
        {
            if (!PushNotificationManager.IsSupported()) return null;
            var manager = PushNotificationManager.Default;
            TypedEventHandler<PushNotificationManager, PushNotificationReceivedEventArgs> receiver = (_, args) =>
            {
                if (IsInboxSignal(args.Payload)) inboxChanged();
            };
            manager.PushReceived += receiver;
            try { manager.Register(); }
            catch { manager.PushReceived -= receiver; throw; }
            Registered = true;
            return new WindowsPush(manager, receiver);
        }
        catch (Exception error) when (error is COMException or InvalidOperationException or UnauthorizedAccessException) { return null; }
    }

    internal static bool IsInboxSignal(byte[] payload) => payload.AsSpan().SequenceEqual("nova-inbox"u8);

    internal static async Task<DateTimeOffset> RefreshChannel(NovaApi api, string account, CancellationToken cancellation)
    {
        const string path = "/api/device-tokens/windows";
        var endpoint = api.Endpoint;
        var config = await api.GetFresh(path, cancellation);
        if (!config.Flag("enabled") || !Guid.TryParse(config.Text("appId"), out var appId) || appId != AppId ||
            !Guid.TryParse(config.Text("objectId"), out var objectId) || objectId == Guid.Empty)
            return DateTimeOffset.UtcNow.AddHours(1);
        var response = await PushNotificationManager.Default.CreateChannelAsync(objectId).AsTask(cancellation);
        if (response.Status != PushNotificationChannelStatus.CompletedSuccess || response.Channel is not { } channel)
            return DateTimeOffset.UtcNow.AddMinutes(15);
        cancellation.ThrowIfCancellationRequested();
        var key = SessionVault.Key(endpoint, account) + "|windows-push";
        var previous = SessionVault.Read(key);
        var value = channel.Uri.AbsoluteUri;
        await api.Post(path, new { channel = value, previousChannel = previous }, cancellation);
        cancellation.ThrowIfCancellationRequested();
        if (previous != value) SessionVault.Save(key, value);
        currentChannel = channel;
        var expires = channel.ExpirationTime.AddDays(-2);
        return expires > DateTimeOffset.UtcNow.AddHours(12) ? DateTimeOffset.UtcNow.AddHours(12) : DateTimeOffset.UtcNow.AddMinutes(15);
    }

    internal static async Task RemoveChannel(NovaApi api, string account, CancellationToken cancellation)
    {
        var key = SessionVault.Key(api.Endpoint, account) + "|windows-push";
        var channel = SessionVault.Read(key);
        if (channel is null) return;
        await api.Send(HttpMethod.Delete, "/api/device-tokens/windows", new { channel }, cancellation: cancellation);
        SessionVault.Clear(key);
        if (currentChannel?.Uri.AbsoluteUri == channel)
        {
            try { currentChannel.Close(); }
            catch (COMException) { }
            currentChannel = null;
        }
    }

    public void Dispose()
    {
        Registered = false;
        try { manager.Unregister(); }
        catch (COMException) { }
        manager.PushReceived -= receiver;
    }
}
