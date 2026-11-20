using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;
using System.Text.Json;
using Windows.Foundation;
using Windows.System;
using NovaTaskflow.Live;

namespace NovaTaskflow.Controls;

internal sealed record BoardPoint(double X, double Y, long T, float? Pressure = null)
{
    internal Point Position => new(X, Y);
}

internal sealed record BoardStroke(string Id, BoardPoint[] Points, string Color, double Width, string Tool);
internal sealed record BoardChange(BoardStroke[] Added, BoardStroke[] Removed);

public sealed partial class BoardCanvas : UserControl
{
    private readonly Dictionary<string, BoardStroke> strokes = new();
    private readonly Dictionary<string, Shape> shapes = new();
    private readonly List<BoardPoint> drawing = [];
    private readonly HashSet<string> selected = [];
    private readonly Dictionary<string, Border> peerLabels = new();
    private Shape? preview;
    private Point? pan;
    private double panX, panY;
    private bool space;
    internal string Tool { get; set; } = "Pen";
    internal string Ink { get; set; } = "#E66A17";
    internal double StrokeWidth { get; set; } = 4;
    internal bool ReadOnly { get; set; }
    internal bool Editing => drawing.Count > 0 || pan.HasValue;
    internal event Action<BoardChange>? Changed;
    internal event Action<Point, bool>? TextRequested;
    internal event Action<Point?>? CursorMoved;
    internal event Action<double>? ZoomChanged;
    internal UIElement DrawingSurface => Paper;
    internal double DocumentWidth => Paper.Width;
    internal double DocumentHeight => Paper.Height;

    public BoardCanvas()
    {
        InitializeComponent();
        Paper.PointerPressed += Pressed;
        Paper.PointerMoved += Moved;
        Paper.PointerReleased += Released;
        Paper.PointerExited += (_, _) => CursorMoved?.Invoke(null);
        Viewport.ViewChanged += (_, _) => ZoomChanged?.Invoke(Viewport.ZoomFactor);
        Paper.PointerCaptureLost += (_, _) => ClearGesture();
        Paper.KeyDown += (_, args) =>
        {
            if (args.Key == VirtualKey.Space) { space = true; args.Handled = true; }
            if (args.Key == VirtualKey.Delete && !ReadOnly) { RemoveSelection(); args.Handled = true; }
        };
        Paper.KeyUp += (_, args) => { if (args.Key == VirtualKey.Space) space = false; };
        Paper.LostFocus += (_, _) => space = false;
        Paper.PointerWheelChanged += (_, args) =>
        {
            if ((args.KeyModifiers & VirtualKeyModifiers.Control) == 0) return;
            var m = args.GetCurrentPoint(Paper).Properties.MouseWheelDelta;
            ZoomBy(m > 0 ? 1.12f : 0.89f);
            args.Handled = true;
        };
    }

    internal void ZoomBy(float factor) => Viewport.ChangeView(null, null, Math.Clamp(Viewport.ZoomFactor * factor, .16f, 4));

    internal void FitPage()
    {
        var fit = Math.Min((Viewport.ViewportWidth - 18) / DocumentWidth, (Viewport.ViewportHeight - 18) / DocumentHeight);
        Viewport.ChangeView(0, 0, (float)Math.Clamp(fit, .16, 1));
    }

    internal void KeepPeers(IEnumerable<BoardPresence> peers)
    {
        var active = peers.Select(peer => peer.Key).ToHashSet();
        foreach (var key in peerLabels.Keys.Where(key => !active.Contains(key)).ToArray()) RemovePeer(key);
    }

    internal void ShowPeer(BoardPresence peer)
    {
        if (peer.X is not { } x || peer.Y is not { } y || x < 0 || y < 0 || x > DocumentWidth || y > DocumentHeight)
        {
            RemovePeer(peer.Key);
            return;
        }
        if (!peerLabels.TryGetValue(peer.Key, out var label))
        {
            var name = peer.Name.Length > 28 ? peer.Name[..28] : peer.Name;
            label = Ui.Card(Ui.Text(name, size: 12));
            label.Padding = new Thickness(7, 4, 7, 4);
            label.CornerRadius = new CornerRadius(7);
            if (uint.TryParse(peer.Color.TrimStart('#'), System.Globalization.NumberStyles.HexNumber,
                    System.Globalization.CultureInfo.InvariantCulture, out var color))
                label.BorderBrush = new SolidColorBrush(Ui.Rgb(color));
            peerLabels.Add(peer.Key, label);
            PeerLayer.Children.Add(label);
        }
        Canvas.SetLeft(label, Math.Clamp(x + 8, 0, Math.Max(0, DocumentWidth - label.ActualWidth)));
        Canvas.SetTop(label, Math.Clamp(y + 9, 0, Math.Max(0, DocumentHeight - label.ActualHeight)));
    }

    private void RemovePeer(string key)
    {
        if (peerLabels.Remove(key, out var label)) PeerLayer.Children.Remove(label);
    }

