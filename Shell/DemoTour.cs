using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using NovaTaskflow.Controls;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow
{
    private Task ShowDemoTour()
    {
        if (!Demo) return Task.CompletedTask;
        (string Title, string Detail, string Glyph, string? Page)[] steps =
        [
            ("Explore the Nova workspace", "See the work due today, recent activity, and your latest project and whiteboard.", "\uE80F", "Dashboard"),
            ("Run a project", "Move a task between columns, open it to edit its checklist, and reply in its comment thread.", "\uE8B7", "Projects"),
            ("Plan the week", "See task deadlines and upcoming charges together in Timeline. Switch between the calendar and Gantt chart.", "\uE787", "Timeline"),
            ("Draw together", "Open the sample whiteboard to draw, see other participants, and export a page.", "\uE70F", "Whiteboard"),
            ("Shared demo", "Other visitors can see the sample workspace. Use sample information. Some actions, including invites and AI, are disabled here.", "\uE946", null)
        ];
        var content = Ui.Stack();
        var index = 0;
        Drawer("Nova demo", content, true, 560);
        overlayClosed = () =>
        {
            settings.DemoTourSeen = true;
            settings.Save();
            return Task.CompletedTask;
        };
        Display();
        return Task.CompletedTask;

        void Display()
        {
            var step = steps[index];
            content.Children.Clear();
            var icon = new Border { Style = Ui.Style("NovaIconTile"), Child = new FontIcon { Glyph = step.Glyph, FontSize = 17 } };
            icon.HorizontalAlignment = HorizontalAlignment.Left;
            var card = Ui.Card(Ui.Stack(icon, Ui.Section(step.Title), Ui.Subtitle(step.Detail)));
            card.Style = Ui.Style("NovaHeroCard");
            content.Children.Add(card);
            var progress = new ProgressBar { Minimum = 0, Maximum = steps.Length, Value = index + 1, Height = 4 };
            Ui.Name(progress, $"Step {index + 1} of {steps.Length}");
            content.Children.Add(progress);
            var actions = Ui.Wrap();
            if (index > 0) actions.Children.Add(Ui.Button("Back", () => { index--; Display(); return Task.CompletedTask; }));
            if (step.Page is not null) actions.Children.Add(Ui.Button("Open " + step.Page, () => Go(step.Page)));
            if (index < steps.Length - 1)
                actions.Children.Add(Ui.Button("Next", () => { index++; Display(); return Task.CompletedTask; }, true));
            else actions.Children.Add(Ui.Button("Finish", CloseOverlay, true));
            content.Children.Add(actions);
        }
    }
}
