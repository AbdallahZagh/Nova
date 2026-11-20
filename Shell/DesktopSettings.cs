using System.Text.Json;
using Windows.Storage;

namespace NovaTaskflow.Shell;

internal sealed class DesktopSettings
{
    public const string DefaultServer = "https://nova-l5df.onrender.com";
    public string Server { get; set; } = DefaultServer;
    public string? Account { get; set; }
    public bool DemoTourSeen { get; set; }
    public bool Light { get; set; }
    public bool FollowWindowsTheme { get; set; }
    public bool StartWithWindows { get; set; } = true;
    public bool CloseToTray { get; set; } = true;
    public bool RestorePage { get; set; } = true;
    public bool RestoreStickies { get; set; } = true;
    public bool NotificationsAfterExit { get; set; } = true;
    public bool StartupConfigured { get; set; }
    public string LastPage { get; set; } = "Dashboard";
    public int X { get; set; } = int.MinValue;
    public int Y { get; set; }
    public int Width { get; set; } = 1440;
    public int Height { get; set; } = 900;
    public Dictionary<string, string> PageNames { get; set; } = new();
    public Dictionary<string, StickyPlacement> StickyPlacements { get; set; } = new();

    private static ApplicationDataContainer? PackagedSettings
    {
        get
        {
            if (TestFolder is not null) return null;
            try { return ApplicationData.Current.LocalSettings; }
            catch (Exception error) when (error.HResult == unchecked((int)0x80073D54) || error is InvalidOperationException) { return null; }
        }
    }

    internal static string? TestFolder { get; set; }
    public static string AppFolder => TestFolder ?? Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NovaTaskflow");
    private static string FileName => Path.Combine(AppFolder, "settings.json");

    public static DesktopSettings Read()
    {
        try
        {
            var packaged = PackagedSettings;
            var text = packaged is not null
                ? packaged.Values["settings"] as string
                : File.Exists(FileName) ? File.ReadAllText(FileName) : null;
            return text is null ? new() : JsonSerializer.Deserialize<DesktopSettings>(text) ?? new();
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException)
        { return new(); }
    }

    public void Save()
    {
        var text = JsonSerializer.Serialize(this);
        var packaged = PackagedSettings;
        if (packaged is not null) { packaged.Values["settings"] = text; return; }
        Directory.CreateDirectory(AppFolder);
        var temporary = FileName + ".new";
        File.WriteAllText(temporary, text);
        File.Move(temporary, FileName, true);
    }

    public static string ValidateServer(string input)
    {
        if (!Uri.TryCreate(input.Trim(), UriKind.Absolute, out var address) ||
            (address.Scheme != "https" && address.Scheme != "http") ||
            address.UserInfo.Length > 0 || address.Query.Length > 0 ||
            address.Fragment.Length > 0 || address.AbsolutePath != "/")
            throw new ArgumentException("Enter the Nova server origin, such as https://nova-l5df.onrender.com.");
        return address.GetLeftPart(UriPartial.Authority);
    }
}
