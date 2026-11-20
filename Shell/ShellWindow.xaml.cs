using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media.Imaging;
using Microsoft.Windows.AppLifecycle;
using Microsoft.Windows.AppNotifications;
using NovaTaskflow.Api;
using NovaTaskflow.Auth;
using NovaTaskflow.Controls;
using System.Runtime.InteropServices;
using System.Text.Json;
using Windows.Foundation;
using Windows.Graphics;
using Windows.System;
using Windows.UI.ViewManagement;
using WinRT.Interop;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow : Window
{
    private readonly DesktopSettings settings = DesktopSettings.Read();
    private readonly NovaApi api;
    private readonly nint handle;
    private readonly AppWindow native;
    private readonly DispatcherTimer toastTimer = new() { Interval = TimeSpan.FromSeconds(5) };
    private readonly UISettings systemAppearance = new();
    private CancellationTokenSource viewCancellation = new();
    private CancellationTokenSource overlayCancellation = new();
    private JsonElement user;
    private TrayCommands? tray;
    private bool signingOut;
    private bool quitting;
    private bool hidden;
    private bool notificationsRegistered;
    private bool workspaceReady;
    private string? pendingNotification;
    private double overlayWidth = 480;
    private bool overlayModal;
    private uint layoutDpi;
    private string route = "Dashboard";
    private string routeId = "";
    private Func<Task<bool>>? leavePage;
    private Func<Task>? overlayClosed;
    private Action? appearanceChanged;

    public ShellWindow()
    {
        InitializeComponent();
        handle = WindowNative.GetWindowHandle(this);
        native = AppWindow.GetFromWindowId(Win32Interop.GetWindowIdFromWindow(handle));
        native.Closing += (_, args) =>
        {
            args.Cancel = true;
            if (settings.CloseToTray) HideNova();
            else Run(Quit);
        };
        ClassifySize();
        foreach (var entry in Navigation.Children.OfType<Button>())
        {
            Ui.Name(entry, (string)entry.Tag);
            ToolTipService.SetToolTip(entry, entry.Tag);
        }
        SelectNavigation();
        Root.SizeChanged += (_, args) => AdaptWorkspace(args.NewSize);
        var icon = Path.Combine(AppContext.BaseDirectory, "Assets", "Nova.ico");
        if (File.Exists(icon)) native.SetIcon(icon);
        api = new NovaApi(settings.Server, Path.Combine(DesktopSettings.AppFolder, "cache"));
        api.Unauthorized += generation => DispatcherQueue.TryEnqueue(() =>
        {
            if (!signingOut && api.IsCurrentSession(generation)) EndSession(true);
        });
        api.OfflineChanged += offline => DispatcherQueue.TryEnqueue(() =>
        {
            OfflineBanner.IsOpen = offline;
            if (!offline && SignedIn && background is { IsCancellationRequested: false } current)
            {
                var cancellation = current.Token;
                Run(async () =>
                {
                    await SyncOutbox(cancellation);
                    cancellation.ThrowIfCancellationRequested();
                    await FlushNotes();
                });
            }
        });
        AuthPane.SignIn += Login;
        AuthPane.TryDemo += LoginDemo;
        AuthPane.Register += () => Registration();
        AuthPane.ForgotPassword += () => ResetPassword();
        AuthPane.Reactivate += () => ReactivateAccount();
        AuthPane.ChangeTheme += FlipTheme;
        toastTimer.Tick += (_, _) => { toastTimer.Stop(); ToastBar.IsOpen = false; };
        systemAppearance.ColorValuesChanged += WindowsAppearanceChanged;
        if (settings.FollowWindowsTheme) settings.Light = WindowsUsesLightTheme();
        ApplyTheme();
        AddShortcuts();
        Ui.ActionFailed += ShowActionError;
    }

    private bool SignedIn => user.Id().Length > 0;
    private bool Demo => user.Flag("isDemo");

    internal async Task Start(bool fromStartup)
    {
        hidden = fromStartup;
        try
        {
            tray = new TrayCommands(handle, ShowNova, () => Run(ShowStickies), () => Run(Quit));
            if (!tray.OpenHotkey || !tray.StickyHotkey)
                Toast("A Nova hotkey is already in use.", InfoBarSeverity.Warning);
        }
        catch (Exception error)
        {
            ShowNova();
            Toast(error.Message, InfoBarSeverity.Warning);
        }

        try
        {
            AppNotificationManager.Default.NotificationInvoked += (_, args) =>
                DispatcherQueue.TryEnqueue(() => QueueNotification(args.Argument));
            AppNotificationManager.Default.Register();
            notificationsRegistered = true;
        }
        catch (Exception) { }

        if (DesktopSettings.TestFolder is null)
        {
            var arguments = AppInstance.GetCurrent().GetActivatedEventArgs();
            if (arguments.Kind is ExtendedActivationKind.AppNotification or ExtendedActivationKind.Protocol) AcceptActivation(arguments);
            else if (arguments.Kind == ExtendedActivationKind.StartupTask) hidden = true;
            else if (!fromStartup) ShowNova();
        }
        else if (!fromStartup) ShowNova();

        if (DesktopSettings.TestFolder is null && (!settings.StartupConfigured ||
            (settings.StartWithWindows && !StartupRegistration.IsPortableRegistrationCurrent())))
        {
            try
            {
                await StartupRegistration.SetEnabled(settings.StartWithWindows);
                settings.StartupConfigured = true;
                settings.Save();
            }
            catch (Exception error) { Toast(error.Message, InfoBarSeverity.Warning); }
        }

        if (settings.Account is not { Length: > 0 } account) return;
        try
        {
            var token = SessionVault.Read(VaultKey(account));
            if (token is null) { EndSession(false); return; }
            api.SetSession(token, account);
            var profile = await api.Get("/api/users/me");
            if (profile.Id() != account) { EndSession(false); return; }
            await LaunchWorkspace(profile, settings.RestorePage ? settings.LastPage : "Dashboard");
        }
        catch (ApiFailure error) when (error.Status == System.Net.HttpStatusCode.Unauthorized)
        { EndSession(true); }
        catch (OperationCanceledException) { }
        catch (Exception error) { AuthPane.ShowError(error.Message); }
    }

    internal void AcceptActivation(AppActivationArguments arguments)
    {
        if (arguments.Kind == ExtendedActivationKind.AppNotification &&
            arguments.Data is AppNotificationActivatedEventArgs notification)
            QueueNotification(notification.Argument);
        else if (arguments.Kind == ExtendedActivationKind.Protocol &&
                 arguments.Data is Windows.ApplicationModel.Activation.IProtocolActivatedEventArgs protocol)
            QueueNovaInvite(protocol.Uri);
        else if (arguments.Kind != ExtendedActivationKind.StartupTask)
            ShowNova();
    }

    private void QueueNotification(string arguments)
    {
        if (quitting) return;
        ShowNova();
        pendingNotification = arguments;
        if (workspaceReady) Run(OpenPendingNotification);
    }

    private async Task OpenPendingNotification()
    {
        if (pendingNotification is not { } arguments || !SignedIn) return;
        pendingNotification = null;
        await OpenNotificationFromToast(arguments);
    }

    private string VaultKey(string account) => SessionVault.Key(settings.Server, account);

    private async Task LoginDemo()
    {
        var demo = await api.Send(HttpMethod.Get, "/api/auth/demo", anonymous: true);
        await Login(demo.Text("email"), demo.Text("password"));
    }

    private async Task Login(string identifier, string password)
    {
        JsonElement response;
        try
        {
            response = await api.Send(HttpMethod.Post, "/api/auth/login", new { email = identifier, password }, anonymous: true);
        }
        catch (ApiFailure error) when (!SignedIn && error.Status == System.Net.HttpStatusCode.Unauthorized &&
            System.Net.Mail.MailAddress.TryCreate(identifier, out var email) && email.Address == identifier)
        {
            if (error.Message.Contains("account is archived", StringComparison.OrdinalIgnoreCase))
            {
                AuthPane.ClearPassword();
                await BeginReactivation(email.Address);
                return;
            }
            if (error.Message.Contains("verify your email", StringComparison.OrdinalIgnoreCase))
            {
                AuthPane.ClearPassword();
                VerifyRegistration(email.Address);
                return;
            }
            throw;
        }
        await CompleteSignIn(response);
    }

    private async Task CompleteSignIn(JsonElement response)
    {
        var token = response.Text("accessToken");
        if (token.Length == 0) throw new InvalidOperationException("Login succeeded but no access token was returned.");
        var profile = response.Field("user");
        var account = profile.Id();
        if (account.Length == 0) throw new InvalidOperationException("Nova did not return the signed-in account.");
        SessionVault.Save(VaultKey(account), token);
        settings.Account = account;
        settings.Save();
        api.SetSession(token, account);
        AuthPane.ClearPassword();
        await LaunchWorkspace(profile, "Dashboard");
        if (Demo && !settings.DemoTourSeen && Overlay.Visibility != Visibility.Visible) await ShowDemoTour();
        Run(async () =>
        {
            var hydrated = await api.Get("/api/users/me");
            if (user.Id() == hydrated.Id()) ApplyProfile(hydrated);
        });
    }

    private async Task LaunchWorkspace(JsonElement profile, string initial)
    {
        await CloseOverlay();
        ApplyProfile(profile);
        Workspace.Visibility = Visibility.Visible;
        AuthPane.Visibility = Visibility.Collapsed;
        LoadOutbox();
        RecoverNoteDrafts();
        StartBackground();
        if (NotificationSchedule.Available && settings.NotificationsAfterExit) Run(() => NotificationSchedule.SetEnabled(true));
        await Go(initial is "Projects" or "Whiteboard" or "Timeline" or "Subscriptions" or "Notes" or "Profile" or "Settings"
            ? initial : "Dashboard");
        workspaceReady = SignedIn;
        await OpenPendingNotification();
        await OpenPendingNovaInvite();
    }

    private void ApplyProfile(JsonElement profile)
    {
        user = profile;
        AdminLink.Visibility = IsAdmin ? Visibility.Visible : Visibility.Collapsed;
        if (!IsAdmin && route == "Administration" && PageFrame.Content is not null)
        {
            viewCancellation.Cancel();
            PageFrame.Content = new WorkspacePage("Administration", "Super Admin access is required.");
        }
        PersonName.Text = profile.Text("fullName", profile.Text("name"));
        PersonRole.Text = profile.Text("roleTitle", profile.Text("role", "Member"));
        foreach (var picture in new[] { SidebarAvatar, TopAvatar })
        {
            picture.DisplayName = PersonName.Text;
            picture.ProfilePicture = Uri.TryCreate(profile.Text("avatarUrl"), UriKind.Absolute, out var uri) &&
                uri.Scheme is "https" or "http" ? new BitmapImage(uri) : null;
        }
    }

    private async void SignOutClicked(object sender, RoutedEventArgs args)
    {
        signingOut = true;
        Logout.IsEnabled = false;
        try
        {
            if (leavePage is not null && !await leavePage()) return;
            await FlushNotes();
            if (drafts.Any(draft => draft.Dirty && !draft.StoredLocally && !draft.Value.Blank))
            {
                Toast("Resolve unsaved note edits before signing out.", InfoBarSeverity.Warning);
                return;
            }
            using var limit = new CancellationTokenSource(TimeSpan.FromSeconds(4));
            if (!Demo)
            {
                windowsPushRegistration?.Cancel();
                try { await WindowsPush.RemoveChannel(api, user.Id(), limit.Token); }
                catch (Exception error) when (error is IOException or OperationCanceledException or ApiFailure or UnauthorizedAccessException) { }
            }
            try { await api.Post("/api/auth/logout", cancellation: limit.Token); }
            catch (Exception error) when (error is IOException or OperationCanceledException or ApiFailure) { }
            EndSession(false);
        }
        catch (Exception error) { ShowActionError(error); }
        finally
        {
            Logout.IsEnabled = true;
            signingOut = false;
        }
    }

    private void EndSession(bool expired)
    {
        StopBackground();
        ResetNotes();
        workspaceReady = false;
        outbox = null;
        pendingChanges = [];
        outboxError = null;
        UpdateSyncBanner();
        api.SetSession(null, null);
        if (settings.Account is { } account)
        {
            if (notificationsRegistered)
            {
                var group = new NotificationDelivery(settings.Server, account).Group;
                Run(async () => await AppNotificationManager.Default.RemoveByGroupAsync(group));
            }
            try { SessionVault.Clear(VaultKey(account)); }
            catch (Exception error) { Toast(error.Message, InfoBarSeverity.Error); }
            api.ClearCache(settings.Server, account);
        }
        settings.Account = null;
        settings.Save();
        user = default;
        viewCancellation.Cancel();
        overlayCancellation.Cancel();
        overlayClosed = null;
        leavePage = null;
        Overlay.Visibility = Workspace.Visibility = Visibility.Collapsed;
        OverlayContent.Content = PageFrame.Content = null;
        AuthPane.Visibility = Visibility.Visible;
        AuthPane.ShowError(expired ? "Session expired. Please sign in again." : null);
    }

    private void ClassifySize()
    {
        var display = DisplayArea.GetFromWindowId(native.Id, DisplayAreaFallback.Primary).WorkArea;
        var scale = Math.Max(1d, GetDpiForWindow(handle) / 96d);
        var minimumWidth = Math.Min((int)Math.Round(610 * scale), display.Width);
        var minimumHeight = Math.Min((int)Math.Round(475 * scale), display.Height);
        var width = Math.Clamp(settings.Width, minimumWidth, display.Width);
        var height = Math.Clamp(settings.Height, minimumHeight, display.Height);
        native.MoveAndResize(new RectInt32(
            settings.X == int.MinValue ? display.X + (display.Width - width) / 2 : Math.Clamp(settings.X, display.X, display.X + display.Width - width),
            settings.X == int.MinValue ? display.Y + (display.Height - height) / 2 : Math.Clamp(settings.Y, display.Y, display.Y + display.Height - height),
            width, height));
        ApplyResizeLimits();
    }

    private void AdaptWorkspace(Size size)
    {
        ApplyResizeLimits();
        var compact = size.Width < 930;
        var reduced = compact ? Visibility.Collapsed : Visibility.Visible;
        RailColumn.Width = new GridLength(compact ? 69 : 256);
        CommandBar.Padding = compact ? new Thickness(12, 9, 12, 9) : new Thickness(24, 10, 24, 10);
        Brand.Margin = compact ? new Thickness(12, 14, 0, 18) : new Thickness(15, 16, 0, 20);
        BrandName.Visibility = ProfileLabel.Visibility = SettingsLabel.Visibility = AdminLabel.Visibility = reduced;
        StickyLabel.Visibility = SearchHint.Visibility = TopProfile.Visibility = reduced;
        RailFooter.Margin = compact ? new Thickness(8, 8, 8, 11) : new Thickness(11, 12, 11, 12);
        RailProfile.Padding = compact ? new Thickness(4) : new Thickness(9);
        RailProfile.HorizontalContentAlignment = SettingsLink.HorizontalContentAlignment = AdminLink.HorizontalContentAlignment =
            compact ? HorizontalAlignment.Center : HorizontalAlignment.Left;
        LogoutColumn.Width = compact ? new GridLength(0) : GridLength.Auto;
        LogoutRow.Height = compact ? GridLength.Auto : new GridLength(0);
        Grid.SetColumn(Logout, compact ? 0 : 1);
        Grid.SetRow(Logout, compact ? 1 : 0);
        Logout.HorizontalAlignment = compact ? HorizontalAlignment.Stretch : HorizontalAlignment.Left;
        Logout.Margin = compact ? new Thickness(0, 6, 0, 0) : new Thickness(0);
        Navigation.Spacing = compact ? 2 : 4;
        foreach (var entry in Navigation.Children.OfType<Button>())
        {
            if (entry.Content is not StackPanel panel) continue;
            panel.Children[1].Visibility = reduced;
            entry.HorizontalContentAlignment = compact ? HorizontalAlignment.Center : HorizontalAlignment.Left;
            entry.Padding = compact ? new Thickness(4) : new Thickness(13, 5, 11, 5);
            entry.MinHeight = compact ? 36 : 43;
        }
        UpdateOverlayBounds(size.Width, size.Height);
    }

    private void ApplyResizeLimits()
    {
        var dpi = GetDpiForWindow(handle);
        if (dpi == layoutDpi || native.Presenter is not OverlappedPresenter presenter) return;
        layoutDpi = dpi;
        var scale = Math.Max(1d, dpi / 96d);
        var work = DisplayArea.GetFromWindowId(native.Id, DisplayAreaFallback.Primary).WorkArea;
        presenter.PreferredMinimumWidth = Math.Min((int)Math.Round(610 * scale), work.Width);
        presenter.PreferredMinimumHeight = Math.Min((int)Math.Round(475 * scale), work.Height);
    }

    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(nint window);

    private void SaveBounds()
    {
        if (native.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Restored })
        {
            settings.X = native.Position.X;
            settings.Y = native.Position.Y;
            settings.Width = native.Size.Width;
            settings.Height = native.Size.Height;
        }
        settings.Save();
    }

    internal void ShowNova()
    {
        tray?.RetryShortcuts();
        if (quitting) return;
        native.Show(DesktopSettings.TestFolder is null);
        if (native.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Minimized } presenter)
            presenter.Restore();
        if (DesktopSettings.TestFolder is null)
        {
            Activate();
            TrayCommands.SetForegroundWindow(handle);
        }
        hidden = false;
    }

    private void HideNova()
    {
        if (tray is null) return;
        SaveBounds();
        hidden = true;
        native.Hide();
    }

    internal void RequestQuit() => Run(Quit);

    private async Task Quit()
    {
        if (quitting) return;
        if (leavePage is not null && !await leavePage()) return;
        quitting = true;
        try { await FlushNotes(); }
        catch (Exception) { quitting = false; Toast("A note is still unsaved. Retry the save before quitting.", InfoBarSeverity.Warning); return; }
        if (drafts.Any(draft => draft.Dirty && !draft.StoredLocally && !draft.Value.Blank))
        {
            quitting = false;
            Toast("A note still needs to be saved before quitting.", InfoBarSeverity.Warning);
            return;
        }
        if (DesktopSettings.TestFolder is not null && SignedIn) EndSession(false);
        SaveStickyPlacements();
        ReleaseStickyWindows();
        SaveBounds();
        StopBackground();
        tray?.Dispose();
        tray = null;
        if (notificationsRegistered) AppNotificationManager.Default.Unregister();
        systemAppearance.ColorValuesChanged -= WindowsAppearanceChanged;
        Ui.ActionFailed -= ShowActionError;
        Application.Current.Exit();
    }

    private void AddShortcuts()
    {
        Shortcut(VirtualKey.K, () => { if (SignedIn) Run(ShowSearch); });
        Shortcut(VirtualKey.W, HideNova);
        Shortcut(VirtualKey.Q, () => Run(Quit));
        Shortcut((VirtualKey)188, () => { if (SignedIn) Run(() => Go("Settings")); else ServerSettings(); });
        var destinations = new[] { "Dashboard", "Projects", "Whiteboard", "Timeline", "Subscriptions", "Notes" };
        for (var i = 0; i < destinations.Length; i++)
        {
            var destination = destinations[i];
            Shortcut((VirtualKey)((int)VirtualKey.Number1 + i), () => { if (SignedIn) Run(() => Go(destination)); });
        }
    }

    private void Shortcut(VirtualKey key, Action action)
    {
        var accelerator = new KeyboardAccelerator { Key = key, Modifiers = VirtualKeyModifiers.Control };
        accelerator.Invoked += (_, args) => { args.Handled = true; action(); };
        Root.KeyboardAccelerators.Add(accelerator);
    }

    private void OnKeyDown(object sender, KeyRoutedEventArgs args)
    {
        if (args.Key != VirtualKey.Escape || Overlay.Visibility != Visibility.Visible) return;
        args.Handled = true;
        Run(CloseOverlay);
    }

    private void Navigate(object sender, RoutedEventArgs args)
    {
        if (sender is Button { Tag: string selected }) Run(() => Go(selected));
    }

    private void SelectNavigation()
    {
        var selected = route switch { "Project" => "Projects", "Note" => "Notes", "Board" => "Whiteboard", _ => route };
        foreach (var entry in Navigation.Children.OfType<Button>())
        {
            var active = (string)entry.Tag == selected;
            entry.Style = Ui.Style(active ? "NovaNavigationActive" : "NovaNavigation");
            Microsoft.UI.Xaml.Automation.AutomationProperties.SetItemStatus(entry, active ? "Current page" : "");
        }
    }

    private async Task Go(string destination, string id = "", bool refresh = false)
    {
        if (!SignedIn || quitting) return;
        if (destination == "Administration" && !IsAdmin) return;
        if (!refresh && destination == route && id == routeId && PageFrame.Content is not null && Overlay.Visibility != Visibility.Visible) return;
        if (leavePage is not null && !await leavePage()) return;
        leavePage = null;
        await CloseOverlay();
        viewCancellation.Cancel();
        viewCancellation.Dispose();
        viewCancellation = new();
        var cancellation = viewCancellation.Token;
        route = destination;
        routeId = id;
        if (destination is not ("Project" or "Note" or "Board" or "Person" or "Administration"))
        {
            settings.LastPage = destination;
            settings.Save();
        }
        SelectNavigation();
        var page = new WorkspacePage(destination);
        PageFrame.Content = page;
        page.SetLoading(true);
        try
        {
            switch (destination)
            {
                case "Dashboard": await Dashboard(page, cancellation); break;
                case "Projects": await Projects(page, cancellation); break;
                case "Project": await Project(page, id, cancellation); break;
                case "Timeline": await Timeline(page, cancellation); break;
                case "Subscriptions": await Subscriptions(page, cancellation); break;
                case "Notes": await Notes(page, id, cancellation); break;
                case "Note": await EditNote(page, id, cancellation); break;
                case "Profile": await Profile(page, "", cancellation); break;
                case "Person": await Profile(page, id, cancellation); break;
                case "Settings": RenderSettings(page); break;
                case "Whiteboard": await Whiteboards(page, id, cancellation); break;
                case "Board": await Board(page, id, cancellation); break;
                case "Administration": await AdminPage(page, id, cancellation); break;
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception error) when (!cancellation.IsCancellationRequested)
        {
            page.Empty("Couldn’t load this page.", "Try again", () => Go(destination, id, true));
            Toast(error.Message, InfoBarSeverity.Error);
        }
        finally { page.SetLoading(false); }
    }

    private void ToggleTheme(object sender, RoutedEventArgs args) => FlipTheme();
    private void FlipTheme() => SetAppearance(settings.Light ? "Dark" : "Light");

    private void SetAppearance(string mode)
    {
        settings.FollowWindowsTheme = mode == "System";
        settings.Light = settings.FollowWindowsTheme ? WindowsUsesLightTheme() : mode == "Light";
        settings.Save();
        ApplyTheme();
    }

    private bool WindowsUsesLightTheme()
    {
        var background = systemAppearance.GetColorValue(UIColorType.Background);
        return .2126 * background.R + .7152 * background.G + .0722 * background.B > 144;
    }

    private void WindowsAppearanceChanged(UISettings sender, object args)
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            if (quitting || !settings.FollowWindowsTheme || settings.Light == WindowsUsesLightTheme()) return;
            settings.Light = !settings.Light;
            ApplyTheme();
        });
    }

    private void ApplyTheme()
    {
        Root.RequestedTheme = settings.Light ? ElementTheme.Light : ElementTheme.Dark;
        if (AppWindowTitleBar.IsCustomizationSupported())
        {
            var titleBar = native.TitleBar;
            var surface = Ui.Rgb(settings.Light ? 0xede6dbu : 0x1c1816u);
            var text = Ui.Rgb(settings.Light ? 0x1c1208u : 0xe8e3e0u);
            titleBar.BackgroundColor = titleBar.InactiveBackgroundColor = surface;
            titleBar.ForegroundColor = titleBar.InactiveForegroundColor = text;
            titleBar.ButtonBackgroundColor = titleBar.ButtonInactiveBackgroundColor = surface;
            titleBar.ButtonForegroundColor = titleBar.ButtonInactiveForegroundColor = text;
        }
        ThemeIcon.Glyph = settings.Light ? "\uE708" : "\uE706";
        ToolTipService.SetToolTip(ThemeButton, settings.Light ? "Switch to dark mode" : "Switch to light mode");
        AuthPane.ApplyTheme(settings.Light);
        ApplyStickyTheme();
        notesChanged?.Invoke();
        appearanceChanged?.Invoke();
    }

    private void OpenProfile(object sender, RoutedEventArgs args) => Run(() => Go("Profile"));
    private void OpenSettings(object sender, RoutedEventArgs args) => Run(() => Go("Settings"));
    private void OpenSearch(object sender, RoutedEventArgs args) => Run(ShowSearch);
    private void OpenStickies(object sender, RoutedEventArgs args) => Run(ShowStickies);
    private void OpenNotifications(object sender, RoutedEventArgs args) => Run(ShowNotifications);
    private void DismissOverlay(object sender, TappedRoutedEventArgs args) => Run(CloseOverlay);

    private async Task CloseOverlay()
    {
        if (Overlay.Visibility != Visibility.Visible) return;
        var finalize = overlayClosed;
        overlayClosed = null;
        if (finalize is not null) await finalize();
        overlayCancellation.Cancel();
        Overlay.Visibility = Visibility.Collapsed;
        OverlayContent.Content = null;
    }

    private CancellationToken ShowOverlay(string title, FrameworkElement content, bool modal = false, double width = 480)
    {
        overlayCancellation.Cancel();
        overlayCancellation.Dispose();
        overlayCancellation = new();
        overlayClosed = null;
        overlayWidth = width;
        overlayModal = modal;
        UpdateOverlayBounds(Root.ActualWidth, Root.ActualHeight);
        OverlayCard.HorizontalAlignment = modal ? HorizontalAlignment.Center : HorizontalAlignment.Right;
        OverlayCard.VerticalAlignment = modal ? VerticalAlignment.Center : VerticalAlignment.Stretch;
        OverlayCard.Margin = modal ? new Thickness(20) : new Thickness(0, 0, 8, 8);
        var header = new Grid { Margin = new Thickness(20, 18, 20, 12) };
        var close = Ui.Button("Close", CloseOverlay);
        close.HorizontalAlignment = HorizontalAlignment.Right;
        var label = Ui.Section(title);
        label.VerticalAlignment = VerticalAlignment.Center;
        label.Margin = new Thickness(0, 0, 76, 0);
        header.Children.Add(label);
        header.Children.Add(close);
        var layout = new Grid();
        layout.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        layout.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        layout.Children.Add(header);
        Grid.SetRow(content, 1);
        layout.Children.Add(content);
        OverlayContent.Content = layout;
        Overlay.Visibility = Visibility.Visible;
        return overlayCancellation.Token;
    }

    private void UpdateOverlayBounds(double width, double height)
    {
        if (width <= 0 || height <= 0) return;
        OverlayCard.Width = Math.Min(overlayWidth, Math.Max(0, width - (overlayModal ? 42 : 18)));
        OverlayCard.MaxHeight = overlayModal ? Math.Max(0, height - 44) : double.PositiveInfinity;
    }

    private void Drawer(string title, StackPanel body, bool modal = false, double width = 480)
    {
        body.Padding = new Thickness(20, 0, 20, 20);
        ShowOverlay(title, Ui.Scroll(body), modal, width);
    }

    private Button ActionButton(string title, Func<Task> action, bool primary = false, string? busy = null)
    {
        var button = Ui.Button(title, primary);
        button.Command = new CommunityToolkit.Mvvm.Input.AsyncRelayCommand(async () =>
        {
            if (busy is not null) button.Content = busy;
            try { await action(); }
            catch (OperationCanceledException) { }
            catch (Exception error) { Toast(error.Message, InfoBarSeverity.Error); }
            finally { button.Content = title; }
        });
        return button;
    }

    private async Task<bool> Confirm(string title, string body, string action, string cancel = "Cancel")
    {
        var dialog = Ui.Confirmation(Root.XamlRoot, title, body, action, cancel);
        return await dialog.ShowAsync() == ContentDialogResult.Primary;
    }

    private async void Run(Func<Task> action)
    {
        try { await action(); }
        catch (OperationCanceledException) { }
        catch (Exception error) { Toast(error.Message, InfoBarSeverity.Error); }
    }

    private void ShowActionError(Exception error) => Toast(error.Message, InfoBarSeverity.Error);

    private void Toast(string message, InfoBarSeverity severity = InfoBarSeverity.Success)
    {
        ToastBar.Title = message;
        ToastBar.Message = "";
        ToastBar.ActionButton = null;
        ToastBar.Severity = severity;
        ToastBar.IsOpen = true;
        toastTimer.Stop();
        toastTimer.Start();
    }
}
