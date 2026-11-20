using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Media;
using System.Collections.ObjectModel;

namespace NovaTaskflow.Controls;

public sealed record AgendaEntry(RowItem? Item, string Title, string Detail, string Status, string Glyph, Brush Tone)
{
    public bool CanOpen => Item is not null;
    public Visibility IconVisibility => CanOpen ? Visibility.Visible : Visibility.Collapsed;
    public Visibility DetailVisibility => Detail.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
}

public sealed class AgendaDay(string name, IEnumerable<AgendaEntry> rows) : ObservableCollection<AgendaEntry>(rows)
{
    public string Name { get; } = name;
}

public sealed partial class TimelineAgenda : UserControl
{
    private readonly CollectionViewSource source = new() { IsSourceGrouped = true };
    internal event Action<RowItem>? OpenRequested;

    public TimelineAgenda() => InitializeComponent();

    internal void SetDays(AgendaDay[] days)
    {
        source.Source = days;
        Entries.ItemsSource = source.View;
    }

    private void OpenItem(object sender, ItemClickEventArgs args)
    {
        if (args.ClickedItem is AgendaEntry { Item: { } item }) OpenRequested?.Invoke(item);
    }
}
