using System.Runtime.InteropServices;

namespace NovaTaskflow.Shell;

internal sealed class TrayCommands : IDisposable
{
    private const uint IconMessage = 0x8001;
    private const uint HotkeyMessage = 0x0312;
    private readonly nint window;
    private readonly SubclassProc procedure;
    private readonly uint taskbarCreated = RegisterWindowMessage("TaskbarCreated");
    private readonly Action open;
    private readonly Action stickies;
    private readonly Action quit;
    private NotifyIcon icon;
    private bool disposed;
    public bool OpenHotkey { get; private set; }
    public bool StickyHotkey { get; private set; }

    public TrayCommands(nint window, Action open, Action stickies, Action quit)
    {
        this.window = window;
        this.open = open;
        this.stickies = stickies;
        this.quit = quit;
        procedure = Dispatch;
        if (!SetWindowSubclass(window, procedure, 1, 0))
            throw new InvalidOperationException("Windows tray messages could not be registered.");
        var image = LoadImage(0, Path.Combine(AppContext.BaseDirectory, "Assets", "Nova.ico"), 1, 32, 32, 0x10);
        icon = new NotifyIcon
        {
            Size = (uint)Marshal.SizeOf<NotifyIcon>(),
            Window = window,
            Id = 1,
            Flags = 1 | 2 | 4 | 0x80,
            Message = IconMessage,
            Icon = image == 0 ? LoadIcon(0, (nint)32512) : image,
            Tip = "Nova Taskflow",
            Info = "",
            InfoTitle = ""
        };
        OwnsIcon = image != 0;
        AddIcon();
        RetryShortcuts();
    }

    internal void RetryShortcuts()
    {
        if (disposed) return;
        if (!OpenHotkey) OpenHotkey = RegisterHotKey(window, 1, 0x4003, 'N');
        if (!StickyHotkey) StickyHotkey = RegisterHotKey(window, 2, 0x4003, 'S');
    }

    private bool OwnsIcon { get; }
    private void AddIcon() => Shell_NotifyIcon(0, ref icon);

    private nint Dispatch(nint hwnd, uint message, nuint wParam, nint lParam, nuint subclass, nuint data)
    {
        if (message == taskbarCreated) AddIcon();
        if (message == HotkeyMessage)
        {
            if (wParam == 1) open();
            if (wParam == 2) stickies();
            return 0;
        }
        if (message == IconMessage)
        {
            if (lParam is 0x0202 or 0x0203) open();
            if (lParam is 0x0205 or 0x007B) ContextMenu();
            return 0;
        }
        return DefSubclassProc(hwnd, message, wParam, lParam);
    }

    private void ContextMenu()
    {
        if (!GetCursorPos(out var point)) return;
        var menu = CreatePopupMenu();
        if (menu == 0) return;
        try
        {
            AppendMenu(menu, 0, 1, "Open Nova");
            AppendMenu(menu, 0, 2, "Stickies");
            AppendMenu(menu, 0x0800, 0, null);
            AppendMenu(menu, 0, 3, "Quit Nova");
            SetForegroundWindow(window);
            var command = TrackPopupMenu(menu, 0x0102, point.X, point.Y, 0, window, 0);
            PostMessage(window, 0, 0, 0);
            switch (command)
            {
                case 1: open(); break;
                case 2: stickies(); break;
                case 3: quit(); break;
            }
        }
        finally { DestroyMenu(menu); }
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        Shell_NotifyIcon(2, ref icon);
        UnregisterHotKey(window, 1);
        UnregisterHotKey(window, 2);
        RemoveWindowSubclass(window, procedure, 1);
        if (OwnsIcon) DestroyIcon(icon.Icon);
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct NotifyIcon
    {
        public uint Size;
        public nint Window;
        public uint Id, Flags, Message;
        public nint Icon;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string Tip;
        public uint State, StateMask;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string Info;
        public uint Timeout;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string InfoTitle;
        public uint InfoFlags;
        public Guid Guid;
        public nint BalloonIcon;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Point { public int X, Y; }
    private delegate nint SubclassProc(nint hwnd, uint message, nuint wParam, nint lParam, nuint id, nuint data);
    [DllImport("comctl32.dll")] private static extern bool SetWindowSubclass(nint hwnd, SubclassProc proc, nuint id, nuint data);
    [DllImport("comctl32.dll")] private static extern bool RemoveWindowSubclass(nint hwnd, SubclassProc proc, nuint id);
    [DllImport("comctl32.dll")] private static extern nint DefSubclassProc(nint hwnd, uint message, nuint wParam, nint lParam);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern bool Shell_NotifyIcon(uint command, ref NotifyIcon data);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern uint RegisterWindowMessage(string name);
    [DllImport("user32.dll")] private static extern bool RegisterHotKey(nint hwnd, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] private static extern bool UnregisterHotKey(nint hwnd, int id);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern nint LoadImage(nint handle, string name, uint type, int width, int height, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern nint LoadIcon(nint handle, nint name);
    [DllImport("user32.dll")] private static extern bool DestroyIcon(nint icon);
    [DllImport("user32.dll")] private static extern nint CreatePopupMenu();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool AppendMenu(nint menu, uint flags, nuint id, string? label);
    [DllImport("user32.dll")] private static extern bool DestroyMenu(nint menu);
    [DllImport("user32.dll")] private static extern uint TrackPopupMenu(nint menu, uint flags, int x, int y, int reserved, nint hwnd, nint rect);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] internal static extern bool SetForegroundWindow(nint hwnd);
    [DllImport("user32.dll")] private static extern bool PostMessage(nint hwnd, uint message, nuint wParam, nint lParam);
}
