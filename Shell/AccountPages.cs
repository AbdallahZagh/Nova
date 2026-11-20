using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using NovaTaskflow.Api;
using NovaTaskflow.Controls;
using System.Net.Http.Headers;
using Windows.Storage;
using Windows.Storage.Pickers;
using WinRT.Interop;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow
{
    private void Registration()
    {
        var name = Ui.Input("Full name");
        var username = Ui.Input("Username", placeholder: "@username");
        var email = AccountEmailInput();
        var password = new PasswordBox { Header = "Password", PlaceholderText = "At least 8 characters" };
        var confirmation = new PasswordBox { Header = "Confirm password" };
        var role = Ui.Input("Role / title");
        var error = new InfoBar { Severity = InfoBarSeverity.Error, IsClosable = false };
        var cancellation = CancellationToken.None;
        Drawer("Create an account", Ui.Stack(name, username, role, email, password, confirmation, error,
            ActionButton("Create account", async () =>
            {
                error.IsOpen = false;
                try
                {
                    var fullName = name.Text.Trim();
                    var handle = string.Concat(username.Text.Where(character => !char.IsWhiteSpace(character)))
                        .ToLowerInvariant();
                    if (handle.StartsWith('@')) handle = handle[1..];
                    var roleTitle = role.Text.Trim();
                    if (fullName.Length == 0) throw new InvalidOperationException("Enter your full name.");
                    if (handle.Length == 0) throw new InvalidOperationException("Enter a username.");
                    if (handle.Any(character => !char.IsAsciiLetterOrDigit(character) && character != '_'))
                        throw new InvalidOperationException("Use letters, numbers, and underscores in your username.");
                    if (roleTitle.Length == 0) throw new InvalidOperationException("Enter your role or job title.");
                    var address = AccountEmail(email.Text);
                    if (password.Password.Length < 8) throw new InvalidOperationException("Use at least 8 characters for your password.");
                    if (!string.Equals(password.Password, confirmation.Password, StringComparison.Ordinal))
                        throw new InvalidOperationException("Passwords must match.");
                    await api.Send(HttpMethod.Post, "/api/auth/register", new
                    {
                        fullName, username = handle, email = address, password = password.Password, roleTitle
                    }, anonymous: true, cancellation: cancellation);
                    cancellation.ThrowIfCancellationRequested();
                    password.Password = confirmation.Password = "";
                    VerifyRegistration(address);
                }
                catch (Exception failure) when (!cancellation.IsCancellationRequested && failure is InvalidOperationException or ApiFailure or IOException)
                {
                    error.Message = failure.Message;
                    error.IsOpen = true;
                }
            }, true, "Creating account…"), Ui.Button("Back to sign in", CloseOverlay)), true);
        cancellation = overlayCancellation.Token;
    }

    private void VerifyRegistration(string address)
    {
        VerifyEmailCode("Verify your email", address, "REGISTER", "Verify account", async (_, _) =>
        {
            await CloseOverlay();
            Toast("Email verified. You can sign in now.");
        });
    }

    private void ResetPassword(string address = "")
    {
        var email = AccountEmailInput(address, readOnly: SignedIn && address.Length > 0);
        Drawer(SignedIn ? "Change password" : "Forgot password?", Ui.Stack(email,
            ActionButton("Send reset code", async () =>
            {
                var nextAddress = AccountEmail(email.Text);
                await api.Send(HttpMethod.Post, "/api/auth/forgot-password", new { email = nextAddress }, anonymous: true);
                VerifyEmailCode("Verify password reset", nextAddress, "FORGOT_PASSWORD", "Continue", (_, code) =>
                {
                    NewPassword(nextAddress, code);
                    return Task.CompletedTask;
                }, SignedIn ? null : () => ResetPassword(nextAddress));
            }, true, "Sending…"), Ui.Button(SignedIn ? "Back to profile" : "Back to sign in", CloseOverlay)), true);
    }

    private static TextBox AccountEmailInput(string address = "", bool readOnly = false)
    {
        var field = Ui.Input("Email", address, placeholder: "you@company.com", readOnly: readOnly);
        field.InputScope = new InputScope { Names = { new InputScopeName(InputScopeNameValue.EmailSmtpAddress) } };
        return field;
    }

    private static string AccountEmail(string value)
    {
        var email = value.Trim().ToLowerInvariant();
        if (!System.Net.Mail.MailAddress.TryCreate(email, out var parsed) || parsed.Address != email || !parsed.Host.Contains('.'))
            throw new InvalidOperationException("Enter a valid email address.");
        return email;
    }

    private void NewPassword(string address, string code)
    {
        var password = new PasswordBox { Header = "New password" };
        var confirmation = new PasswordBox { Header = "Confirm password" };
        Drawer(SignedIn ? "Change password" : "Reset password", Ui.Stack(password, confirmation,
            ActionButton("Reset password", async () =>
            {
                if (!string.Equals(password.Password, confirmation.Password, StringComparison.Ordinal))
                    throw new InvalidOperationException("Passwords must match.");
                await api.Send(HttpMethod.Post, "/api/auth/reset-password",
                    new { email = address, code, newPassword = password.Password }, anonymous: true);
                password.Password = "";
                confirmation.Password = "";
                await CloseOverlay();
                Toast("Password updated.");
            }, true)), true);
    }

    private async Task Profile(WorkspacePage page, string profileId, CancellationToken cancellation)
    {
        var own = profileId.Length == 0 || profileId == user.Id();
        var profile = await api.Get(own ? "/api/users/me" : $"/api/users/{Ui.PathId(profileId)}/profile", cancellation);
        if (own) ApplyProfile(profile);
        var fullName = profile.Text("fullName", profile.Text("name"));
        var roleTitle = profile.Text("roleTitle", profile.Text("role"));
        page.Title = own ? "Profile" : fullName;
        page.Subtitle = own ? "Photo, details, and account security" : roleTitle;
        var avatar = new PersonPicture { DisplayName = fullName, Width = 76, Height = 76 };
        if (Uri.TryCreate(profile.Text("avatarUrl"), UriKind.Absolute, out var photo))
            avatar.ProfilePicture = new Microsoft.UI.Xaml.Media.Imaging.BitmapImage(photo);
        var identityName = Ui.Section(fullName);
        var identityRole = Ui.Subtitle(roleTitle);
        var identityHandle = Ui.Subtitle(Handle(profile.Text("username")));
        var identityBio = Ui.Text(profile.Text("bio"));
        identityBio.TextWrapping = TextWrapping.Wrap;
        identityBio.Visibility = identityBio.Text.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
        var identity = Ui.Stack(identityName, identityRole, identityHandle, identityBio);
        identity.Spacing = 3;
        var photoRow = new Grid { ColumnSpacing = 16 };
        photoRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        photoRow.ColumnDefinitions.Add(new ColumnDefinition());
        avatar.VerticalAlignment = VerticalAlignment.Top;
        photoRow.Children.Add(avatar);
        Grid.SetColumn(identity, 1);
        photoRow.Children.Add(identity);
        var email = profile.Text("email");
        if (own && email.Length > 0) identity.Children.Add(Ui.Subtitle(email));
        var assignedProjects = profile.Items("projects").ToArray();
        var activity = Activity(profile.Field("activity"), "Task activity");
        var projectCount = int.TryParse(profile.Text("projectsCount"), out var totalProjects) ? totalProjects : assignedProjects.Length;
        var taskCount = int.TryParse(profile.Text("tasksCount"), out var totalTasks) ? totalTasks : assignedProjects.Sum(item => item.Number("userTasksCount"));
        var hero = Ui.Card(Ui.AdaptiveColumns(620, photoRow, Ui.Wrap(
            ProfileCount("Projects", projectCount), ProfileCount("Assigned tasks", taskCount))));
        var layout = Ui.Stack(hero);
        layout.Spacing = 14;
        var name = Ui.Input("Full name", fullName);
        var username = Ui.Input("Username", profile.Text("username"));
        var role = Ui.Input("Role", profile.Text("roleTitle"));
        var bio = Ui.Input("Bio", profile.Text("bio"), true);
        if (own) page.ActionItems.Add(Ui.Button("Report a problem", () => { ReportProblem(); return Task.CompletedTask; }));
        if (own && !Demo)
        {
            var photoActions = Ui.Wrap(ActionButton(photo is null ? "Add photo" : "Change photo", () => UploadAvatar(false)),
                ActionButton("Take photo", () => UploadAvatar(true)));
            identity.Children.Add(photoActions);
            if (photo is not null) photoActions.Children.Add(ActionButton("Remove photo", async () =>
            {
                ApplyProfile(await api.Delete("/api/users/me/avatar"));
                await Go("Profile", refresh: true);
            }));
            var save = ActionButton("Save changes", async () =>
            {
                var updated = await api.Patch("/api/users/me", new
                {
                    fullName = name.Text.Trim(), username = username.Text.Trim().TrimStart('@'),
                    roleTitle = role.Text.Trim(), bio = bio.Text.Trim()
                });
                ApplyProfile(updated);
                avatar.DisplayName = identityName.Text = PersonName.Text;
                identityRole.Text = PersonRole.Text;
                identityHandle.Text = Handle(updated.Text("username"));
                identityBio.Text = updated.Text("bio");
                identityBio.Visibility = identityBio.Text.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
                Toast("Profile saved.");
            }, true, "Saving…");
            save.HorizontalAlignment = HorizontalAlignment.Left;
            var fields = Ui.Card(Ui.Stack(Ui.Section("Edit profile"), Ui.AdaptiveColumns(420, name, username), role, bio, save));
            var security = Ui.Card(Ui.Stack(Ui.Section("Account security"), Ui.Subtitle("Change your password with a verification code sent to your email."),
                Ui.Wrap(Ui.Button("Change password", () => { ResetPassword(email); return Task.CompletedTask; }),
                    ActionButton("Send test email", async () =>
                    {
                        if (!await Confirm("Send test email?", $"Nova will send a test email to {email}.", "Send test email")) return;
                        await api.Post("/api/users/me/test-email");
                        Toast("Test email sent.");
                    }))));
            security.VerticalAlignment = VerticalAlignment.Top;
            layout.Children.Add(Ui.AdaptiveColumns(720, fields, security));
        }
        var projects = Ui.Stack(Ui.Section("Projects"));
        foreach (var project in assignedProjects)
        {
            var total = project.Number("userTasksCount");
            var done = project.Number("completedUserTasksCount");
            projects.Children.Add(FollowCard(project.Text("role", "Member"), project.Text("name"),
                $"{ProjectStatus(project)} · {done}/{total} tasks", "Open project", () => Go("Project", project.Id()),
                total > 0 ? (double)done / total : null));
        }
        if (assignedProjects.Length == 0) projects.Children.Add(Ui.Subtitle("No projects found."));
        layout.Children.Add(Ui.AdaptiveColumns(710, activity, Ui.Card(projects)));
        if (own && !Demo)
        {
            var deactivate = ActionButton("Deactivate account", async () =>
            {
                if (!await Confirm("Deactivate account?", "You’ll be signed out. Your projects and tasks stay saved.", "Deactivate")) return;
                await api.Delete("/api/users/me");
                EndSession(false);
            });
            deactivate.Style = Ui.Style("NovaDangerButton");
            layout.Children.Add(Ui.Card(Ui.Wrap(Ui.Subtitle("Deactivation archives your account and signs you out."), deactivate)));
        }
        page.Body = Ui.Scroll(layout);

        static string Handle(string username) => username.Length == 0 ? "" : "@" + username.TrimStart('@');

        static Border ProfileCount(string label, int count)
        {
            var contents = Ui.Stack(Ui.Section(count.ToString()), Ui.Subtitle(label));
            contents.Spacing = 3;
            var card = Ui.Card(contents);
            card.Padding = new Thickness(12, 8, 15, 8);
            card.MinWidth = 105;
            return card;
        }
    }

    private async Task UploadAvatar(bool takePhoto)
    {
        var account = user.Id();
        var server = api.Endpoint;
        StorageFile? file;
        if (takePhoto)
        {
            var camera = new Microsoft.Windows.Media.Capture.CameraCaptureUI(native.Id);
            file = await camera.CaptureFileAsync(Microsoft.Windows.Media.Capture.CameraCaptureUIMode.Photo);
        }
        else
        {
            var picker = new FileOpenPicker();
            foreach (var extension in new[] { ".png", ".jpg", ".jpeg", ".webp", ".gif" }) picker.FileTypeFilter.Add(extension);
            InitializeWithWindow.Initialize(picker, handle);
            file = await picker.PickSingleFileAsync();
        }
        if (file is null) return;
        var crop = new AvatarCrop();
        using (var input = await file.OpenReadAsync()) await crop.Load(input);
        var dialog = new ContentDialog
        {
            XamlRoot = Root.XamlRoot, Title = "Frame your profile photo", Content = crop,
            PrimaryButtonText = "Use photo", CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Primary
        };
        byte[]? image = null;
        Exception? error = null;
        dialog.PrimaryButtonClick += async (_, args) =>
        {
            var deferral = args.GetDeferral();
            try { image = await crop.Encode(); }
            catch (Exception failure) { error = failure; }
            finally { deferral.Complete(); }
        };
        if (await dialog.ShowAsync() != ContentDialogResult.Primary) return;
        if (error is not null) throw error;
        if (image is null || !SignedIn || Demo || user.Id() != account || api.Endpoint != server) return;
        using var form = new MultipartFormDataContent();
        using var stream = new ByteArrayContent(image);
        stream.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(stream, "file", "avatar.png");
        ApplyProfile(await api.Post("/api/users/me/avatar", form));
        await Go("Profile", refresh: true);
        Toast("Profile photo updated.");
    }

    private StackPanel ServerControls()
    {
        var address = Ui.Input("API server", settings.Server);
        return Ui.Stack(address, ActionButton("Save server", async () =>
        {
            var next = DesktopSettings.ValidateServer(address.Text);
            if (next == settings.Server) return;
            if (SignedIn && !await Confirm("Change API server?", "Nova will sign you out of this server.", "Save server")) return;
            await FlushNotes();
            EndSession(false);
            settings.Server = next;
            settings.Save();
            api.SetSession(null, null, next);
            Toast("API server saved.");
        }, true));
    }

    private void ServerSettings() => Drawer("Settings", ServerControls(), true);

    private void RenderSettings(WorkspacePage page)
    {
        var startup = new ToggleSwitch { Header = "Launch Nova when I sign in to Windows", IsOn = settings.StartWithWindows };
        startup.Toggled += (_, _) => Run(async () =>
        {
            await StartupRegistration.SetEnabled(startup.IsOn);
            settings.StartWithWindows = startup.IsOn;
            settings.Save();
        });
        var close = new ToggleSwitch { Header = "Close button hides Nova", IsOn = settings.CloseToTray };
        close.Toggled += (_, _) => { settings.CloseToTray = close.IsOn; settings.Save(); };
        var last = new ToggleSwitch { Header = "Open last page on startup", IsOn = settings.RestorePage };
        last.Toggled += (_, _) => { settings.RestorePage = last.IsOn; settings.Save(); };
        var restoreStickies = new ToggleSwitch { Header = "Restore stickies when Nova opens", IsOn = settings.RestoreStickies };
        restoreStickies.Toggled += (_, _) =>
        {
            settings.RestoreStickies = restoreStickies.IsOn;
            settings.Save();
        };
        var canCheckAfterExit = NotificationSchedule.Available;
        var afterExit = new ToggleSwitch { Header = "Check for notifications after quitting", IsEnabled = canCheckAfterExit,
            IsOn = canCheckAfterExit && settings.NotificationsAfterExit };
        afterExit.Toggled += (_, _) =>
        {
            if (!afterExit.IsEnabled || afterExit.IsOn == settings.NotificationsAfterExit) return;
            Run(async () =>
            {
                afterExit.IsEnabled = false;
                try
                {
                    await NotificationSchedule.SetEnabled(afterExit.IsOn);
                    settings.NotificationsAfterExit = afterExit.IsOn;
                    settings.Save();
                    if (!Demo && WindowsPush.Registered && background is { IsCancellationRequested: false } lifetime)
                    {
                        if (afterExit.IsOn)
                        {
                            nextWindowsPushRegistration = default;
                            _ = RefreshWindowsPush(lifetime.Token);
                        }
                        else
                        {
                            windowsPushRegistration?.Cancel();
                            await WindowsPush.RemoveChannel(api, user.Id(), lifetime.Token);
                        }
                    }
                }
                finally { afterExit.IsOn = settings.NotificationsAfterExit; afterExit.IsEnabled = true; }
            });
        };
        var appearance = Ui.Choice("Theme", ["System", "Light", "Dark"], CurrentAppearance());
        appearance.SelectionChanged += (_, _) =>
        {
            if (appearance.Selected() != CurrentAppearance()) SetAppearance(appearance.Selected());
        };
        void SyncAppearance() => appearance.SelectedItem = CurrentAppearance();
        appearanceChanged += SyncAppearance;
        page.Unloaded += (_, _) => appearanceChanged -= SyncAppearance;
        page.Body = Ui.Scroll(Ui.Stack(Ui.Card(Ui.Stack(Ui.Section("Appearance"), appearance)),
            Ui.Card(Ui.Stack(Ui.Section("Window and startup"), startup, close, last, restoreStickies)), Ui.Card(ServerControls()),
            Ui.Card(Ui.Stack(Ui.Section("Notifications"), afterExit, Ui.Subtitle(canCheckAfterExit
                ? "Windows checks about every two minutes while you’re signed in."
                : "Available in the installed Windows package with the Nova notification alias enabled."))),
            Ui.Card(Ui.Stack(Ui.Section("Support and connections"),
                Ui.Button("Report a problem", () => { ReportProblem(); return Task.CompletedTask; }),
                Ui.Button("Open a Nova link", () => { OpenNovaLink(); return Task.CompletedTask; }))),
            Demo ? Ui.Card(Ui.Stack(Ui.Section("Demo"), Ui.Button("Take the tour", ShowDemoTour))) : new Border { Visibility = Visibility.Collapsed },
            Ui.Card(Ui.Stack(Ui.Section("About"), Ui.Subtitle("Nova Taskflow " + typeof(ShellWindow).Assembly.GetName().Version?.ToString(3))))));

        string CurrentAppearance() => settings.FollowWindowsTheme ? "System" : settings.Light ? "Light" : "Dark";
    }
}
