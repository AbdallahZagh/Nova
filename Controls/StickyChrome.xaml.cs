using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace NovaTaskflow.Controls;

public sealed partial class StickyChrome : UserControl
{
    private bool collapsed;
    public StickyChrome()
    {
        InitializeComponent();
    }

    internal FrameworkElement DragHandle => DragRegion;
    internal FrameworkElement WritingArea => BodyHost;
    internal UIElementCollection Actions => HeaderActions.Children;
    internal UIElement? Body { set => BodyHost.Content = value; }
    internal string Title { set => Caption.Text = value; }
    internal Brush HeaderBrush { set => Header.Background = value; }
    internal Brush SurfaceBrush { set => ChromeRoot.Background = value; }
    internal string StatusText
    {
        set
        {
            Status.Text = value;
            Footer.Visibility = collapsed || string.IsNullOrEmpty(value) ? Visibility.Collapsed : Visibility.Visible;
        }
    }

    internal void SetCaptionWidth(double width) => TitleLayout.Margin = new Thickness(0, 0, Math.Max(0, width), 0);

    internal void SetCollapsed(bool value)
    {
        collapsed = value;
        BodyHost.Visibility = value ? Visibility.Collapsed : Visibility.Visible;
        Footer.Visibility = value || Status.Text.Length == 0 ? Visibility.Collapsed : Visibility.Visible;
    }
}
