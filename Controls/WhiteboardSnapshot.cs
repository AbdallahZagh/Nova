using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.Text.Json;
using NovaTaskflow.Api;

namespace NovaTaskflow.Controls;

internal sealed record WhiteboardSnapshot(byte[] Bytes, int Width, int Height)
{
    internal static WhiteboardSnapshot Create(JsonElement document, bool dark)
    {
        var canvas = document.Field("canvas");
        var documentWidth = Math.Clamp(canvas.Number("width"), 600, 16000);
        var documentHeight = Math.Clamp(canvas.Number("height"), 420, 16000);
        var scale = Math.Min(1, 1600.0 / Math.Max(documentWidth, documentHeight));
        var width = Math.Max(1, (int)Math.Ceiling(documentWidth * scale));
        var height = Math.Max(1, (int)Math.Ceiling(documentHeight * scale));
        var paper = dark ? Color.FromArgb(33, 35, 41) : Color.FromArgb(249, 249, 251);
        using var bitmap = new Bitmap(width, height);
        using (var surface = Graphics.FromImage(bitmap))
        {
            surface.Clear(paper);
            surface.ScaleTransform((float)scale, (float)scale);
            surface.SmoothingMode = SmoothingMode.AntiAlias;
            surface.PixelOffsetMode = PixelOffsetMode.HighQuality;
            foreach (var row in document.Items("strokes"))
            {
                var stroke = row.Deserialize<BoardStroke>(BoardCanvas.JsonOptions);
                if (stroke is null || stroke.Points.Length == 0 || !double.IsFinite(stroke.Width) || stroke.Width <= 0) continue;
                var color = ToColor(stroke, paper);
                using var pen = new Pen(color, (float)Math.Clamp(stroke.Width, .3, 160))
                {
                    StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round
                };
                var points = stroke.Points.Where(point => double.IsFinite(point.X) && double.IsFinite(point.Y))
                    .Select(point => new PointF((float)point.X, (float)point.Y)).ToArray();
                if (points.Length == 1)
                {
                    using var fill = new SolidBrush(color);
                    surface.FillEllipse(fill, points[0].X - pen.Width / 2, points[0].Y - pen.Width / 2, pen.Width, pen.Width);
                }
                else if (points.Length > 1) surface.DrawLines(pen, points);
            }
        }
        using var stream = new MemoryStream();
        bitmap.Save(stream, ImageFormat.Png);
        return new WhiteboardSnapshot(stream.ToArray(), width, height);
    }

    private static Color ToColor(BoardStroke stroke, Color paper)
    {
        if (stroke.Tool == "eraser") return paper;
        if (!uint.TryParse(stroke.Color.TrimStart('#'), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var rgb))
            rgb = 0xE66A17;
        return Color.FromArgb(stroke.Tool == "highlighter" ? 119 : 255, (byte)(rgb >> 16), (byte)(rgb >> 8), (byte)rgb);
    }
}
