using System.Collections.ObjectModel;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace NovaTaskflow.Controls;

public sealed record StickyPickerRow(string Id, string Title, string Detail, string Badge, SolidColorBrush Color,
    bool Pinned, bool IsOpen, string SearchText);

public sealed partial class StickyPicker : UserControl
{
    private StickyPickerRow[] notes = [];
    private readonly ObservableCollection<StickyPickerRow> displayed = [];
    private bool signedIn;
    private bool loading;
    private bool hidden;
    private int openCount;

    internal event Action? NewRequested;
    internal event Action? ToggleVisibilityRequested;
    internal event Action<string>? NoteRequested;
    internal event Action? SignInRequested;

    public StickyPicker()
    {
        InitializeComponent();
        Results.ItemsSource = displayed;
        Query.TextChanged += (_, _) => Render();
        Filter.SelectionChanged += (_, _) => Render();
        VisibilityButton.Click += (_, _) => ToggleVisibilityRequested?.Invoke();
        NewButton.Click += (_, _) =>
        {
            if (signedIn) NewRequested?.Invoke();
            else SignInRequested?.Invoke();
        };
        Results.ItemClick += (_, args) =>
        {
            if (args.ClickedItem is StickyPickerRow row) NoteRequested?.Invoke(row.Id);
        };
        Query.QuerySubmitted += (_, _) =>
        {
            if (displayed.Count > 0) NoteRequested?.Invoke(displayed[0].Id);
        };
    }

    internal void Update(StickyPickerRow[] incoming, bool authenticated, bool busy, bool hideNotes, int count)
    {
        (notes, signedIn, loading, hidden, openCount) = (incoming, authenticated, busy, hideNotes, count);
        Render();
    }

    internal void FocusSearch() => Query.Focus(FocusState.Programmatic);

    private void Render()
    {
        var query = Query.Text.Trim();
        var matches = notes.Where(note =>
            (Filter.SelectedIndex == 0 || (Filter.SelectedIndex == 1 ? note.IsOpen : note.Pinned)) &&
            note.SearchText.Contains(query, StringComparison.OrdinalIgnoreCase)).ToArray();
        for (var index = 0; index < matches.Length; index++)
        {
            var row = matches[index];
            if (displayed.Count == index) { displayed.Add(row); continue; }
            if (displayed[index].Id != row.Id)
            {
                var previous = displayed.Skip(index + 1).FirstOrDefault(item => item.Id == row.Id);
                if (previous is null) { displayed.Insert(index, row); continue; }
                displayed.Move(displayed.IndexOf(previous), index);
            }
            var current = displayed[index];
            if ((current with { Color = row.Color }) != row || current.Color.Color != row.Color.Color)
                displayed[index] = row;
        }
        while (displayed.Count > matches.Length) displayed.RemoveAt(displayed.Count - 1);
        EmptyState.Visibility = displayed.Count > 0 ? Visibility.Collapsed : Visibility.Visible;
        EmptyState.Text = !signedIn ? "Sign in to open your Nova notes."
            : loading ? "Loading notes…"
            : query.Length > 0 ? "No notes match your search."
            : Filter.SelectedIndex == 1 ? "No stickies are open."
            : Filter.SelectedIndex == 2 ? "No notes are pinned."
            : "No notes yet.";
        Query.IsEnabled = Filter.IsEnabled = signedIn;
        VisibilityButton.Content = hidden ? "Show all" : "Hide all";
        VisibilityButton.IsEnabled = signedIn && openCount > 0;
        NewButton.Content = signedIn ? "New sticky" : "Sign in to Nova";
        OpenCount.Text = signedIn ? $"{openCount} open" : "";
    }
}
