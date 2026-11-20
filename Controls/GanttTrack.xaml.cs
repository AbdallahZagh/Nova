using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using NovaTaskflow.Shell;

namespace NovaTaskflow.Controls;

public sealed partial class GanttTrack : UserControl
{
    public GanttTrack() => InitializeComponent();
    private void Changed(object sender, SizeChangedEventArgs args) => Render();
    private void ChangedContext(FrameworkElement sender, DataContextChangedEventArgs args) => Render();

    private void Render()
    {
        if (Track?.DataContext is not GanttItem model || Bar is null || Today is null) return;
        Canvas.SetLeft(Bar, model.Start * Track.ActualWidth);
        Bar.Width = Math.Max(4, model.Span * Track.ActualWidth);
        Bar.Background = new SolidColorBrush(Ui.Rgb(model.Colour));
        ToolTipService.SetToolTip(Bar, $"{model.Title} · {model.Dates}");
        Today.Visibility = model.Today.HasValue ? Visibility.Visible : Visibility.Collapsed;
        if (model.Today is { } today) Canvas.SetLeft(Today, today * Track.ActualWidth);
    }
}
