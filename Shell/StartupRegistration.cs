using Microsoft.Win32;
using Windows.ApplicationModel;

namespace NovaTaskflow.Shell;

internal static class StartupRegistration
{
    private const string TaskId = "NovaTaskflowStartup";
    private const string RunPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private static string Command => $"\"{Environment.ProcessPath}\" --startup";

    internal static bool IsPortableRegistrationCurrent()
    {
        if (HasPackageIdentity()) return true;
        using var run = Registry.CurrentUser.OpenSubKey(RunPath);
        return Equals(run?.GetValue(TaskId), Command);
    }

    public static async Task SetEnabled(bool enabled)
    {
        if (!HasPackageIdentity())
        {
            using var run = Registry.CurrentUser.CreateSubKey(RunPath);
            if (enabled) run.SetValue(TaskId, Command);
            else run.DeleteValue(TaskId, false);
            return;
        }

        var task = await StartupTask.GetAsync(TaskId);
        if (!enabled) { task.Disable(); return; }
        if (task.State == StartupTaskState.DisabledByUser)
            throw new InvalidOperationException("Windows disabled Nova in Startup apps. Enable it there to launch at sign-in.");
        if (task.State == StartupTaskState.DisabledByPolicy)
            throw new InvalidOperationException("Windows policy disables Nova launch at sign-in.");
        if (task.State == StartupTaskState.Disabled)
            await task.RequestEnableAsync();
    }

    internal static bool HasPackageIdentity()
    {
        try { _ = Package.Current.Id; return true; }
        catch (Exception error) when (error.HResult == unchecked((int)0x80073D54) || error is InvalidOperationException)
        { return false; }
    }
}
