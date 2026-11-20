#if DEBUG
using Microsoft.UI.Xaml.Controls;
using NovaTaskflow.Controls;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow
{
    private bool notesLiveJoined;
    private int notesLiveMessages;

    internal async Task SmokeNoteSync(string report)
    {
        var folder = Path.GetDirectoryName(report)!;
        var marker = File.ReadAllText(Path.Combine(folder, "marker.txt")).Trim();
        var server = File.ReadAllText(Path.Combine(folder, "server.txt")).Trim();
        try
        {
            if (!Uri.TryCreate(server, UriKind.Absolute, out var endpoint) || !endpoint.IsLoopback)
                throw new InvalidOperationException("The sync test requires a disposable loopback API.");
            settings.Server = server;
            settings.StartupConfigured = settings.DemoTourSeen = true;
            settings.Save();
            api.SetSession(null, null, server);
            await Start(false);
            await LoginDemo();
            await Go("Notes");
            await Wait(() => notesLiveJoined, TimeSpan.FromSeconds(20), "Desktop didn't join the realtime notes channel");
            Log("READY Desktop joined the realtime notes channel");

            await Wait(() => notesLiveMessages > 0 && notes.Values.Any(note => note.Title == marker),
                TimeSpan.FromMinutes(4), "Desktop didn't receive the note created in Chrome");
            var note = notes.Values.Single(item => item.Title == marker);
            Log("PASS Chrome created a note and the desktop received it automatically");
            await ShowSearch();
            TextBox? query = null;
            ListView? searchResults = null;
            await Wait(() =>
            {
                var palette = Descendants(OverlayContent).OfType<WorkspaceSearch>().SingleOrDefault();
                if (palette is null) return false;
                query = Descendants(palette).OfType<TextBox>().SingleOrDefault();
                searchResults = Descendants(palette).OfType<ListView>().SingleOrDefault();
                return query is not null && searchResults is not null;
            }, TimeSpan.FromSeconds(5), "The desktop search palette did not render");
            query!.Text = marker;
            var results = searchResults!;
            await Wait(() => results.Items.OfType<SearchResult>().Any(result => result.Item is { Kind: "notes" } && result.Item.Id == note.Id),
                TimeSpan.FromSeconds(18), "The grouped desktop search did not find the note created in Chrome");
            Log("PASS Desktop grouped search found the Chrome note through the live Nova search API");
            await CloseOverlay();
            var draft = Draft(note);
            await OpenSticky(note.Id);
            HideNova();
            var sticky = floating[draft];
            var body = Descendants(sticky.Window.Chrome).OfType<TextBox>().Single(box => box.PlaceholderText == "Start writing…");
            var incomingBeforeAndroid = notesLiveMessages;
            Log("READY Windows sticky is open with the workspace hidden");
            await Wait(() => notesLiveMessages > incomingBeforeAndroid && body.Text.Contains("Android edit " + marker, StringComparison.Ordinal),
                TimeSpan.FromMinutes(3), "The standalone sticky didn't display the Android edit");
            Log("PASS Android edit reached the open Windows sticky with the main window hidden");

            var windowsEdit = "Windows edit " + marker;
            body.Text = windowsEdit;
            await Wait(() => draft.Value.Body == windowsEdit, TimeSpan.FromSeconds(5),
                "The sticky text change didn't reach the note draft");
            await draft.Flush();
            if (draft.Dirty || !sticky.Window.Visible || native.IsVisible)
                throw new InvalidOperationException("Desktop didn't save the sticky while the workspace was hidden");
            Log("PASS Standalone Windows sticky saved its edit through the real API");

            var incomingBeforeDelete = notesLiveMessages;
            await Wait(() => notesLiveMessages > incomingBeforeDelete && !notes.ContainsKey(note.Id) && !sticky.Window.Visible,
                TimeSpan.FromMinutes(3), "Deleting in Chrome didn't close the open Windows sticky");
            Log("PASS Chrome deletion removed the note and closed the open Windows sticky");
        }
        catch (Exception error)
        {
            Log("FAIL " + error);
            Environment.ExitCode = 1;
        }
        finally
        {
            EndSession(false);
            await Quit();
        }

        void Log(string line) => File.AppendAllText(report, line + Environment.NewLine);

        static async Task Wait(Func<bool> condition, TimeSpan limit, string failure)
        {
            var elapsed = System.Diagnostics.Stopwatch.StartNew();
            while (!condition())
            {
                if (elapsed.Elapsed >= limit) throw new TimeoutException(failure);
                await Task.Delay(100);
            }
        }
    }
}
#endif
