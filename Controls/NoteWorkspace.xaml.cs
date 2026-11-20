using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace NovaTaskflow.Controls;

public sealed partial class NoteWorkspace : UserControl
{
    private bool narrow;
    public NoteWorkspace()
    {
        InitializeComponent();
        HorizontalContentAlignment = HorizontalAlignment.Stretch;
        VerticalContentAlignment = VerticalAlignment.Stretch;
        SizeChanged += Adapt;
    }

    internal event Action? BackRequested;
    internal UIElementCollection Actions => ToolbarActions.Children;
    internal UIElement Writing { set => WritingHost.Content = value; }
    internal UIElement Inspector { set => InspectorHost.Content = value; }
    internal string DocumentTitle { set => DocumentName.Text = value; }
    internal Border Paper => WritingCard;

    internal void SaveState(string message, uint color)
    {
        if (SaveText.Text == message) return;
        SaveText.Text = message;
        SaveDot.Fill = new SolidColorBrush(Ui.Rgb(color));
        AutomationProperties.SetName(SaveIndicator, message);
        ToolTipService.SetToolTip(SaveText, message);
    }

    private void Back(object sender, RoutedEventArgs e) => BackRequested?.Invoke();
    private void JumpToDetails(object sender, RoutedEventArgs e) =>
        InspectorHost.StartBringIntoView(new BringIntoViewOptions { VerticalAlignmentRatio = 0 });

    private void Adapt(object sender, SizeChangedEventArgs e)
    {
        var stack = e.NewSize.Width < 760;
        if (stack == narrow) return;
        narrow = stack;
        if (stack)
        {
            Wide.Children.Remove(WritingCard);
            InspectorScroll.Content = null;
            Stacked.Children.Add(WritingCard);
            Stacked.Children.Add(InspectorHost);
        }
        else
        {
            Stacked.Children.Clear();
            Wide.Children.Insert(0, WritingCard);
            InspectorScroll.Content = InspectorHost;
        }
        Wide.Visibility = stack ? Visibility.Collapsed : Visibility.Visible;
        Narrow.Visibility = stack ? Visibility.Visible : Visibility.Collapsed;
        WritingScroll.VerticalScrollMode = stack ? ScrollMode.Disabled : ScrollMode.Enabled;
        WritingScroll.VerticalScrollBarVisibility = stack ? ScrollBarVisibility.Disabled : ScrollBarVisibility.Auto;
        WritingScroll.Padding = stack ? new Thickness(16, 18, 16, 20) : new Thickness(32, 24, 32, 24);
        Toolbar.Padding = stack ? new Thickness(14, 8, 14, 8) : new Thickness(19, 10, 19, 10);
        Breadcrumb.Visibility = stack ? Visibility.Collapsed : Visibility.Visible;
        InspectorShortcut.Visibility = stack ? Visibility.Visible : Visibility.Collapsed;
        Grid.SetRow(SaveIndicator, stack ? 1 : 0);
        Grid.SetColumn(SaveIndicator, stack ? 1 : 2);
        Grid.SetColumnSpan(SaveIndicator, stack ? 3 : 1);
        SaveIndicator.Margin = stack ? new Thickness(0, 4, 0, 0) : new Thickness(0);
    }
}
