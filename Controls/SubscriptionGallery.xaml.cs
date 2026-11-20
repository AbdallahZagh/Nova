using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Media;
using System.Collections.ObjectModel;
using System.Text.Json;

namespace NovaTaskflow.Controls;

public sealed record SubscriptionTile(JsonElement Data, string Name, string Initials, string Plan, string Status, string Price,
    string Cycle, string PreviousPrice, string Timing, string Dates, Brush TimingBrush, Brush Outline,
    string StatusAction, bool CanRenew, bool CanManage)
{
    public Visibility RenewVisibility => CanRenew ? Visibility.Visible : Visibility.Collapsed;
    public Visibility ControlsVisibility => CanManage ? Visibility.Visible : Visibility.Collapsed;
    public Visibility PlanVisibility => Plan.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
    public Visibility PreviousPriceVisibility => PreviousPrice.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
}

public sealed class SubscriptionGroup(string name, IEnumerable<SubscriptionTile> subscriptions) : ObservableCollection<SubscriptionTile>(subscriptions)
{
    public string Name { get; } = name;
}

public sealed partial class SubscriptionGallery : UserControl
{
    internal ObservableCollection<SubscriptionGroup> Groups { get; } = [];
    private readonly CollectionViewSource source;
    internal event Action<SubscriptionTile>? OpenRequested;
    internal event Action<SubscriptionTile>? RenewRequested;
    internal event Action<SubscriptionTile>? StatusRequested;

    public SubscriptionGallery()
    {
        InitializeComponent();
        source = new CollectionViewSource { Source = Groups, IsSourceGrouped = true };
        Cards.ItemsSource = source.View;
        Cards.SizeChanged += (_, args) =>
        {
            if (args.NewSize.Width < 290 || Cards.ItemsPanelRoot is not ItemsWrapGrid panel) return;
            var columns = Math.Max(1, (int)(args.NewSize.Width / 302));
            panel.ItemWidth = Math.Floor((args.NewSize.Width - 2) / columns);
        };
    }

    private void OpenCard(object sender, ItemClickEventArgs args)
    {
        if (args.ClickedItem is SubscriptionTile item) OpenRequested?.Invoke(item);
    }

    private void RenewCard(object sender, RoutedEventArgs args)
    {
        if (sender is FrameworkElement { DataContext: SubscriptionTile item }) RenewRequested?.Invoke(item);
    }

    private void ChangeCardStatus(object sender, RoutedEventArgs args)
    {
        if (sender is FrameworkElement { DataContext: SubscriptionTile item }) StatusRequested?.Invoke(item);
    }
}
