using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Media;
using System.Collections.ObjectModel;
using System.Text.Json;

namespace NovaTaskflow.Controls;

public sealed record NotificationCard(JsonElement Data, string Title, string Message, string Category, string Time,
    string Day, string Glyph, bool Unread, SolidColorBrush Tone, SolidColorBrush Outline)
{
    public string AccessibleName => $"{(Unread ? "Unread, " : "")}{Title}, {Category}";
    public Visibility UnreadVisibility => Unread ? Visibility.Visible : Visibility.Collapsed;
}

public sealed class NotificationGroup(string name, IEnumerable<NotificationCard> items) : ObservableCollection<NotificationCard>(items)
{
    public string Name { get; } = name;
}

public sealed partial class NotificationInbox : UserControl
{
    private readonly ObservableCollection<NotificationGroup> groups = [];
    private readonly CollectionViewSource source;
    internal event Action<JsonElement>? OpenRequested;

    public NotificationInbox()
    {
        InitializeComponent();
        source = new CollectionViewSource { IsSourceGrouped = true, Source = groups };
        Cards.ItemsSource = source.View;
    }

    internal void ShowItems(NotificationCard[] cards)
    {
        var current = groups.SelectMany(group => group).ToArray();
        if (current.Length == cards.Length && current.Zip(cards).All(pair =>
            pair.First.Data.GetRawText() == pair.Second.Data.GetRawText() && pair.First.Time == pair.Second.Time &&
            pair.First.Day == pair.Second.Day && pair.First.Tone.Color == pair.Second.Tone.Color)) return;
        groups.Clear();
        foreach (var group in cards.GroupBy(item => item.Day)) groups.Add(new NotificationGroup(group.Key, group));
    }

    private void OpenCard(object sender, ItemClickEventArgs args)
    {
        if (args.ClickedItem is NotificationCard item) OpenRequested?.Invoke(item.Data);
    }
}
