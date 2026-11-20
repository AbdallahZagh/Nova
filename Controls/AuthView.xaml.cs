using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using NovaTaskflow.Api;
using Windows.System;

namespace NovaTaskflow.Controls;

public sealed partial class AuthView : UserControl
{
    internal event Func<string, string, Task>? SignIn;
    internal event Func<Task>? TryDemo;
    internal event Action? ForgotPassword;
    internal event Action? Reactivate;
    internal event Action? Register;
    internal event Action? ChangeTheme;

    public AuthView()
    {
        InitializeComponent();
        Submit.Click += async (_, _) => await SubmitLogin();
        Demo.Click += async (_, _) => await RunAsync(Demo, "Opening demo…", () => TryDemo!.Invoke());
        Forgot.Click += (_, _) => ForgotPassword?.Invoke();
        Restore.Click += (_, _) => Reactivate?.Invoke();
        CreateAccount.Click += (_, _) => Register?.Invoke();
        Theme.Click += (_, _) => ChangeTheme?.Invoke();
        Password.KeyDown += async (_, args) =>
        {
            if (args.Key != VirtualKey.Enter || !Submit.IsEnabled) return;
            args.Handled = true;
            await SubmitLogin();
        };
    }

    internal void ApplyTheme(bool light)
    {
        ThemeGlyph.Glyph = light ? "\uE708" : "\uE706";
        ToolTipService.SetToolTip(Theme, light ? "Switch to dark mode" : "Switch to light mode");
    }

    private void LayoutChanged(object sender, SizeChangedEventArgs args)
    {
        var compact = args.NewSize.Width < 850;
        BrandColumn.Width = new GridLength(compact ? 0 : 330);
        BrandPanel.Visibility = compact ? Visibility.Collapsed : Visibility.Visible;
        CompactLogo.Visibility = compact ? Visibility.Visible : Visibility.Collapsed;
    }

    internal void ShowError(string? error)
    {
        Error.Text = error ?? "";
        Error.Visibility = string.IsNullOrEmpty(error) ? Visibility.Collapsed : Visibility.Visible;
    }

    internal void ClearPassword() => Password.Password = "";

    private Task SubmitLogin()
    {
        if (string.IsNullOrWhiteSpace(Identifier.Text) || Password.Password.Length == 0)
        {
            ShowError("Enter your email or username and password.");
            return Task.CompletedTask;
        }
        return RunAsync(Submit, "Signing in…", () => SignIn!.Invoke(Identifier.Text.Trim(), Password.Password));
    }

    private async Task RunAsync(Button button, string label, Func<Task> action)
    {
        var previous = button.Content;
        Submit.IsEnabled = Demo.IsEnabled = false;
        button.Content = label;
        ShowError(null);
        try { await action(); }
        catch (ApiFailure error) { ShowError(error.Message); }
        catch (IOException) { ShowError("Unable to sign in. Check your connection and try again."); }
        catch (Exception error) { ShowError(error.Message); }
        finally
        {
            button.Content = previous;
            Submit.IsEnabled = Demo.IsEnabled = true;
        }
    }
}
