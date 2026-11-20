using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using System.Text.Json;

namespace NovaTaskflow.Controls;

public sealed record BoardCard(string Id, string Title, string Detail, ImageSource? Preview, JsonElement Board);

public sealed partial class BoardLibrary : UserControl
{
    internal event Action<string>? OpenRequested;
    internal event Action<BoardCard>? OptionsRequested;

    public BoardLibrary()
    {
        InitializeComponent();
        Cards.Loaded += (_, _) => SizeCards();
        Cards.SizeChanged += (_, _) => SizeCards();
    }

    internal IEnumerable<BoardCard> Items { set => Cards.ItemsSource = value; }

    private void SizeCards()
    {
        if (Cards.ActualWidth <= 20 || Cards.ItemsPanelRoot is not ItemsWrapGrid panel) return;
        var columns = Math.Max(1, (int)(Cards.ActualWidth / 245));
        panel.ItemWidth = Math.Floor((Cards.ActualWidth - 2) / columns);
    }

    private void OnItemClick(object sender, ItemClickEventArgs args)
    {
        if (args.ClickedItem is BoardCard card) OpenRequested?.Invoke(card.Id);
    }

    private void OptionsClick(object sender, RoutedEventArgs args)
    {
        if (sender is FrameworkElement { DataContext: BoardCard card }) OptionsRequested?.Invoke(card);
    }
}
