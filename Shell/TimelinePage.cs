using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Media;
using NovaTaskflow.Api;
using NovaTaskflow.Controls;
using System.Collections.ObjectModel;
using System.Text.Json;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow
{
    private DateTime? timelineDay;

    private Task OpenTimeline(DateTime day)
    {
        timelineDay = day.Date;
        return Go("Timeline", refresh: true);
    }

    private async Task Timeline(WorkspacePage page, CancellationToken cancellation)
    {
        string[] labels = ["Today", "Tomorrow", "This week", "This month", "This year"];
        string[] filters = ["today", "tomorrow", "weekly", "monthly", "yearly"];
        var focusDay = timelineDay;
        timelineDay = null;
        var selected = focusDay == DateTime.Today ? 0 : focusDay == DateTime.Today.AddDays(1) ? 1 : focusDay.HasValue ? 4 : 3;
        var view = "Calendar";
        var items = Array.Empty<RowItem>();
        var projects = (await api.Get("/api/projects", cancellation)).Items("projects").ToArray();
        var project = Ui.Choice("", new[] { "All projects" }.Concat(projects.Select(p => p.Text("name"))), "All projects");
        var type = Ui.Choice("", ["All", "Tasks", "Subscriptions"], "All");
        var taskStatus = Ui.Choice("", new[] { "All task statuses" }.Concat(Ui.TaskStatuses), "All task statuses");
        Ui.Name(taskStatus, "Task status filter");
        var month = Ui.Choice("", System.Globalization.DateTimeFormatInfo.CurrentInfo.MonthNames.Take(12),
            (focusDay ?? DateTime.Today).ToString("MMMM"));
        var ranges = Ui.Wrap();
        var loaded = false;
        int request = 0;
        CancellationTokenSource? pending = null;
        var viewButtons = new[] { "Calendar", "Agenda", "Gantt" }.Select(label => Ui.Button(label, label == view)).ToArray();
        foreach (var button in viewButtons)
        {
            button.Click += (_, _) =>
            {
                if (button.Content is not string next || view == next) return;
                view = next;
                Draw();
            };
            page.ActionItems.Add(button);
        }
        page.FilterItems.Add(ranges);
        page.FilterItems.Add(Ui.Wrap(project, type, taskStatus, month));

        for (var index = 0; index < labels.Length; index++)
        {
            var target = index;
            ranges.Children.Add(Ui.Button(labels[target], async () =>
            {
                if (target == selected) return;
                selected = target;
                await Load();
            }, target == selected));
        }
        project.SelectionChanged += (_, _) => Run(Load);
        type.SelectionChanged += (_, _) => Draw();
        taskStatus.SelectionChanged += (_, _) => Draw();
        month.SelectionChanged += (_, _) => Draw();
        appearanceChanged += Draw;
        page.Unloaded += (_, _) => { appearanceChanged -= Draw; pending?.Cancel(); pending?.Dispose(); };
        await Load();

        async Task Load()
        {
            var version = ++request;
            pending?.Cancel();
            pending?.Dispose();
            pending = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
            var operation = pending.Token;
            loaded = false;
            page.Body = null;
            page.SetLoading(true);
            page.Subtitle = $"Loading {labels[selected].ToLowerInvariant()}…";
            for (var index = 0; index < ranges.Children.Count; index++)
                ((Button)ranges.Children[index]).Style = Ui.Style(index == selected ? "NovaPrimary" : "NovaQuiet");
            try
            {
                var tz = -(int)DateTimeOffset.Now.Offset.TotalMinutes;
                var projectQuery = project.SelectedIndex > 0 ? "&projectId=" + Ui.PathId(projects[project.SelectedIndex - 1].Id()) : "";
                var response = await api.Get($"/api/timeline?filter={filters[selected]}&tzOffsetMinutes={tz}{projectQuery}", operation);
                if (operation.IsCancellationRequested || version != request) return;
                items = response.Items().Select(task => new RowItem(task.Id(), task.Text("title"),
                    task.Field("project").Text("name"), task.Text("status"), "task") { Data = task })
                    .Concat(response.Items("subscriptions").Select(item => new RowItem(item.Id(), "◆ " + item.Text("service"),
                      Ui.Money(item), item.Text("status"), "subscription") { Data = item }))
                    .Where(item => EntryDate(item) != DateTime.MinValue).ToArray();
                loaded = true;
                Draw();
            }
            catch (OperationCanceledException) { }
            catch (Exception error) when (version == request && !operation.IsCancellationRequested)
            {
                page.Empty("Couldn’t load this range.", "Try again", Load);
                Toast(error.Message, InfoBarSeverity.Error);
            }
            finally { if (version == request) page.SetLoading(false); }
        }

        void Draw()
        {
            if (!loaded || cancellation.IsCancellationRequested) return;
            foreach (var button in viewButtons) button.Style = Ui.Style(Equals(button.Content, view) ? "NovaPrimary" : "NovaQuiet");
            month.Visibility = selected == 4 && view == "Calendar" ? Visibility.Visible : Visibility.Collapsed;
            taskStatus.Visibility = type.SelectedIndex == 2 ? Visibility.Collapsed : Visibility.Visible;
            var shown = items.Where(item => item.Kind == "task"
                ? type.SelectedIndex != 2 && (taskStatus.SelectedIndex <= 0 || TaskStatus(item.Data) == taskStatus.Selected())
                : type.SelectedIndex != 1).ToArray();
            var now = DateTime.Today;
            var monday = now.AddDays(-(((int)now.DayOfWeek + 6) % 7));
            var currentMonth = new DateTime(now.Year, now.Month, 1);
            var chosenMonth = new DateTime(now.Year, Math.Max(1, month.SelectedIndex + 1), 1);
            var range = selected switch
            {
                0 => (now, now), 1 => (now.AddDays(1), now.AddDays(1)), 2 => (monday, monday.AddDays(6)),
                3 => (currentMonth, currentMonth.AddMonths(1).AddDays(-1)),
                _ => (new DateTime(now.Year, 1, 1), new DateTime(now.Year, 12, 31))
            };
            if (selected == 4 && view == "Calendar") range = (chosenMonth, chosenMonth.AddMonths(1).AddDays(-1));
            shown = shown.Where(item => EntryDate(item) >= range.Item1 && EntryDate(item) <= range.Item2).ToArray();
            var tasks = shown.Count(item => item.Kind == "task");
            var charges = shown.Length - tasks;
            page.Subtitle = $"{labels[selected]} · {range.Item1:MMM d} – {range.Item2:MMM d, yyyy} · {tasks} {(tasks == 1 ? "task" : "tasks")}" +
                (charges > 0 ? $" · {charges} {(charges == 1 ? "charge" : "charges")}" : "");
            if (view == "Gantt")
            {
                if (shown.Length == 0) { page.Empty("Nothing due · " + labels[selected], "Refresh", Load); return; }
                page.Body = Gantt(shown, range.Item1, range.Item2);
                return;
            }
            var byDay = shown.ToLookup(EntryDate);
            if (view == "Agenda")
            {
                if (shown.Length == 0) { page.Empty("Nothing due · " + labels[selected], "Refresh", Load); return; }
                var agenda = new TimelineAgenda();
                agenda.OpenRequested += item => Run(() => OpenTimelineItem(item));
                var days = selected == 2 ? Enumerable.Range(0, 7).Select(offset => range.Item1.AddDays(offset))
                    : byDay.Select(group => group.Key).Order();
                agenda.SetDays(days.Select(date => new AgendaDay(date.ToString("dddd, MMMM d"),
                    byDay[date].Any() ? byDay[date].OrderBy(item => item.Kind == "task").ThenBy(item => item.Title).Select(AgendaCard)
                        : [new AgendaEntry(null, "Nothing due", "", "", "", new SolidColorBrush(Ui.Rgb(0x93877du)))])).ToArray());
                page.Body = agenda;
                return;
            }
            var calendarBoard = new TimelineCalendar(range.Item1, range.Item2, focusDay,
                day => byDay[day].Select(item => new TimelineEntry(item.Title.TrimStart('◆', ' '),
                    item.Kind == "task" ? TaskStatus(item.Data) : "Subscription", item.Kind == "subscription", TimelineColour(item))).ToArray(),
                day => DayItems(day, byDay[day].ToArray()));
            var content = new Grid { RowSpacing = 9 };
            content.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            content.RowDefinitions.Add(new RowDefinition());
            content.Children.Add(TimelineLegend());
            Grid.SetRow(calendarBoard, 1);
            content.Children.Add(calendarBoard);
            page.Body = content;
        }
    }

    private AgendaEntry AgendaCard(RowItem item)
    {
        var charge = item.Kind == "subscription";
        var status = charge ? "Subscription" : TaskStatus(item.Data);
        var colour = settings.Light ? status switch
        {
            "Subscription" => 0x27678du, "Completed" => 0x286048u, "In Progress" => 0x78520cu,
            "In Review" => 0x8e440du, _ => 0x65584fu
        } : TimelineColour(item);
        var detail = charge ? Ui.Money(item.Data) : item.Data.Field("project").Text("name");
        var priority = item.Data.Text("priority");
        if (!charge && priority.Length > 0) detail = string.Join(" · ", new[] { detail, Label(priority) }.Where(value => value.Length > 0));
        return new(item, item.Title.TrimStart('◆', ' '), detail, status, charge ? "\uE8C7" : "\uE9D5",
            new SolidColorBrush(Ui.Rgb(colour)));
    }

    private UIElement Gantt(RowItem[] items, DateTime first, DateTime last)
    {
        var panel = Ui.Stack(TimelineLegend(), Ui.Subtitle("Bars run from created date to due date."));
        var days = Math.Max(1, (last - first).Days + 1);
        var grid = new Grid();
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        grid.RowDefinitions.Add(new RowDefinition());
        grid.Children.Add(panel);
        var rows = new ListView { IsItemClickEnabled = true, SelectionMode = ListViewSelectionMode.None };
        var template = (DataTemplate)Application.Current.Resources["NovaGanttRow"];
        rows.ItemTemplate = template;
        rows.ItemContainerStyle = Ui.Style("NovaRowContainer");
        var model = items.Select(item =>
        {
            var start = DateTime.TryParse(item.Data.Text("startDate"), out var initial) ? initial.Date : EntryDate(item);
            var end = EntryDate(item);
            var left = Math.Clamp((start - first).TotalDays / days, 0, 1);
            var right = Math.Clamp(((end - first).TotalDays + 1) / days, left, 1);
            double? today = DateTime.Today < first || DateTime.Today > last ? null : ((DateTime.Today - first).TotalDays + 0.5) / days;
            var charge = item.Kind == "subscription";
            return new GanttItem(item, item.Title, charge ? $"{end:MMM d} · Charge" : $"{start:MMM d} → {end:MMM d}",
                left, Math.Max(0.012, right - left), today, TimelineColour(item));
        }).ToArray();
        var grouped = model.GroupBy(item =>
        {
            var project = item.Item.Data.Field("project");
            return item.Item.Kind == "subscription" ? (Id: "subscriptions", Name: "Subscriptions")
                : (Id: project.Id(), Name: project.Text("name", "Project"));
        }).Select(group => new GanttGroup(group.Key.Name, group)).ToArray();
        var view = new CollectionViewSource { Source = grouped, IsSourceGrouped = true };
        rows.GroupStyle.Add(new GroupStyle { HeaderTemplate = (DataTemplate)Application.Current.Resources["NovaListGroup"] });
        rows.ItemsSource = view.View;
        rows.ItemClick += (_, args) => Run(() => OpenTimelineItem(((GanttItem)args.ClickedItem).Item));
        Grid.SetRow(rows, 1); grid.Children.Add(rows);
        return grid;
    }

    private static WrapPanel TimelineLegend()
    {
        var legend = Ui.Wrap();
        foreach (var status in Ui.TaskStatuses.Append("Subscription"))
        {
            var label = Ui.Subtitle(status);
            label.FontSize = 11;
            var entry = Ui.Row(TimelineCalendar.Marker(TimelineStatusColour(status), status == "Subscription"), label);
            entry.Spacing = 6;
            legend.Children.Add(entry);
        }
        return legend;
    }

    private static uint TimelineColour(RowItem item) =>
        TimelineStatusColour(item.Kind == "subscription" ? "Subscription" : TaskStatus(item.Data));

    private static uint TimelineStatusColour(string status) => status switch
    {
        "In Progress" => 0xdca747u,
        "In Review" => 0xe88343u,
        "Completed" => 0x53a279u,
        "Subscription" => 0x539bc9u,
        _ => 0x93877du
    };

    private static DateTime EntryDate(RowItem item)
        => DateTime.TryParse(item.Data.Text(item.Kind == "task" ? "dueDate" : "occursAt"), out var day) ? day.Date : DateTime.MinValue;

    private Task DayItems(DateTime date, RowItem[] items)
    {
        if (items.Length == 0) return Task.CompletedTask;
        if (items.Length == 1) return OpenTimelineItem(items[0]);
        var list = Ui.List(new ObservableCollection<RowItem>(items), item => Run(() => OpenTimelineItem(item)));
        list.MaxHeight = 400;
        ShowOverlay(date.ToString("dddd, MMMM d"), list, true);
        return Task.CompletedTask;
    }

    private Task OpenTimelineItem(RowItem item) => item.Kind == "task" ? TaskDrawer(item.Id) : SubscriptionDetails(item.Id);
}

public sealed record GanttItem(RowItem Item, string Title, string Dates, double Start, double Span, double? Today, uint Colour);
public sealed class GanttGroup(string name, IEnumerable<GanttItem> rows) : ObservableCollection<GanttItem>(rows)
{
    public string Name { get; } = name;
}
