using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;
using System.Collections.ObjectModel;
using Windows.System;

namespace NovaTaskflow.Controls;

public sealed record SearchResult(RowItem Item, string Glyph)
{
    public Visibility DetailVisibility => Item.Detail.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
}

public sealed class SearchGroup(string name, IEnumerable<SearchResult> cards) : ObservableCollection<SearchResult>(cards)
{
    public string Name { get; } = name;
}

public sealed partial class WorkspaceSearch : UserControl
{
    private readonly ObservableCollection<SearchGroup> groups = [];
    private readonly CollectionViewSource source;
    internal event Action<string>? QueryChanged;
    internal event Action<RowItem>? OpenRequested;

    public WorkspaceSearch()
    {
        InitializeComponent();
        source = new CollectionViewSource { Source = groups, IsSourceGrouped = true };
        Results.ItemsSource = source.View;
        Query.TextChanged += (_, _) =>
        {
            Clear.Visibility = Query.Text.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
            QueryChanged?.Invoke(Query.Text.Trim());
        };
        Clear.Click += (_, _) => { Query.Text = ""; FocusQuery(); };
        Results.ItemClick += (_, args) =>
        {
            if (args.ClickedItem is SearchResult match) OpenRequested?.Invoke(match.Item);
        };
        Query.KeyDown += (_, args) =>
        {
            if (Results.Items.Count == 0 || Results.Visibility != Visibility.Visible) return;
            if (args.Key == VirtualKey.Enter && Results.SelectedItem is SearchResult current)
            {
                args.Handled = true;
                OpenRequested?.Invoke(current.Item);
            }
            else if (args.Key is VirtualKey.Up or VirtualKey.Down)
            {
                args.Handled = true;
                Results.SelectedIndex = Math.Clamp(Results.SelectedIndex + (args.Key == VirtualKey.Up ? -1 : 1), 0, Results.Items.Count - 1);
                Results.ScrollIntoView(Results.SelectedItem);
            }
        };
    }

    internal void FocusQuery() => Query.Focus(FocusState.Programmatic);

    internal void SetStatus(string message, bool busy = false)
    {
        groups.Clear();
        Results.Visibility = Visibility.Collapsed;
        Status.Visibility = Visibility.Visible;
        Progress.Visibility = busy ? Visibility.Visible : Visibility.Collapsed;
        Progress.IsActive = busy;
        Hint.Text = message;
    }

    internal void SetMatches(IEnumerable<SearchResult> matches)
    {
        var sections = matches.GroupBy(result => result.Item.Tag).Select(group => new SearchGroup(group.Key, group)).ToArray();
        if (sections.Length == 0)
        {
            SetStatus("No results found.");
            return;
        }
        groups.Clear();
        foreach (var section in sections) groups.Add(section);
        Progress.IsActive = false;
        Status.Visibility = Visibility.Collapsed;
        Results.Visibility = Visibility.Visible;
        Results.SelectedIndex = 0;
    }
}