    internal void LoadDocument(IEnumerable<BoardStroke> items, double width, double height)
    {
        strokes.Clear();
        shapes.Clear();
        selected.Clear();
        Paper.Children.Clear();
        Paper.Width = Math.Clamp(width, 280, 10000);
        Paper.Height = Math.Clamp(height, 280, 10000);
        Apply(new(items.ToArray(), []));
    }

    internal void Apply(BoardChange change)
    {
        foreach (var item in change.Removed)
        {
            strokes.Remove(item.Id);
            selected.Remove(item.Id);
            if (shapes.Remove(item.Id, out var shape)) Paper.Children.Remove(shape);
        }
        foreach (var item in change.Added)
        {
            if (shapes.Remove(item.Id, out var previous)) Paper.Children.Remove(previous);
            strokes[item.Id] = item;
            var shape = Draw(item);
            if (shape is null) continue;
            Paper.Children.Add(shape);
            shapes[item.Id] = shape;
        }
    }

    private void Pressed(object sender, PointerRoutedEventArgs args)
    {
        var origin = args.GetCurrentPoint(Paper);
        if (origin.Properties.IsMiddleButtonPressed || (space && origin.Properties.IsLeftButtonPressed))
        {
            pan = args.GetCurrentPoint(Viewport).Position;
            panX = Viewport.HorizontalOffset;
            panY = Viewport.VerticalOffset;
        }
        else
        {
            Paper.Focus(FocusState.Pointer);
            if (ReadOnly || !origin.Properties.IsLeftButtonPressed) return;
            if (Tool == "Select")
            {
                Select(Hit(origin.Position));
                return;
            }
            if (Tool is "Text" or "Sticky")
            {
                TextRequested?.Invoke(origin.Position, Tool == "Sticky");
                return;
            }
            drawing.Add(PointOf(origin.Position));
        }
        Paper.CapturePointer(args.Pointer);
        args.Handled = true;
    }

    private void Moved(object sender, PointerRoutedEventArgs args)
    {
        var atPaper = args.GetCurrentPoint(Paper).Position;
        CursorMoved?.Invoke(atPaper);
        if (pan is Point start)
        {
            var point = args.GetCurrentPoint(Viewport).Position;
            Viewport.ChangeView(Math.Max(0, panX - point.X + start.X), Math.Max(0, panY - point.Y + start.Y), null, true);
            return;
        }
        if (drawing.Count == 0) return;
        var at = PointOf(atPaper);
        var last = drawing[^1];
        if (Math.Abs(at.X - last.X) + Math.Abs(at.Y - last.Y) < 1.5) return;
        drawing.Add(at);
        if (preview is not null) Paper.Children.Remove(preview);
        preview = Draw(CreateStroke());
        if (preview is not null) Paper.Children.Add(preview);
    }

    private void Released(object sender, PointerRoutedEventArgs args)
    {
        if (drawing.Count > 0)
        {
            var final = PointOf(args.GetCurrentPoint(Paper).Position);
            if (drawing[^1].Position != final.Position) drawing.Add(final);
            var change = Tool == "Eraser"
                ? new BoardChange([], drawing.SelectMany(point => Hit(point.Position)).DistinctBy(stroke => stroke.Id).ToArray())
                : new BoardChange([CreateStroke()], []);
            if (change.Added.Length + change.Removed.Length > 0) Changed?.Invoke(change);
        }
        ClearGesture();
        Paper.ReleasePointerCapture(args.Pointer);
    }

    private void ClearGesture()
    {
        pan = null;
        drawing.Clear();
        if (preview is not null) Paper.Children.Remove(preview);
        preview = null;
    }

    private BoardStroke CreateStroke()
    {
        var first = drawing[0];
        var last = drawing[^1];
        BoardPoint At(double x, double y) => new(x, y, last.T);
        BoardPoint[] points = Tool switch
        {
            "Line" => [first, last],
            "Rectangle" => [first, At(last.X, first.Y), last, At(first.X, last.Y), first],
            "Ellipse" => Enumerable.Range(0, 49).Select(i =>
            {
                var theta = i * Math.PI / 24;
                return At((first.X + last.X) / 2 + Math.Cos(theta) * (last.X - first.X) / 2,
                    (first.Y + last.Y) / 2 + Math.Sin(theta) * (last.Y - first.Y) / 2);
            }).ToArray(),
            _ => drawing.ToArray()
        };
        return new(Guid.NewGuid().ToString(), points, Ink, StrokeWidth,
            Tool == "Highlighter" ? "highlighter" : Tool == "Eraser" ? "eraser" : "pen");
    }

