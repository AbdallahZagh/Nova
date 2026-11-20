using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;

namespace NovaTaskflow.Controls;

internal sealed record TimelineEntry(string Title, string Status, bool Charge, uint Colour);

internal sealed class TimelineCalendar : UserControl
{
    internal TimelineCalendar(DateTime first, DateTime last, DateTime? focused,
        Func<DateTime, IReadOnlyList<TimelineEntry>> entries, Func<DateTime, Task> openDay)
    {
        HorizontalContentAlignment = HorizontalAlignment.Stretch;
        VerticalContentAlignment = VerticalAlignment.Stretch;
        var grid = new Grid { RowSpacing = 5, ColumnSpacing = 5 };
        var singleDay = first == last;
        var columnCount = singleDay ? 1 : 7;
        var offset = singleDay ? 0 : ((int)first.DayOfWeek + 6) % 7;
        var dayCount = (last - first).Days + 1;
        var monday = singleDay ? first : first.AddDays(-offset);
        for (var column = 0; column < columnCount; column++)
        {
            grid.ColumnDefinitions.Add(new ColumnDefinition());
            var heading = Ui.Subtitle(monday.AddDays(column).ToString(singleDay ? "dddd" : "ddd"));
            Grid.SetColumn(heading, column);
            grid.Children.Add(heading);
        }
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        for (var index = 0; index < dayCount; index++)
        {
            var day = first.AddDays(index);
            var dayItems = entries(day);
            var title = Ui.Text(day.ToString(singleDay ? "MMMM d" : "d"), size: 15);
            title.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
            var cell = Ui.Stack(title);
            cell.Spacing = 4;
            var limit = singleDay ? 4 : 2;
            foreach (var entry in dayItems.Take(limit))
            {
                var preview = Ui.Subtitle(entry.Title);
                preview.MaxLines = 1;
                preview.TextTrimming = TextTrimming.CharacterEllipsis;
                preview.FontSize = singleDay ? 13 : 11;
                var marker = Marker(entry.Colour, entry.Charge);
                var line = new Grid { ColumnSpacing = 4 };
                line.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                line.ColumnDefinitions.Add(new ColumnDefinition());
                line.Children.Add(marker);
                Grid.SetColumn(preview, 1);
                line.Children.Add(preview);
                cell.Children.Add(line);
            }
            if (dayItems.Count > limit)
            {
                var more = Ui.Subtitle($"+{dayItems.Count - limit} more");
                more.FontSize = 11;
                cell.Children.Add(more);
            }
            var button = Ui.Button("", () => openDay(day));
            if (day == focused || day == DateTime.Today)
                button.BorderBrush = new SolidColorBrush(Ui.Rgb(0xe66a17));
            button.Content = cell;
            button.MinHeight = singleDay ? 170 : 77;
            if (!singleDay) button.Padding = new Thickness(5, 4, 5, 4);
            button.HorizontalAlignment = HorizontalAlignment.Stretch;
            button.HorizontalContentAlignment = HorizontalAlignment.Stretch;
            button.VerticalContentAlignment = VerticalAlignment.Top;
            button.IsTabStop = dayItems.Count > 0;
            Ui.Name(button, $"{day:MMMM d} · {dayItems.Count} items");
            if (dayItems.Count > 0)
                ToolTipService.SetToolTip(button, string.Join("\n", dayItems.Select(item => $"{item.Title} · {item.Status}")));
            var row = (index + offset) / columnCount + 1;
            if (grid.RowDefinitions.Count <= row) grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            Grid.SetRow(button, row);
            Grid.SetColumn(button, (index + offset) % columnCount);
            grid.Children.Add(button);
        }
        Content = Ui.Scroll(grid);
    }

    internal static Shape Marker(uint colour, bool charge)
    {
        Shape shape = charge ? new Rectangle { Rotation = 45, CenterPoint = new(3, 3, 0) } : new Ellipse();
        shape.Width = shape.Height = 6;
        shape.Fill = new SolidColorBrush(Ui.Rgb(colour));
        shape.VerticalAlignment = VerticalAlignment.Center;
        return shape;
    }
}
