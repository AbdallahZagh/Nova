using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Documents;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Automation;
using System.Collections.ObjectModel;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using NovaTaskflow.Api;

namespace NovaTaskflow.Controls;

internal sealed class RowGroup(string name, IEnumerable<RowItem> rows) : ObservableCollection<RowItem>(rows)
{
    public string Name { get; } = name;
}

internal static class Ui
{
    internal static readonly string[] TaskStatuses = ["To Do", "In Progress", "In Review", "Completed"];
    internal static readonly string[] ProjectStatuses = ["Active", "In Progress", "Completed", "Archived"];
    internal static readonly string[] Priorities = ["Low", "Medium", "High"];
    internal static Style Style(string name) => (Style)Application.Current.Resources[name];
    internal static Windows.UI.Color Rgb(uint rgb) =>
        Microsoft.UI.ColorHelper.FromArgb(255, (byte)(rgb >> 16), (byte)(rgb >> 8), (byte)rgb);

    internal static TextBlock Text(string text, string? style = null, double size = 0)
    {
        var label = new TextBlock { Text = text, TextWrapping = TextWrapping.Wrap };
        if (style is not null) label.Style = Style(style);
        if (size > 0) label.FontSize = size;
        return label;
    }

    internal static TextBlock Subtitle(string text) => Text(text, "NovaSubtitle");
    internal static TextBlock Section(string text)
    {
        var label = Text(text, size: 20);
        label.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
        return label;
    }

    internal static event Action<Exception>? ActionFailed;

    internal static Button Button(string title, bool primary = false)
        => new() { Content = title, Style = Style(primary ? "NovaPrimary" : "NovaQuiet") };

    internal static Button Button(string title, Func<Task> action, bool primary = false)
    {
        var button = Button(title, primary);
        button.Click += async (_, _) =>
        {
            try { await action(); }
            catch (OperationCanceledException) { }
            catch (Exception error) { ActionFailed?.Invoke(error); }
        };
        return button;
    }

    internal static StackPanel Stack(params UIElement[] contents)
    {
        var panel = new StackPanel { Spacing = 10 };
        foreach (var content in contents) panel.Children.Add(content);
        return panel;
    }

    internal static StackPanel Row(params UIElement[] contents)
    {
        var row = Stack(contents);
        row.Orientation = Orientation.Horizontal;
        return row;
    }

    internal static WrapPanel Wrap(params UIElement[] contents)
    {
        var panel = new WrapPanel();
        foreach (var content in contents) panel.Children.Add(content);
        return panel;
    }

    internal static Grid AdaptiveColumns(double breakpoint, FrameworkElement left, FrameworkElement right, double rightWidth = 0)
    {
        var grid = new Grid { ColumnSpacing = 13 };
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        var lower = new RowDefinition { Height = new GridLength(0) };
        grid.RowDefinitions.Add(lower);
        grid.ColumnDefinitions.Add(new ColumnDefinition());
        var side = new ColumnDefinition { Width = rightWidth > 0 ? new GridLength(rightWidth) : new GridLength(2, GridUnitType.Star) };
        grid.ColumnDefinitions.Add(side);
        if (rightWidth == 0) grid.ColumnDefinitions[0].Width = new GridLength(3, GridUnitType.Star);
        grid.Children.Add(left);
        grid.Children.Add(right);
        Grid.SetColumn(right, 1);
        grid.SizeChanged += (_, args) =>
        {
            var stacked = args.NewSize.Width < breakpoint;
            grid.RowSpacing = stacked ? 13 : 0;
            grid.ColumnSpacing = stacked ? 0 : 13;
            Grid.SetRow(right, stacked ? 1 : 0);
            Grid.SetColumn(right, stacked ? 0 : 1);
            lower.Height = stacked ? GridLength.Auto : new GridLength(0);
            side.Width = stacked ? new GridLength(0) : rightWidth > 0 ? new GridLength(rightWidth) : new GridLength(2, GridUnitType.Star);
        };
        return grid;
    }

    internal static Border Card(UIElement content)
        => new() { Style = Style("NovaCard"), Child = content };

    internal static TextBox Input(string title, string value = "", bool multiline = false, string placeholder = "", bool readOnly = false)
    {
        return new TextBox
        {
            Header = string.IsNullOrEmpty(title) ? null : title,
            Text = value,
            PlaceholderText = placeholder,
            AcceptsReturn = multiline,
            TextWrapping = multiline ? TextWrapping.Wrap : TextWrapping.NoWrap,
            IsReadOnly = readOnly,
            MinHeight = multiline ? 108 : 40
        };
    }

    internal static AutoSuggestBox Search(string placeholder, double width)
        => new() { PlaceholderText = placeholder, QueryIcon = new SymbolIcon(Symbol.Find), Width = width };

    internal static StackPanel MentionInput(TextBox field, IEnumerable<JsonElement> people)
    {
        var candidates = MentionPeople(people).ToArray();
        var suggestions = Stack();
        suggestions.Spacing = 5;
        var composer = Stack(field, suggestions);
        if (candidates.Length == 0) return composer;
        field.TextChanged += (_, _) => Suggest();
        field.SelectionChanged += (_, _) => Suggest();
        return composer;

        void Suggest()
        {
            suggestions.Children.Clear();
            var cursor = field.SelectionStart;
            var value = field.Text;
            if (field.SelectionLength > 0 || cursor <= 0 || cursor > value.Length) return;
            var start = cursor - 1;
            while (start >= 0 && (char.IsAsciiLetterOrDigit(value[start]) || value[start] == '_')) start--;
            if (start < 0 || value[start] != '@' || (start > 0 && !char.IsWhiteSpace(value[start - 1]) && value[start - 1] != '(')) return;
            var query = value[(start + 1)..cursor];
            foreach (var candidate in candidates.Where(person => person.Username.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                person.Name.Contains(query, StringComparison.OrdinalIgnoreCase)).Take(8))
            {
                var selection = Button($"{candidate.Name}  @{candidate.Username}".Trim(), () =>
                {
                    var mention = $"@{candidate.Username} ";
                    if (field.Text == value)
                    {
                        field.Text = value[..start] + mention + value[cursor..];
                        field.Select(start + mention.Length, 0);
                    }
                    field.Focus(FocusState.Programmatic);
                    return Task.CompletedTask;
                });
                suggestions.Children.Add(selection);
            }
        }
    }