    internal void AddText(Point start, string text, bool sticky)
    {
        using var font = new System.Drawing.FontFamily("Segoe UI");
        using var path = new System.Drawing.Drawing2D.GraphicsPath();
        path.AddString(text, font, 0, 25, new System.Drawing.PointF((float)start.X + 12, (float)start.Y + 10), System.Drawing.StringFormat.GenericDefault);
        path.Flatten(null, 0.9f);
        var output = new List<BoardStroke>();
        var group = Guid.NewGuid().ToString("N");
        if (sticky)
        {
            var rectangle = path.GetBounds();
            double right = start.X + Math.Max(rectangle.Width + 25, 156);
            double bottom = start.Y + Math.Max(rectangle.Height + 30, 70);
            output.Add(new(group + ":border", [PointOf(start), PointOf(new(right, start.Y)), PointOf(new(right, bottom)),
                PointOf(new(start.X, bottom)), PointOf(start)], "#E0AA46", 4, "pen"));
        }
        var points = new List<BoardPoint>();
        var count = 0;
        var vertices = path.PathPoints;
        var types = path.PathTypes;
        for (var index = 0; index < vertices.Length; index++)
        {
            if ((types[index] & 0x07) == 0 && points.Count > 0) Commit();
            points.Add(PointOf(new(vertices[index].X, vertices[index].Y)));
            if ((types[index] & 0x80) != 0) { points.Add(points[0]); Commit(); }
        }
        if (points.Count > 0) Commit();
        if (output.Count > 0) Changed?.Invoke(new(output.ToArray(), []));

        void Commit()
        {
            output.Add(new(group + ":" + count++, points.ToArray(), Ink, 1.6, "pen"));
            points.Clear();
        }
    }

    private static BoardPoint PointOf(Point point) => new(point.X, point.Y, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());

    private static Shape? Draw(BoardStroke stroke)
    {
        if (stroke.Points.Length == 0 || stroke.Tool == "eraser") return null;
        var color = Hex(stroke.Color);
        var opacity = stroke.Tool == "highlighter" ? 0.46 : 1;
        if (stroke.Points.Length == 1)
        {
            var point = stroke.Points[0];
            var dot = new Ellipse { Width = stroke.Width, Height = stroke.Width, Fill = new SolidColorBrush(color),
                IsHitTestVisible = false, Opacity = opacity };
            Canvas.SetLeft(dot, point.X - stroke.Width / 2);
            Canvas.SetTop(dot, point.Y - stroke.Width / 2);
            return dot;
        }
        var line = new Polyline { Stroke = new SolidColorBrush(color), StrokeThickness = stroke.Width,
            StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round, StrokeLineJoin = PenLineJoin.Round,
            IsHitTestVisible = false, Opacity = opacity, Points = new PointCollection() };
        foreach (var point in stroke.Points) line.Points.Add(point.Position);
        return line;
    }

    private static Windows.UI.Color Hex(string code)
    {
        return uint.TryParse(code.TrimStart('#'), System.Globalization.NumberStyles.HexNumber, null, out var value)
            ? ColorHelper.FromArgb(255, (byte)(value >> 16), (byte)(value >> 8), (byte)value) : Colors.Orange;
    }

    private IEnumerable<BoardStroke> Hit(Point point)
        => strokes.Values.Where(stroke =>
        {
            var threshold = Math.Max(12, stroke.Width / 2 + (Tool == "Eraser" ? StrokeWidth / 2 : 0));
            var points = stroke.Points;
            for (var i = 0; i < points.Length; i++)
            {
                var first = points[i].Position;
                var second = points[Math.Min(i + 1, points.Length - 1)].Position;
                var segment = new Point(second.X - first.X, second.Y - first.Y);
                var length = segment.X * segment.X + segment.Y * segment.Y;
                var scale = length == 0 ? 0 : Math.Clamp(((point.X - first.X) * segment.X + (point.Y - first.Y) * segment.Y) / length, 0, 1);
                var offset = new Point(point.X - first.X - scale * segment.X, point.Y - first.Y - scale * segment.Y);
                if (offset.X * offset.X + offset.Y * offset.Y <= threshold * threshold) return true;
            }
            return false;
        });

    private void Select(IEnumerable<BoardStroke> hits)
    {
        foreach (var id in selected) if (shapes.TryGetValue(id, out var shape)) shape.Opacity = strokes[id].Tool == "highlighter" ? 0.46 : 1;
        selected.Clear();
        var hit = hits.LastOrDefault();
        if (hit is null) return;
        var separator = hit.Id.IndexOf(':');
        var ids = separator < 0 ? new[] { hit.Id } : strokes.Keys.Where(id => id.StartsWith(hit.Id[..(separator + 1)], StringComparison.Ordinal)).ToArray();
        foreach (var id in ids)
        {
            selected.Add(id);
            if (shapes.TryGetValue(id, out var shape)) shape.Opacity = 0.47;
        }
    }

    internal void ClearPage()
    {
        if (!ReadOnly && strokes.Count > 0) Changed?.Invoke(new([], strokes.Values.ToArray()));
    }

    private void RemoveSelection()
    {
        var items = selected.Where(strokes.ContainsKey).Select(id => strokes[id]).ToArray();
        if (items.Length > 0) Changed?.Invoke(new([], items));
    }

    internal static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };
}
