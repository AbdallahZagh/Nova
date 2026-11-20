#if DEBUG
using Microsoft.Windows.AppNotifications;
using NovaTaskflow.Api;
using NovaTaskflow.Auth;

namespace NovaTaskflow.Shell;

internal static class NotificationWorkerSmoke
{
    internal static async Task<int> Run(string report, string launcher)
    {
        var folder = Path.GetDirectoryName(Path.GetFullPath(report))!;
        Directory.CreateDirectory(folder);
        DesktopSettings.TestFolder = Path.Combine(folder, "profile-" + Guid.NewGuid().ToString("N"));
        var name = "Nova Taskflow Notification QA " + Guid.NewGuid().ToString("N");
        var registered = false;
        NotificationDelivery? delivery = null;
        string? vault = null;
        try
        {
            if (!StartupRegistration.HasPackageIdentity()) throw new InvalidOperationException("Use a disposable packaged QA build.");
            using var fixture = new NovaSmokeServer();
            var api = new NovaApi(fixture.Origin, Path.Combine(folder, "cache"));
            var login = await api.Send(HttpMethod.Post, "/api/auth/login", new { email = "fixture-demo@example.com", password = "fixture-password" }, anonymous: true);
            var account = login.Field("user").Id();
            vault = SessionVault.Key(fixture.Origin, account);
            SessionVault.Save(vault, login.Text("accessToken"));
            new DesktopSettings { Account = account, Server = fixture.Origin }.Save();
            delivery = new NotificationDelivery(fixture.Origin, account);
            NotificationSchedule.Configure(true, name, launcher, $"--smoke {NotificationSchedule.Argument} --notification-test-profile \"{DesktopSettings.TestFolder}\"");
            registered = true;
            await InvokeScheduledTask();
            Check(!await HasToast(NovaSmokeServer.NotificationId), "Scheduled first check records the inbox baseline without replaying old alerts");

            var created = DateTimeOffset.UtcNow;
            var unread = fixture.AddNotification("Nova desktop closed delivery test", at: created);
            var read = fixture.AddNotification("Already read", at: created, read: true);
            for (var index = 0; index < 61; index++) fixture.AddNotification("Already read", at: created.AddSeconds(1), read: true);
            await InvokeScheduledTask();
            Check(await HasToast(unread.ToString()) && !await HasToast(read.ToString()),
                "Task Scheduler launches Nova with no workspace running and Windows receives the unread toast from the second page");
            await AppNotificationManager.Default.RemoveByGroupAsync(delivery.Group);
            await InvokeScheduledTask();
            Check(!await HasToast(unread.ToString()), "A subsequent scheduled check does not replay the delivered notification");

            var settings = DesktopSettings.Read();
            settings.NotificationsAfterExit = false;
            settings.Save();
            var suppressed = fixture.AddNotification("Notifications turned off", at: created.AddSeconds(2));
            await InvokeScheduledTask();
            Check(!await HasToast(suppressed.ToString()), "The Windows notification preference prevents delivery after quitting");
            return 0;
        }
        catch (Exception error) { File.AppendAllText(report, "FAIL " + error + Environment.NewLine); return 1; }
        finally
        {
            if (registered) NotificationSchedule.Configure(false, name, launcher, "");
            if (delivery is not null) await AppNotificationManager.Default.RemoveByGroupAsync(delivery.Group);
            if (vault is not null) SessionVault.Clear(vault);
        }

        async Task InvokeScheduledTask()
        {
            dynamic task = NotificationSchedule.GetFixtureTask(name);
            var last = (DateTime)task.LastRunTime;
            if (last != DateTime.MinValue && DateTime.Now - last < TimeSpan.FromSeconds(2)) await Task.Delay(2200);
            task.Run(null);
            var until = DateTime.UtcNow.AddSeconds(28);
            do
            {
                await Task.Delay(250);
                if ((DateTime)task.LastRunTime == last || (int)task.State is 2 or 4) continue;
                var result = (int)task.LastTaskResult;
                if (result != 0) throw new InvalidOperationException($"Windows notification task returned 0x{result:x8}.");
                return;
            }
            while (DateTime.UtcNow < until);
            throw new TimeoutException("Windows did not finish the scheduled notification check.");
        }

        async Task<bool> HasToast(string id)
        {
            var tag = id.Replace("-", "", StringComparison.Ordinal);
            var history = await AppNotificationManager.Default.GetAllAsync();
            return history.Any(toast => toast.Group == delivery?.Group && toast.Tag == tag);
        }

        void Check(bool passed, string description)
        {
            if (!passed) throw new InvalidOperationException(description);
            File.AppendAllText(report, "PASS " + description + Environment.NewLine);
        }
    }
}
#endif
