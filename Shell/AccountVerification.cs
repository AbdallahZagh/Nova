using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using NovaTaskflow.Api;
using NovaTaskflow.Controls;
using System.Text.Json;
using Windows.ApplicationModel.DataTransfer;
using Windows.System;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow
{
    private void VerifyEmailCode(string title, string address, string purpose, string action,
        Func<JsonElement, string, Task> verified, Action? changeEmail = null)
    {
        var code = Ui.Input("Verification code", placeholder: "6-digit code");
        code.MaxLength = 6;
        code.InputScope = new InputScope { Names = { new InputScopeName(InputScopeNameValue.Number) } };
        code.BeforeTextChanging += (_, args) => args.Cancel = args.NewText.Any(ch => !char.IsAsciiDigit(ch));

        var cancellation = CancellationToken.None;
        var sending = false;
        var verifying = false;
        var resendAt = DateTimeOffset.UtcNow.AddSeconds(30);
        var timer = DispatcherQueue.CreateTimer();
        timer.Interval = TimeSpan.FromSeconds(1);
        var proceed = Ui.Button(action, true);
        var resend = Ui.Button("Resend code");
        var error = new InfoBar { Severity = InfoBarSeverity.Error, IsClosable = false };
        proceed.Click += (_, _) => Run(Verify);
        resend.Click += (_, _) => Run(Resend);
        var actions = Ui.Wrap(proceed, resend);
        if (changeEmail is not null)
            actions.Children.Add(Ui.Button("Change email", () => { changeEmail(); return Task.CompletedTask; }));
        var body = Ui.Stack(Ui.Subtitle($"Enter the 6-digit code sent to {address}."), code, error, actions);
        code.TextChanged += (_, _) => { error.IsOpen = false; Update(); };
        code.Paste += (_, args) =>
        {
            args.Handled = true;
            if (!sending && !verifying) Run(PasteCode);
        };
        code.KeyDown += (_, args) =>
        {
            if (args.Key != VirtualKey.Enter || !proceed.IsEnabled) return;
            args.Handled = true;
            Run(Verify);
        };
        timer.Tick += (_, _) => Update();
        body.Loaded += (_, _) => { timer.Start(); code.Focus(FocusState.Programmatic); };
        body.Unloaded += (_, _) => timer.Stop();

        Drawer(title, body, true);
        cancellation = overlayCancellation.Token;
        Update();

        void Update()
        {
            var seconds = Math.Max(0, (int)Math.Ceiling((resendAt - DateTimeOffset.UtcNow).TotalSeconds));
            var valid = code.Text.Length == 6 && code.Text.All(char.IsAsciiDigit);
            proceed.IsEnabled = valid && !sending && !verifying;
            proceed.Content = verifying ? "Verifying…" : action;
            resend.IsEnabled = seconds == 0 && !sending && !verifying;
            resend.Content = sending ? "Sending…" : seconds > 0 ? $"Resend in {seconds}s" : "Resend code";
        }

        async Task Verify()
        {
            if (verifying || sending || code.Text.Length != 6 || code.Text.Any(ch => !char.IsAsciiDigit(ch))) return;
            verifying = true;
            error.IsOpen = false;
            Update();
            var value = code.Text;
            try
            {
                var response = await api.Send(HttpMethod.Post, "/api/auth/verify-otp",
                    new { email = address, code = value, purpose }, anonymous: true, cancellation: cancellation);
                cancellation.ThrowIfCancellationRequested();
                await verified(response, value);
            }
            catch (Exception failure) when (!cancellation.IsCancellationRequested && failure is ApiFailure or IOException)
            { ShowError(failure.Message); }
            finally { verifying = false; Update(); }
        }

        async Task Resend()
        {
            if (sending || verifying || DateTimeOffset.UtcNow < resendAt) return;
            sending = true;
            error.IsOpen = false;
            Update();
            try
            {
                await api.Send(HttpMethod.Post, "/api/auth/resend-otp",
                    new { email = address, purpose }, anonymous: true, cancellation: cancellation);
                cancellation.ThrowIfCancellationRequested();
                resendAt = DateTimeOffset.UtcNow.AddSeconds(30);
                code.Text = "";
                code.Focus(FocusState.Programmatic);
                Toast("A new code was sent.");
            }
            catch (Exception failure) when (!cancellation.IsCancellationRequested && failure is ApiFailure or IOException)
            { ShowError(failure.Message); }
            finally { sending = false; Update(); }
        }

        void ShowError(string message)
        {
            error.Message = message;
            error.IsOpen = true;
        }

        async Task PasteCode()
        {
            var clipboard = Clipboard.GetContent();
            if (!clipboard.Contains(StandardDataFormats.Text)) return;
            var pasted = VerificationDigits(await clipboard.GetTextAsync());
            cancellation.ThrowIfCancellationRequested();
            if (sending || verifying) return;
            if (pasted.Length == 0) { ShowError("Paste the six-digit code from your email."); return; }
            code.Text = pasted;
            code.Select(pasted.Length, 0);
        }
    }

    private static string VerificationDigits(string text) => string.Concat(text.Where(char.IsAsciiDigit).Take(6));
}
