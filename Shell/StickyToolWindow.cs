using System.Runtime.InteropServices;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using NovaTaskflow.Controls;
using Windows.Graphics;
using WinRT.Interop;

namespace NovaTaskflow.Shell;

internal sealed record StickyPlacement(int X, int Y, int Width, int Height, bool AlwaysOnTop, bool Collapsed);

internal sealed class StickyToolWindow
{
    private readonly Window window = new();
    private readonly OverlappedPresenter presenter;
    private readonly nint handle;
    private readonly DispatcherTimer saveTimer = new() { Interval = TimeSpan.FromMilliseconds(350) };
    private readonly Func<Task> dismiss;
    private SizeInt32 fullSize;
    private bool dismissing;
    private bool closed;
    private bool resizingProgrammatically;
    private double scaledFor;

    internal AppWindow AppWindow { get; }
    internal StickyChrome Chrome { get; } = new();
    internal bool Collapsed { get; private set; }
    internal bool AlwaysOnTop => presenter.IsAlwaysOnTop;
    internal bool Visible => !closed && AppWindow.IsVisible;
    internal event Action? PlacementChanged;

    internal StickyToolWindow(string title, Func<Task> dismiss)
    {
        this.dismiss = dismiss;
        window.Content = Chrome;
        window.Title = title;
        Chrome.Title = title;
        Chrome.StatusText = "";
        handle = WindowNative.GetWindowHandle(window);
        AppWindow = AppWindow.GetFromWindowId(Win32Interop.GetWindowIdFromWindow(handle));
        AppWindow.IsShownInSwitchers = false;
        presenter = (OverlappedPresenter)AppWindow.Presenter;
        presenter.IsAlwaysOnTop = true;
        presenter.IsMaximizable = false;
        presenter.IsMinimizable = false;
        UpdateMinimumSize(Scale());
        window.ExtendsContentIntoTitleBar = true;
        window.SetTitleBar(Chrome.DragHandle);
        if (AppWindowTitleBar.IsCustomizationSupported())
        {
            AppWindow.TitleBar.PreferredHeightOption = TitleBarHeightOption.Tall;
            AppWindow.TitleBar.ButtonBackgroundColor = Colors.Transparent;
            AppWindow.TitleBar.ButtonInactiveBackgroundColor = Colors.Transparent;
        }
        window.SizeChanged += (_, _) =>
        {
            var scale = Scale();
            if (scaledFor != scale) UpdateMinimumSize(scale);
            UpdateCaption();
        };
        AppWindow.Changed += (_, args) =>
        {
            if (closed || resizingProgrammatically || (!args.DidPositionChange && !args.DidSizeChange)) return;
            if (!Collapsed) fullSize = AppWindow.Size;
            saveTimer.Stop();
            saveTimer.Start();
        };
        AppWindow.Closing += (sender, args) =>
        {
            if (closed) return;
            args.Cancel = true;
            _ = Dismiss();
        };
        saveTimer.Tick += (_, _) =>
        {
            saveTimer.Stop();
            if (!closed) PlacementChanged?.Invoke();
        };
    }

