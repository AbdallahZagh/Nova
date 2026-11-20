using System.Runtime.InteropServices;
using System.Security.Principal;

namespace NovaTaskflow.Shell;

internal static class NotificationSchedule
{
    public const string Argument = "--check-notifications";
    private const string Alias = "NovaTaskflowNotifications.exe";
    private const int InteractiveToken = 3;
    private static string Launcher => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "WindowsApps", Alias);

    internal static bool Available => DesktopSettings.TestFolder is null && StartupRegistration.HasPackageIdentity() && File.Exists(Launcher);

    internal static Task SetEnabled(bool enabled) => !Available ? Task.CompletedTask : Task.Run(() =>
        Configure(enabled, "Nova Taskflow Notifications " + WindowsUser(), Launcher, Argument));

    private static string WindowsUser()
    {
        using var identity = WindowsIdentity.GetCurrent();
        return identity.User?.Value ?? throw new InvalidOperationException("Windows did not identify the current user.");
    }

    private static dynamic Scheduler()
    {
        var type = Type.GetTypeFromProgID("Schedule.Service") ?? throw new InvalidOperationException("Windows Task Scheduler is unavailable.");
        dynamic service = Activator.CreateInstance(type)!;
        service.Connect();
        return service;
    }

    internal static void Configure(bool enabled, string name, string launcher, string arguments)
    {
        var user = WindowsUser();
        dynamic service = Scheduler();
        dynamic folder = service.GetFolder("\\");
        dynamic? existing;
        try { existing = folder.GetTask(name); }
        catch (Exception error) when (error is FileNotFoundException ||
            error is COMException && error.HResult == unchecked((int)0x80070002)) { existing = null; }
        if (!enabled)
        {
            if (existing is not null) folder.DeleteTask(name, 0);
            return;
        }

        if (existing is not null && (bool)existing.Enabled && (string)existing.Definition.Actions.Item(1).Path == launcher) return;
        dynamic task = service.NewTask(0);
        task.RegistrationInfo.Author = "Nova Taskflow";
        task.RegistrationInfo.Description = "Checks for Nova notifications after the workspace exits. Runs only in your signed-in Windows session.";
        task.Principal.UserId = user;
        task.Principal.LogonType = InteractiveToken;
        task.Settings.ExecutionTimeLimit = "PT1M";
        task.Settings.StartWhenAvailable = true;
        task.Settings.DisallowStartIfOnBatteries = false;
        task.Settings.StopIfGoingOnBatteries = false;
        task.Settings.MultipleInstances = 2; // Ignore a new trigger while a check is running.

        dynamic time = task.Triggers.Create(1); // Time trigger.
        time.StartBoundary = DateTimeOffset.Now.AddMinutes(1).ToString("yyyy-MM-dd'T'HH:mm:sszzz", System.Globalization.CultureInfo.InvariantCulture);
        time.Repetition.Interval = "PT2M";
        dynamic logon = task.Triggers.Create(9);
        logon.UserId = user;
        dynamic action = task.Actions.Create(0);
        action.Path = launcher;
        action.Arguments = arguments;
        folder.RegisterTaskDefinition(name, task, 6, user, null, InteractiveToken, null);
    }

#if DEBUG
    internal static dynamic GetFixtureTask(string name) => Scheduler().GetFolder("\\").GetTask(name);
#endif
}
