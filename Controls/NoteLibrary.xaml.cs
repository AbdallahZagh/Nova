using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Media;
using System.Collections.ObjectModel;

namespace NovaTaskflow.Controls;

public sealed record NoteCardCheck(string NoteId, string Id, string Title, bool Checked);
public sealed record NoteCardItem(string Id, string Title, string Preview, string Project, string Status, string Edited,
    string ChecklistCount, bool Pinned, Brush Surface, Brush Outline, NoteCardCheck[] Checks);

public sealed class NoteCardGroup(string title) : ObservableCollection<NoteCardItem>
{
    public string Title { get; } = title;
}

public sealed partial class NoteLibrary : UserControl
{
    private readonly NoteCardGroup pinned = new("Pinned");
    private readonly NoteCardGroup recent = new("Recent");
    private readonly CollectionViewSource view;
    internal event Action<string>? OpenRequested;
    internal event Action<string>? StickyRequested;
    internal event Action<string, FrameworkElement>? OptionsRequested;
    internal event Action<NoteCardCheck, bool>? ChecklistChanged;

    public NoteLibrary()
    {
        InitializeComponent();
        view = new CollectionViewSource { Source = new[] { pinned, recent }, IsSourceGrouped = true };
        Cards.ItemsSource = view.View;
        Cards.SizeChanged += (_, args) =>
        {
            if (args.NewSize.Width < 320 || Cards.ItemsPanelRoot is not ItemsWrapGrid panel) return;
            var columns = Math.Max(1, (int)(args.NewSize.Width / 236));
            panel.ItemWidth = Math.Floor((args.NewSize.Width - 2) / columns);
        };
    }

    internal void ShowItems(NoteCardItem[] notes)
    {
        Reconcile(pinned, notes.Where(item => item.Pinned).ToArray());
        Reconcile(recent, notes.Where(item => !item.Pinned).ToArray());
    }

    private static void Reconcile(NoteCardGroup items, NoteCardItem[] notes)
    {
        for (var index = 0; index < notes.Length; index++)
        {
            var next = notes[index];
            if (index >= items.Count) { items.Add(next); continue; }
            var current = items[index];
            if (current.Id != next.Id)
            {
                var earlier = items.IndexOf(items.Skip(index + 1).FirstOrDefault(item => item.Id == next.Id)!);
                if (earlier >= 0) items.Move(earlier, index);
                else { items.Insert(index, next); continue; }
                current = items[index];
            }
            if (current.Title != next.Title || current.Preview != next.Preview || current.Project != next.Project ||
                current.Status != next.Status || current.Edited != next.Edited || current.ChecklistCount != next.ChecklistCount ||
                !current.Checks.SequenceEqual(next.Checks) ||
                ((SolidColorBrush)current.Outline).Color != ((SolidColorBrush)next.Outline).Color ||
                ((SolidColorBrush)current.Surface).Color != ((SolidColorBrush)next.Surface).Color)
                items[index] = next;
        }
        while (items.Count > notes.Length) items.RemoveAt(items.Count - 1);
    }

    private void OnItemClick(object sender, ItemClickEventArgs args)
    {
        if (args.ClickedItem is NoteCardItem item) OpenRequested?.Invoke(item.Id);
    }

    private void OptionsClick(object sender, RoutedEventArgs args)
    {
        if (sender is FrameworkElement { DataContext: NoteCardItem item } anchor)
            OptionsRequested?.Invoke(item.Id, anchor);
    }

    private void StickyClick(object sender, RoutedEventArgs args)
    {
        if (sender is FrameworkElement { DataContext: NoteCardItem item })
            StickyRequested?.Invoke(item.Id);
    }

    private void ChecklistClicked(object sender, RoutedEventArgs args)
    {
        if (sender is CheckBox { DataContext: NoteCardCheck selected } check)
            ChecklistChanged?.Invoke(selected, check.IsChecked == true);
    }
}
