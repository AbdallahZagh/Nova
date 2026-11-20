using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media.Animation;

namespace NovaTaskflow.Controls;

public sealed partial class WorkspacePage : Page
{
    private Storyboard? pulse;
    public WorkspacePage() { InitializeComponent(); Unloaded += (_, _) => pulse?.Stop(); }

    internal WorkspacePage(string title, string subtitle = "") : this()
    {
        TitleText.Text = title;
        Subtitle = subtitle;
    }

    internal string Title { set => TitleText.Text = value; }
    internal string Subtitle
    {
        set
        {
            SubtitleText.Text = value;
            SubtitleText.Visibility = string.IsNullOrWhiteSpace(value) ? Visibility.Collapsed : Visibility.Visible;
        }
    }
    internal UIElement? Body { get => ContentHost.Content as UIElement; set => ContentHost.Content = value; }
    internal UIElementCollection ActionItems => Actions.Children;
    internal UIElementCollection FilterItems => Filters.Children;
    internal void UseFullPage()
    {
        PageHeader.Visibility = FilterScroll.Visibility = Visibility.Collapsed;
        PageLayout.RowSpacing = 0;
        PageLayout.Padding = new Thickness(0);
        fullPage = true;
    }

    private bool fullPage;

    private void AdaptLayout(object sender, SizeChangedEventArgs args)
    {
        if (fullPage) return;
        var compact = args.NewSize.Width < 790;
        PageLayout.Padding = compact ? new Thickness(15, 15, 15, 16) : new Thickness(30, 23, 30, 22);
        TitleText.FontSize = compact ? 28 : 36;
        Grid.SetRow(Actions, compact ? 1 : 0);
        Grid.SetColumn(Actions, compact ? 0 : 1);
        Actions.Margin = compact && Actions.Children.Count > 0 ? new Thickness(0, 8, 0, 0) : new Thickness(0);
        FilterScroll.MaxHeight = args.NewSize.Height < 630 ? Math.Max(110, args.NewSize.Height * .35) : double.PositiveInfinity;
    }

    internal void SetLoading(bool value)
    {
        Shimmer.Visibility = value ? Visibility.Visible : Visibility.Collapsed;
        ContentHost.Visibility = value ? Visibility.Collapsed : Visibility.Visible;
        if (value)
        {
            pulse?.Stop();
            if (!new Windows.UI.ViewManagement.UISettings().AnimationsEnabled) return;
            var opacity = new DoubleAnimation
            {
                From = 1, To = 0.53, Duration = new Duration(TimeSpan.FromMilliseconds(720)),
                AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever,
                EnableDependentAnimation = true
            };
            Storyboard.SetTarget(opacity, Shimmer);
            Storyboard.SetTargetProperty(opacity, "Opacity");
            pulse = new Storyboard();
            pulse.Children.Add(opacity);
            pulse.Begin();
        }
        else pulse?.Stop();
    }

    internal void Empty(string message, string? action = null, Func<Task>? callback = null)
    {
        var panel = Ui.Stack(Ui.Section(message));
        if (action is not null && callback is not null)
            panel.Children.Add(Ui.Button(action, callback, true));
        var card = Ui.Card(panel);
        card.VerticalAlignment = VerticalAlignment.Top;
        Body = card;
    }
}