    internal static TextBlock Mentions(string content, IEnumerable<JsonElement> people, Action<string> open)
    {
        var label = Text("");
        var candidates = MentionPeople(people).ToDictionary(person => person.Username, StringComparer.OrdinalIgnoreCase);
        var previous = 0;
        foreach (Match match in Regex.Matches(content, "@[a-z0-9_]+", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
        {
            if (match.Index > previous) label.Inlines.Add(new Run { Text = content[previous..match.Index] });
            var text = new Run { Text = match.Value, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold };
            if (candidates.TryGetValue(match.Value[1..], out var person) && person.Id.Length > 0)
            {
                var link = new Hyperlink();
                link.Inlines.Add(text);
                link.Click += (_, _) => open(person.Id);
                label.Inlines.Add(link);
            }
            else label.Inlines.Add(text);
            previous = match.Index + match.Length;
        }
        if (previous < content.Length) label.Inlines.Add(new Run { Text = content[previous..] });
        return label;
    }

    private static IEnumerable<(string Id, string Name, string Username)> MentionPeople(IEnumerable<JsonElement> people)
        => people.Select(person =>
        {
            var profile = person.Field("user");
            return (Id: person.Text("userId", profile.Text("id", person.Id())),
                Name: person.Text("fullName", profile.Text("fullName", person.Text("name"))),
                Username: person.Text("username", profile.Text("username")).TrimStart('@'));
        }).Where(person => person.Username.Length > 0).DistinctBy(person => person.Username, StringComparer.OrdinalIgnoreCase);

    internal static Grid InlineAction(FrameworkElement field, params FrameworkElement[] actions)
    {
        var row = new Grid { ColumnSpacing = 7 };
        row.ColumnDefinitions.Add(new ColumnDefinition());
        row.Children.Add(field);
        foreach (var action in actions)
        {
            Grid.SetColumn(action, row.ColumnDefinitions.Count);
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            row.Children.Add(action);
        }
        return row;
    }

    internal static ComboBox Choice(string title, IEnumerable<string> items, string selection)
    {
        var choices = new ComboBox
        {
            Header = string.IsNullOrEmpty(title) ? null : title,
            ItemsSource = items.ToArray(),
            HorizontalAlignment = HorizontalAlignment.Stretch
        };
        choices.SelectedItem = selection;
        if (choices.SelectedIndex < 0) choices.SelectedIndex = 0;
        return choices;
    }

    internal static string Selected(this ComboBox input) => input.SelectedItem?.ToString() ?? "";

    internal static CalendarDatePicker Date(string title, string date)
    {
        return new CalendarDatePicker
        {
            Header = title,
            PlaceholderText = "Select date",
            HorizontalAlignment = HorizontalAlignment.Stretch,
            Date = ParseCalendarDate(date)
        };
    }

    internal static DateTimeOffset? ParseCalendarDate(string date)
        => DateTimeOffset.TryParse(date, out var parsed)
            ? new DateTimeOffset(parsed.Date, TimeZoneInfo.Local.GetUtcOffset(parsed.Date)) : null;

    internal static ContentDialog Confirmation(XamlRoot root, string title, string body, string action, string cancel = "Cancel")
        => new()
        {
            XamlRoot = root,
            Title = title,
            Content = Subtitle(body),
            PrimaryButtonText = action,
            PrimaryButtonStyle = Style(action is "Delete" or "Discard" or "Clear" or "Remove" ? "NovaDangerButton" : "NovaPrimary"),
            CloseButtonText = cancel,
            DefaultButton = ContentDialogButton.Close
        };

    internal static string? DateValue(this CalendarDatePicker picker) => picker.Date?.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    internal static string DateLabel(string input) => DateTimeOffset.TryParse(input, out var date) ? date.ToString("MMM d, yyyy") : "No date";
    internal static string Money(JsonElement item) => string.Join(" ", new[] { item.Text("currency"), item.Text("amount") }.Where(s => s.Length > 0));
    internal static string PathId(string input) => Uri.EscapeDataString(input);

    internal static void Name(UIElement element, string name) => AutomationProperties.SetName(element, name);

    internal static ListView List(ObservableCollection<RowItem> source, Action<RowItem> open)
    {
        var list = new ListView
        {
            ItemsSource = source,
            ItemTemplate = (DataTemplate)Application.Current.Resources["NovaRow"],
            ItemContainerStyle = Style("NovaRowContainer"),
            SelectionMode = ListViewSelectionMode.None,
            IsItemClickEnabled = true,
            HorizontalContentAlignment = HorizontalAlignment.Stretch
        };
        list.ItemClick += (_, args) => open((RowItem)args.ClickedItem);
        return list;
    }

    internal static ScrollViewer Scroll(FrameworkElement child) => new()
    {
        Content = child,
        HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
        VerticalScrollBarVisibility = ScrollBarVisibility.Auto
    };
}

public sealed record RowItem(string Id, string Title, string Detail = "", string Tag = "", string Kind = "")
{
    internal JsonElement Data { get; init; }
}
