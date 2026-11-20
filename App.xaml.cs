using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.Windows.AppLifecycle;
using Microsoft.Windows.PushNotifications;
using NovaTaskflow.Shell;

namespace NovaTaskflow;

public partial class App : Application
{
    private ShellWindow? window;
    private readonly string[] arguments = Environment.GetCommandLineArgs().Skip(1).ToArray();

    public App() => InitializeComponent();

    [STAThread]
    private static void Main()
    {
        WinRT.ComWrappersSupport.InitializeComWrappers();
        var instanceKey = "NovaTaskflow";
#if DEBUG
        if (Environment.GetCommandLineArgs().Contains("--smoke")) instanceKey += ".Smoke";
#endif
        var commandLine = Environment.GetCommandLineArgs();
        var activationName = @"Local\" + instanceKey + ".Workspace";
        using var ownership = new Mutex(false, activationName + ".Owner");
        using var show = new EventWaitHandle(false, EventResetMode.AutoReset, activationName + ".Show");
        using var quit = new EventWaitHandle(false, EventResetMode.AutoReset, activationName + ".Quit");
        using var active = new EventWaitHandle(false, EventResetMode.ManualReset, activationName + ".Active");
        using var inbox = new EventWaitHandle(false, EventResetMode.AutoReset, activationName + ".Inbox");
#if DEBUG
        if (Array.IndexOf(commandLine, "--smoke-closed-notifications") is var closed && closed >= 0 && closed + 2 < commandLine.Length)
        {
            Environment.ExitCode = NotificationWorkerSmoke.Run(commandLine[closed + 1], commandLine[closed + 2]).GetAwaiter().GetResult();
            return;
        }
        if (Array.IndexOf(commandLine, "--notification-test-profile") is var test && test >= 0 && test + 1 < commandLine.Length)
        {
            DesktopSettings.TestFolder = Path.GetFullPath(commandLine[test + 1]);
            if (!Uri.TryCreate(DesktopSettings.Read().Server, UriKind.Absolute, out var fixture) || !fixture.IsLoopback)
            { Environment.ExitCode = 2; return; }
        }
#endif
        if (commandLine.Contains(NotificationSchedule.Argument))
        {
            CheckClosedInbox(active, TimeSpan.FromSeconds(48));
            return;
        }
        if (commandLine.Contains("--quit"))
        {
            quit.Set();
            return;
        }

        if (commandLine.Any(argument => argument.StartsWith(WindowsPush.ActivationArgument, StringComparison.Ordinal)))
        {
            using var push = WindowsPush.Start(() => inbox.Set());
            if (push is not null && AppInstance.GetCurrent().GetActivatedEventArgs() is
                { Kind: ExtendedActivationKind.Push, Data: PushNotificationReceivedEventArgs received } &&
                WindowsPush.IsInboxSignal(received.Payload))
            {
                var deferral = received.GetDeferral();
                try
                {
                    if (active.WaitOne(0)) inbox.Set();
                    else CheckClosedInbox(active, TimeSpan.FromSeconds(24));
                }
                finally { deferral.Complete(); }
            }
            return;
        }

        var instance = AppInstance.FindOrRegisterForKey(instanceKey);
        if (!instance.IsCurrent)
        {
            var activation = AppInstance.GetCurrent().GetActivatedEventArgs();
            Task.Run(async () => await instance.RedirectActivationToAsync(activation)).GetAwaiter().GetResult();
            return;
        }

        bool ownsWorkspace;
        try { ownsWorkspace = ownership.WaitOne(0); }
        catch (AbandonedMutexException) { ownsWorkspace = true; }
        if (!ownsWorkspace)
        {
            if (!commandLine.Contains("--startup")) show.Set();
            return;
        }
        RegisteredWaitHandle? showWait = null;
        RegisteredWaitHandle? quitWait = null;
        RegisteredWaitHandle? inboxWait = null;
        try
        {
            active.Set();
            using var push = WindowsPush.Start(() => inbox.Set());
            // AppInstance activation can be tied to the executable identity. The named handles
            // also coordinate portable builds launched from different folders in this session.
            Start(_ =>
            {
                var dispatcher = DispatcherQueue.GetForCurrentThread();
                SynchronizationContext.SetSynchronizationContext(new DispatcherQueueSynchronizationContext(dispatcher));
                var app = new App();
                instance.Activated += (_, activation) => dispatcher.TryEnqueue(() => app.window?.AcceptActivation(activation));
                showWait = ThreadPool.RegisterWaitForSingleObject(show,
                    (_, _) => dispatcher.TryEnqueue(() => app.window?.ShowNova()), null, Timeout.Infinite, false);
                quitWait = ThreadPool.RegisterWaitForSingleObject(quit,
                    (_, _) => dispatcher.TryEnqueue(() => app.window?.RequestQuit()), null, Timeout.Infinite, false);
                inboxWait = ThreadPool.RegisterWaitForSingleObject(inbox,
                    (_, _) => dispatcher.TryEnqueue(() => app.window?.RequestNotificationRefresh()), null, Timeout.Infinite, false);
            });
        }
        finally
        {
            active.Reset();
            showWait?.Unregister(null);
            quitWait?.Unregister(null);
            inboxWait?.Unregister(null);
            ownership.ReleaseMutex();
        }
    }

    private static void CheckClosedInbox(EventWaitHandle active, TimeSpan limit)
    {
        using var timeout = new CancellationTokenSource(limit);
        try { NotificationDelivery.CheckAfterExit(() => active.WaitOne(0), timeout.Token).GetAwaiter().GetResult(); }
        catch (Api.ApiFailure error) when (error.Status == System.Net.HttpStatusCode.Unauthorized) { }
        catch (Exception error) when (error is IOException or OperationCanceledException or Api.ApiFailure or System.Text.Json.JsonException
            or UnauthorizedAccessException or System.Runtime.InteropServices.COMException)
        { Environment.ExitCode = 1; }
    }

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
#if DEBUG
        if (Array.IndexOf(arguments, "--smoke") is var smokeIndex && smokeIndex >= 0 && smokeIndex + 1 < arguments.Length)
        {
            var report = Path.GetFullPath(arguments[smokeIndex + 1]);
            DesktopSettings.TestFolder = Path.Combine(Path.GetDirectoryName(report)!, "profile-" + Guid.NewGuid().ToString("N"));
            window = new ShellWindow();
            if (arguments.Contains("--note-sync"))
                await window.SmokeNoteSync(report);
            else
                await window.Smoke(report, arguments.Contains("--hosted"), arguments.Contains("--inspect"));
            return;
        }
#endif
        window = new ShellWindow();
        await window.Start(arguments.Contains("--startup") || args.Arguments == "--startup");
    }
}
