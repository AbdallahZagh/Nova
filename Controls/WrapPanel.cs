using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Foundation;

namespace NovaTaskflow.Controls;

public sealed class WrapPanel : Panel
{
    protected override Size MeasureOverride(Size availableSize)
    {
        foreach (var child in Children)
            child.Measure(new Size(availableSize.Width, double.PositiveInfinity));
        return Layout(availableSize.Width, false);
    }

    protected override Size ArrangeOverride(Size finalSize)
    {
        Layout(finalSize.Width, true);
        return finalSize;
    }

    private Size Layout(double width, bool arrange)
    {
        const double spacing = 8;
        double x = 0, y = 0, rowHeight = 0, usedWidth = 0;
        foreach (var child in Children)
        {
            if (child.Visibility == Visibility.Collapsed) continue;
            var size = child.DesiredSize;
            var childWidth = Math.Min(size.Width, width);
            if (x > 0 && x + childWidth > width)
            {
                x = 0;
                y += rowHeight + spacing;
                rowHeight = 0;
            }
            if (arrange) child.Arrange(new Rect(x, y, childWidth, size.Height));
            usedWidth = Math.Max(usedWidth, x + childWidth);
            x += childWidth + spacing;
            rowHeight = Math.Max(rowHeight, size.Height);
        }
        return new Size(usedWidth, y + rowHeight);
    }
}
