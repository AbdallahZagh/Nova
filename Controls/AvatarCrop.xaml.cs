using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media.Imaging;
using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

namespace NovaTaskflow.Controls;

public sealed partial class AvatarCrop : UserControl
{
    private readonly BitmapImage source = new();

    public AvatarCrop()
    {
        InitializeComponent();
        Photo.Source = source;
        Zoom.ValueChanged += (_, _) => FramePhoto();
        Horizontal.ValueChanged += (_, _) => FramePhoto();
        Vertical.ValueChanged += (_, _) => FramePhoto();
    }

    internal async Task Load(IRandomAccessStream file)
    {
        using var input = file.CloneStream();
        var metadata = await BitmapDecoder.CreateAsync(file);
        if (metadata.PixelWidth >= metadata.PixelHeight)
            source.DecodePixelWidth = (int)Math.Min(metadata.PixelWidth, 1600);
        else
            source.DecodePixelHeight = (int)Math.Min(metadata.PixelHeight, 1600);
        await source.SetSourceAsync(input);
        if (source.PixelWidth <= 0 || source.PixelHeight <= 0)
            throw new IOException("Choose a photo Nova can open.");
        FramePhoto();
    }

    private void FramePhoto()
    {
        if (source.PixelWidth <= 0 || source.PixelHeight <= 0) return;
        var factor = Math.Max(Preview.Width / source.PixelWidth, Preview.Height / source.PixelHeight) * Zoom.Value;
        Photo.Width = source.PixelWidth * factor;
        Photo.Height = source.PixelHeight * factor;
        var overflowX = Math.Max(0, Photo.Width - Preview.Width);
        var overflowY = Math.Max(0, Photo.Height - Preview.Height);
        Horizontal.IsEnabled = overflowX >= 1;
        Vertical.IsEnabled = overflowY >= 1;
        Canvas.SetLeft(Photo, -overflowX * Horizontal.Value / 100);
        Canvas.SetTop(Photo, -overflowY * Vertical.Value / 100);
    }

    internal async Task<byte[]> Encode()
    {
        var bitmap = new RenderTargetBitmap();
        await bitmap.RenderAsync(Preview);
        if (bitmap.PixelWidth == 0 || bitmap.PixelHeight == 0)
            throw new IOException("Nova could not capture the photo preview. Try selecting it again.");
        using var image = new InMemoryRandomAccessStream();
        var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, image);
        encoder.SetPixelData(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied,
            (uint)bitmap.PixelWidth, (uint)bitmap.PixelHeight, 96, 96, (await bitmap.GetPixelsAsync()).ToArray());
        await encoder.FlushAsync();
        image.Seek(0);
        using var output = new MemoryStream();
        await image.AsStreamForRead().CopyToAsync(output);
        return output.ToArray();
    }
}