    internal void Place(StickyPlacement? saved, int index, int width, int height, bool picker = false, double? offsetX = null, double? offsetY = null)
    {
        var cursor = CursorPosition();
        var display = saved is null ? DisplayArea.GetFromPoint(cursor, DisplayAreaFallback.Primary)
            : DisplayArea.GetFromRect(new RectInt32(saved.X, saved.Y, saved.Width, saved.Height), DisplayAreaFallback.Nearest);
        var work = display.WorkArea;
        if (DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Nearest).DisplayId != display.DisplayId)
            AppWindow.Move(new PointInt32(work.X, work.Y));
        var scale = Scale();
        UpdateMinimumSize(scale);
        fullSize = new SizeInt32(Math.Clamp(saved?.Width ?? (int)Math.Round(width * scale), Math.Min(presenter.PreferredMinimumWidth ?? 305, work.Width), work.Width),
            Math.Clamp(saved?.Height ?? (int)Math.Round(height * scale), Math.Min(presenter.PreferredMinimumHeight ?? 220, work.Height), work.Height));
        var offset = Math.Min(index, 5) * 30;
        var left = saved?.X ?? (offsetX is { } x ? work.X + (int)Math.Round(x * scale) :
            picker ? cursor.X + 12 : work.X + work.Width - fullSize.Width - 34 - offset);
        var top = saved?.Y ?? (offsetY is { } y ? work.Y + (int)Math.Round(y * scale) :
            picker ? cursor.Y + 16 : work.Y + 49 + offset);
        AppWindow.MoveAndResize(new RectInt32(
            Math.Clamp(left, work.X, work.X + work.Width - fullSize.Width),
            Math.Clamp(top, work.Y, work.Y + work.Height - fullSize.Height), fullSize.Width, fullSize.Height));
        if (saved is not null)
        {
            SetAlwaysOnTop(saved.AlwaysOnTop);
            if (saved.Collapsed) SetCollapsed(true);
        }
    }

    internal void ApplyTheme(bool light)
    {
        Chrome.RequestedTheme = light ? ElementTheme.Light : ElementTheme.Dark;
        if (AppWindowTitleBar.IsCustomizationSupported())
        {
            var foreground = light ? Colors.Black : Colors.White;
            AppWindow.TitleBar.ButtonForegroundColor = foreground;
            AppWindow.TitleBar.ButtonInactiveForegroundColor = foreground;
        }
    }

    internal void SetTitle(string title)
    {
        window.Title = title;
        Chrome.Title = title;
    }

    internal void SetAlwaysOnTop(bool on)
    {
        presenter.IsAlwaysOnTop = on;
        PlacementChanged?.Invoke();
    }

    internal void ResizeTo(int width, int height)
    {
        SetCollapsed(false);
        var area = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Nearest).WorkArea;
        var scale = Scale();
        var newWidth = Math.Min((int)Math.Round(width * scale), area.Width);
        var newHeight = Math.Min((int)Math.Round(height * scale), area.Height);
        var position = AppWindow.Position;
        AppWindow.MoveAndResize(new RectInt32(Math.Clamp(position.X, area.X, area.X + area.Width - newWidth),
            Math.Clamp(position.Y, area.Y, area.Y + area.Height - newHeight), newWidth, newHeight));
    }

    internal void SetCollapsed(bool on)
    {
        if (Collapsed == on) return;
        saveTimer.Stop();
        var restore = on ? AppWindow.Size : fullSize;
        resizingProgrammatically = true;
        try
        {
            Collapsed = on;
            UpdateMinimumSize(Scale());
            presenter.IsResizable = !on;
            Chrome.SetCollapsed(on);
            var height = on ? (int)Math.Round(54 * Scale()) : restore.Height;
            AppWindow.Resize(new SizeInt32(restore.Width, height));
        }
        finally
        {
            fullSize = restore;
            resizingProgrammatically = false;
        }
        PlacementChanged?.Invoke();
    }

    internal StickyPlacement CurrentPlacement() => new(AppWindow.Position.X, AppWindow.Position.Y,
        fullSize.Width, fullSize.Height, AlwaysOnTop, Collapsed);

    internal (double X, double Y, double Width, double Height) SharedPlacement()
    {
        var work = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Nearest).WorkArea;
        var scale = Scale();
        return (Math.Clamp(Math.Round((AppWindow.Position.X - work.X) / scale), 0, 20000),
                Math.Clamp(Math.Round((AppWindow.Position.Y - work.Y) / scale), 0, 20000),
                Math.Clamp(Math.Round(fullSize.Width / scale), 200, 1400),
                Math.Clamp(Math.Round(fullSize.Height / scale), 120, 1400));
    }

    internal void Show(bool activate)
    {
        if (closed) return;
        var focus = activate && DesktopSettings.TestFolder is null;
        AppWindow.Show(focus);
        UpdateCaption();
        if (focus)
        {
            window.Activate();
            TrayCommands.SetForegroundWindow(handle);
        }
    }

    internal void Hide()
    {
        if (!closed) AppWindow.Hide();
    }

    internal void Destroy()
    {
        if (closed) return;
        closed = true;
        saveTimer.Stop();
        window.Close();
    }

    internal async Task Dismiss()
    {
        if (closed || dismissing) return;
        dismissing = true;
        try { await dismiss(); }
        catch (Exception error) { Chrome.StatusText = error.Message; }
        finally { dismissing = false; }
    }

    private void UpdateMinimumSize(double scale)
    {
        scaledFor = scale;
        var work = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Nearest).WorkArea;
        presenter.PreferredMinimumWidth = Math.Min((int)Math.Round(305 * scale), work.Width);
        presenter.PreferredMinimumHeight = Math.Min((int)Math.Round((Collapsed ? 48 : 220) * scale), work.Height);
    }

    private void UpdateCaption() => Chrome.SetCaptionWidth(AppWindow.TitleBar.RightInset / Scale());
    private double Scale() => Math.Max(1, GetDpiForWindow(handle) / 96.0);

    private static PointInt32 CursorPosition() => GetCursorPos(out var point) ? point : default;

    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(nint hwnd);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out PointInt32 point);
}
