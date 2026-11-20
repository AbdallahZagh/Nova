using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using System.Text.Json;

namespace NovaTaskflow.Controls;

public sealed record ProjectCard(JsonElement Project, string Title, string Description, string Status,
    string Owner, ImageSource? Avatar, string Work, string Schedule, double Completion);

public sealed record BoardTaskCard(string Id, string Title, string Priority, Brush PriorityColor,
    string Due, string Checklist, IReadOnlyList<TaskPerson> People, string MorePeople, Visibility MorePeopleVisibility);

public sealed record TaskPerson(string Name, ImageSource? Avatar);

public sealed partial class ProjectLibrary : UserControl
{
    internal event Action<ProjectCard>? OpenRequested;
    internal event Action<ProjectCard>? OptionsRequested;
    internal IEnumerable<ProjectCard> Items { set => Cards.ItemsSource = value; }

    public ProjectLibrary()
    {
        InitializeComponent();
        Cards.Loaded += (_, _) => SizeCards();
        Cards.SizeChanged += (_, _) => SizeCards();
        Cards.RightTapped += (_, args) =>
        {
            if (args.OriginalSource is FrameworkElement { DataContext: ProjectCard card }) OptionsRequested?.Invoke(card);
        };
    }

    private void SizeCards()
    {
        if (Cards.ActualWidth <= 20 || Cards.ItemsPanelRoot is not ItemsWrapGrid panel) return;
        var columns = Math.Clamp((int)(Cards.ActualWidth / 308), 1, 4);
        panel.ItemWidth = Math.Floor((Cards.ActualWidth - 2) / columns);
    }

    private void OpenProject(object sender, ItemClickEventArgs args)
    {
        if (args.ClickedItem is ProjectCard card) OpenRequested?.Invoke(card);
    }

    private void ProjectOptions(object sender, RoutedEventArgs args)
    {
        if (sender is FrameworkElement { DataContext: ProjectCard card }) OptionsRequested?.Invoke(card);
    }
}
