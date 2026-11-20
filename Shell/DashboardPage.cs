using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using NovaTaskflow.Api;
using NovaTaskflow.Controls;
using System.Text.Json;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow
{
    private async Task Dashboard(WorkspacePage page, CancellationToken cancellation)
    {
        page.Title = "Overview";
        page.Subtitle = DateTime.Now.ToString("dddd, MMMM d");
        page.ActionItems.Add(Ui.Button("Timeline", () => Go("Timeline")));
        page.ActionItems.Add(Ui.Button("New note", () => Go("Note", "new"), true));
        var data = await api.Get("/api/dashboard", cancellation);
        var recovery = data.Field("continue");
        var metrics = data.Field("metrics");
        var meta = metrics.Field("_meta");
        var recentProject = recovery.Field("lastProject");
        var recentBoard = recovery.Field("lastWhiteboard");
        var due = recovery.Items("dueToday").ToArray();
        var charges = data.Field("subscriptions");
        var resume = Ui.Stack(Ui.Section("Continue working"));
        resume.Children.Add(
            FollowCard("Last project", recentProject.Text("name", "No project yet"),
                recentProject.Id().Length > 0 ? Ui.DateLabel(recentProject.Text("updatedAt")) : "",
                recentProject.Id().Length > 0 ? "Open project" : "Create a project",
                () => recentProject.Id().Length > 0 ? Go("Project", recentProject.Id()) : ProjectForm(default)));
        resume.Children.Add(
            FollowCard("Last whiteboard", recentBoard.Text("title", "No whiteboard yet"),
                recentBoard.Id().Length > 0 ? Ui.DateLabel(recentBoard.Text("lastEditedAt")) : "", "Open whiteboards",
                () => recentBoard.Id().Length > 0 ? Go("Board", recentBoard.Id()) : Go("Whiteboard")));
        var agenda = Ui.Stack(Ui.Section("Today's agenda"));
        if (due.Length == 0)
        {
            agenda.Children.Add(Ui.Subtitle("No tasks are due today."));
            agenda.Children.Add(Ui.Button("View timeline", () => OpenTimeline(DateTime.Today)));
        }
        foreach (var task in due.Take(6))
        {
            var open = Ui.Button(task.Text("title", "Open task"), () => TaskDrawer(task.Id()));
            open.HorizontalAlignment = HorizontalAlignment.Stretch;
            open.HorizontalContentAlignment = HorizontalAlignment.Stretch;
            var text = Ui.Stack(Ui.Text(task.Text("title", "Untitled task")), Ui.Subtitle(task.Field("project").Text("name", task.Text("projectName"))));
            text.Spacing = 3;
            var row = new Grid { ColumnSpacing = 9, Padding = new Thickness(0, 3, 0, 3) };
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            row.ColumnDefinitions.Add(new ColumnDefinition());
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            row.Children.Add(new Border { Style = Ui.Style("NovaIconTile"), Child = new FontIcon { Glyph = "\uE9D5", FontSize = 14 } });
            Grid.SetColumn(text, 1); row.Children.Add(text);
            var details = Ui.Subtitle(task.Text("status", "Due today"));
            details.VerticalAlignment = VerticalAlignment.Center;
            Grid.SetColumn(details, 2); row.Children.Add(details);
            open.Content = row;
            Ui.Name(open, task.Text("title", "Open task"));
            agenda.Children.Add(open);
        }
        if (due.Length > 6) agenda.Children.Add(Ui.Button($"View all {due.Length} tasks", () => OpenTimeline(DateTime.Today)));
        var overdue = charges.Number("overdueCount");
        var stats = TileGrid(
            Metric("Tasks due today", metrics.Text("tasksDueToday", "0"), $"{meta.Number("totalTasks")} assigned overall",
                () => OpenTimeline(DateTime.Today)),
            Metric("Active projects", metrics.Text("activeProjectsCount", "0"), "", () => Go("Projects")),
            Metric("Productivity score", metrics.Text("productivityPercentage", "0") + "%",
                $"{meta.Number("completedSubtasks")} / {meta.Number("totalSubtasks")} subtasks", () => Go("Projects")),
            Metric("Due in 30 days", Totals(charges, "dueIn30Days"), overdue > 0
                ? $"{overdue} overdue to review" : "Upcoming charges", () => OpenSubscriptions(overdue > 0 ? "Overdue" : "All")));
        var urgent = Ui.Stack(Ui.Section("Urgent tasks"));
        foreach (var task in data.Items("urgentTasks"))
        {
            var title = task.Text("title", "Untitled task");
            var details = string.Join(" · ", new[] { task.Text("projectName"), task.Text("priority"), task.Text("dueLabel") }
                .Where(value => value.Length > 0));
            urgent.Children.Add(FollowCard(title, details, "", "Open task", () => TaskDrawer(task.Id())));
        }
        if (urgent.Children.Count == 1) urgent.Children.Add(Ui.Subtitle("No urgent tasks."));

        var coming = Ui.Stack(Ui.Section("Coming up"), Ui.Subtitle("Monthly cost · " + Totals(charges, "monthly")),
            Ui.Button("View all subscriptions", () => Go("Subscriptions")));
        if (overdue > 0)
        {
            coming.Children.Add(Ui.Subtitle($"{overdue} subscriptions passed their saved charge date."));
            coming.Children.Add(Ui.Button("Review and renew", () => OpenSubscriptions("Overdue"), true));
        }
        var upcoming = charges.Items("upcoming").Take(4).ToArray();
        foreach (var item in upcoming)
        {
            var charge = item;
            coming.Children.Add(Ui.Button($"{charge.Text("service")}  ·  {ChargeTiming(charge)}  ·  {Ui.Money(charge)}",
                () => SubscriptionDetails(charge.Id())));
        }
        if (upcoming.Length == 0) coming.Children.Add(Ui.Subtitle("No upcoming charges."));
        var lower = Ui.AdaptiveColumns(760, Activity(data.Field("activity"), "Recent activity"), Ui.Card(coming));
        var brand = new Image
        {
            Source = (ImageSource)Application.Current.Resources["NovaLogo"], Width = 154, Height = 154,
            Opacity = .15, IsHitTestVisible = false, HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0, 0, 1, 3)
        };
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetAccessibilityView(brand,
            Microsoft.UI.Xaml.Automation.Peers.AccessibilityView.Raw);
        var agendaSurface = new Grid();
        agendaSurface.Children.Add(brand);
        agendaSurface.Children.Add(agenda);
        var today = Ui.Card(agendaSurface);
        today.Style = Ui.Style("NovaHeroCard");
        var work = Ui.AdaptiveColumns(680, today, Ui.Card(resume));
        var content = Ui.Stack(work, stats, Ui.Card(urgent), lower);
        content.Spacing = 13;
        page.Body = Ui.Scroll(content);
    }

    private Button FollowCard(string title, string name, string detail, string button, Func<Task> action, double? progress = null)
    {
        var open = Ui.Button(button, action);
        open.HorizontalAlignment = HorizontalAlignment.Stretch;
        open.HorizontalContentAlignment = HorizontalAlignment.Stretch;
        var info = Ui.Stack(Ui.Subtitle(title), Ui.Text(name, size: 16));
        info.Spacing = 4;
        if (detail.Length > 0) info.Children.Add(Ui.Subtitle(detail));
        if (progress is { } value)
        {
            var bar = new ProgressBar { Minimum = 0, Maximum = 1, Value = Math.Clamp(value, 0, 1), Height = 5, Margin = new Thickness(0, 4, 0, 1) };
            Ui.Name(bar, "Task completion");
            info.Children.Add(bar);
        }
        var row = new Grid { ColumnSpacing = 10 };
        row.ColumnDefinitions.Add(new ColumnDefinition());
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        row.Children.Add(info);
        var arrow = new FontIcon { Glyph = "\uE76C", FontSize = 12, VerticalAlignment = VerticalAlignment.Center };
        Grid.SetColumn(arrow, 1);
        row.Children.Add(arrow);
        open.Content = row;
        Ui.Name(open, button + ": " + name);
        return open;
    }

    private static FrameworkElement Metric(string name, string value, string detail, Func<Task>? open = null)
    {
        var glyph = name switch
        {
            "Tasks due today" => "\uE787", "Active projects" or "Projects" => "\uE8B7",
            "Productivity score" or "Calls today" => "\uE9D9", "Due in 30 days" => "\uE8C7",
            "Total accounts" => "\uE716", "Whiteboards" => "\uE70F", "Open tickets" => "\uE897",
            _ => "\uE9D5"
        };
        var icon = new Border { Style = Ui.Style("NovaIconTile"), Child = new FontIcon { Glyph = glyph, FontSize = 16 } };
        var head = new Grid();
        head.ColumnDefinitions.Add(new ColumnDefinition());
        head.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var label = Ui.Subtitle(name);
        label.VerticalAlignment = VerticalAlignment.Center;
        head.Children.Add(label);
        FrameworkElement end = icon;
        if (open is not null)
        {
            var arrow = new FontIcon { Glyph = "\uE76C", FontSize = 10, VerticalAlignment = VerticalAlignment.Center };
            var buttons = Ui.Row(icon, arrow);
            buttons.Spacing = 8;
            end = buttons;
        }
        Grid.SetColumn(end, 1); head.Children.Add(end);
        var metric = Ui.Text(value, size: 31);
        metric.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
        var content = Ui.Stack(head, metric);
        if (detail.Length > 0) content.Children.Add(Ui.Subtitle(detail));
        if (open is null) return Ui.Card(content);
        var button = Ui.Button(name, open);
        button.Content = content;
        button.Style = Ui.Style("NovaMetricButton");
        Ui.Name(button, $"{name}, {value}");
        return button;
    }

    private static Grid TileGrid(params FrameworkElement[] tiles)
    {
        var grid = new Grid { ColumnSpacing = 12, RowSpacing = 10 };
        for (var index = 0; index < tiles.Length; index++)
        {
            grid.ColumnDefinitions.Add(new());
            Grid.SetColumn(tiles[index], index);
            grid.Children.Add(tiles[index]);
        }
        var previousColumns = tiles.Length;
        grid.SizeChanged += (_, args) =>
        {
            var columns = Math.Clamp((int)((args.NewSize.Width + 12) / 208), 1, tiles.Length);
            if (columns == previousColumns) return;
            previousColumns = columns;
            grid.ColumnDefinitions.Clear();
            grid.RowDefinitions.Clear();
            for (var column = 0; column < columns; column++) grid.ColumnDefinitions.Add(new());
            for (var row = 0; row < (tiles.Length + columns - 1) / columns; row++)
                grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            for (var index = 0; index < tiles.Length; index++)
            {
                Grid.SetColumn(tiles[index], index % columns);
                Grid.SetRow(tiles[index], index / columns);
            }
        };
        return grid;
    }

    private Border Activity(JsonElement data, string title)
    {
        var panel = Ui.Stack(Ui.Section(title));
        var graph = new Grid { ColumnSpacing = 3, RowSpacing = 3, HorizontalAlignment = HorizontalAlignment.Left };
        for (var row = 0; row < 7; row++) graph.RowDefinitions.Add(new RowDefinition { Height = new GridLength(13) });
        const int weeks = 36;
        for (var col = 0; col < weeks; col++) graph.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(13) });
        var today = DateTime.Today;
        var start = today.AddDays(-((int)today.DayOfWeek + 6) % 7 - (weeks - 1) * 7);
        for (var index = 0; index < weeks * 7; index++)
        {
            var day = start.AddDays(index);
            if (day > today) break;
            var tasks = data.Items(day.ToString("yyyy-MM-dd")).Count();
            var cell = new Border
            {
                CornerRadius = new CornerRadius(3),
                Background = new SolidColorBrush(ColorHelper.FromArgb((byte)(tasks == 0 ? 33 : Math.Min(255, 85 + tasks * 36)), 230, 106, 23))
            };
            ToolTipService.SetToolTip(cell, $"{day:MMM d}: {tasks} tasks");
            if (tasks > 0)
            {
                var button = new Button { Content = cell, Padding = new Thickness(0), MinWidth = 0, MinHeight = 0,
                    HorizontalContentAlignment = HorizontalAlignment.Stretch, VerticalContentAlignment = VerticalAlignment.Stretch,
                    Background = new SolidColorBrush(Colors.Transparent), BorderThickness = new Thickness(0) };
                Ui.Name(button, $"{day:MMM d}: {tasks} tasks");
                button.Click += (_, _) => Run(() => OpenTimeline(day));
                Grid.SetRow(button, index % 7); Grid.SetColumn(button, index / 7); graph.Children.Add(button);
            }
            else { Grid.SetRow(cell, index % 7); Grid.SetColumn(cell, index / 7); graph.Children.Add(cell); }
        }
        panel.Children.Add(new ScrollViewer { Content = graph, HorizontalScrollMode = ScrollMode.Enabled,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, VerticalScrollMode = ScrollMode.Disabled });
        return Ui.Card(panel);
    }

    private static string Totals(JsonElement source, string field)
    {
        var grouped = source.Field(field);
        if (grouped.ValueKind == JsonValueKind.Object)
            return string.Join(" · ", grouped.EnumerateObject().Select(item => $"{item.Name} {item.Value}").DefaultIfEmpty("—"));
        return string.Join(" · ", source.Items(field).Select(Ui.Money).Where(value => value.Length > 0).DefaultIfEmpty("—"));
    }
}
