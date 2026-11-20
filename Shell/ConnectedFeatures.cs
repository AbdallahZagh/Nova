using System.Net.Http.Headers;
using Microsoft.UI.Xaml.Controls;
using NovaTaskflow.Api;
using NovaTaskflow.Controls;
using Windows.Storage;
using Windows.Storage.Pickers;
using Windows.System;
using WinRT.Interop;

namespace NovaTaskflow.Shell;

public sealed partial class ShellWindow
{
    private bool systemAiAvailable = true;
    private string? pendingNovaInvite;

    private void QueueNovaInvite(Uri uri)
    {
        if (quitting) return;
        ShowNova();
        if (NativeInviteToken(uri) is not { } token)
        {
            Toast("This Nova link does not identify a whiteboard invitation.", InfoBarSeverity.Warning);
            return;
        }
        pendingNovaInvite = token;
        if (workspaceReady && SignedIn) Run(OpenPendingNovaInvite);
        else if (!SignedIn) Toast("Sign in to open your whiteboard invitation.", InfoBarSeverity.Informational);
    }

    private async Task OpenPendingNovaInvite()
    {
        if (pendingNovaInvite is not { } token || !SignedIn) return;
        pendingNovaInvite = null;
        try { await PreviewInvite(token); }
        catch (OperationCanceledException) { }
        catch (Exception error) { Toast(error.Message, InfoBarSeverity.Error); }
    }

    private static string? NativeInviteToken(Uri uri)
    {
        if (uri.Scheme != "nova-taskflow" || uri.UserInfo.Length > 0 || !uri.IsDefaultPort ||
            uri.Query.Length > 0 || uri.Fragment.Length > 0) return null;
        var path = uri.Host.Length > 0 ? uri.Host + uri.AbsolutePath : uri.AbsolutePath.TrimStart('/');
        return InviteToken(path.TrimEnd('/'));
    }

    private static string? InviteToken(string path)
    {
        const string prefix = "whiteboard/join/";
        if (!path.StartsWith(prefix, StringComparison.Ordinal)) return null;
        var token = path[prefix.Length..];
        return token.Length is >= 8 and <= 200 && token.All(ch => char.IsAsciiLetterOrDigit(ch) || ch is '-' or '_') ? token : null;
    }
    private void ReactivateAccount(string address = "")
    {
        var email = AccountEmailInput(address);
        Drawer("Reactivate your account", Ui.Stack(email, ActionButton("Send verification code", () => BeginReactivation(email.Text), true)), true);
    }

    private async Task BeginReactivation(string email)
    {
        var address = AccountEmail(email);
        await api.Send(HttpMethod.Post, "/api/auth/reactivate", new { email = address }, anonymous: true);
        VerifyEmailCode("Verify account reactivation", address, "REACTIVATE", "Reactivate", async (response, _) =>
        {
            await CompleteSignIn(response);
            Toast("Account reactivated.");
        }, () => ReactivateAccount(address));
    }

    private void ReportProblem()
    {
        var sourcePage = route;
        var title = Ui.Input("Title");
        var description = Ui.Input("What happened?", multiline: true);
        var category = Ui.Choice("Category", TicketCategories, "BUG");
        var priority = Ui.Choice("Priority", TicketPriorities, "NORMAL");
        var attachment = Ui.Subtitle("");
        StorageFile? file = null;
        Drawer("Report a problem", Ui.Stack(title, description, Ui.Row(category, priority),
            ActionButton("Attach a screenshot", async () =>
            {
                var picker = new FileOpenPicker();
                foreach (var extension in new[] { ".png", ".jpg", ".jpeg", ".webp" }) picker.FileTypeFilter.Add(extension);
                InitializeWithWindow.Initialize(picker, handle);
                var picked = await picker.PickSingleFileAsync();
                if (picked is null) return;
                if ((await picked.GetBasicPropertiesAsync()).Size > 5 * 1024 * 1024) throw new InvalidOperationException("Choose a screenshot smaller than 5 MB.");
                file = picked;
                attachment.Text = file.Name;
            }),
            attachment,
            Ui.Button("Remove attachment", () => { file = null; attachment.Text = ""; return Task.CompletedTask; }),
            ActionButton("Submit report", async () =>
            {
                if (string.IsNullOrWhiteSpace(title.Text) || string.IsNullOrWhiteSpace(description.Text))
                    throw new InvalidOperationException("Enter a title and describe what happened.");
                using var form = new MultipartFormDataContent();
                form.Add(new StringContent(title.Text.Trim()), "title");
                form.Add(new StringContent(description.Text.Trim()), "body");
                form.Add(new StringContent(category.Selected()), "category");
                form.Add(new StringContent(priority.Selected()), "priority");
                form.Add(new StringContent(sourcePage), "route");
                form.Add(new StringContent("desktop"), "platform");
                form.Add(new StringContent(typeof(ShellWindow).Assembly.GetName().Version?.ToString(3) ?? ""), "appVersion");
                if (file is not null)
                {
                    var content = new StreamContent(await file.OpenStreamForReadAsync());
                    content.Headers.ContentType = MediaTypeHeaderValue.Parse(file.ContentType);
                    form.Add(content, "file", file.Name);
                }
                await api.Post("/api/support/tickets", form);
                await CloseOverlay();
                Toast("Support report submitted.");
            }, true)), width: 520);
    }

    private void OpenNovaLink(bool whiteboardOnly = false)
    {
        var link = Ui.Input(whiteboardOnly ? "Whiteboard invite" : "Nova link", placeholder: whiteboardOnly ? "Paste a whiteboard invite" : "Paste a board invite or agent connection");
        Drawer(whiteboardOnly ? "Join a whiteboard" : "Open a Nova link", Ui.Stack(link,
            ActionButton("Continue", async () =>
            {
                var input = link.Text.Trim();
                var origin = SafeExternalUri(Environment.GetEnvironmentVariable("NOVA_WEB_URL") ?? "https://nova-task-management.netlify.app");
                var apiOrigin = new Uri(api.Endpoint);
                if (Uri.TryCreate(input, UriKind.Absolute, out var uri) && NativeInviteToken(uri) is { } existingInvite)
                {
                    await PreviewInvite(existingInvite);
                    return;
                }
                if (uri is null || uri.Scheme is not ("https" or "http") || uri.UserInfo.Length > 0 ||
                    uri.GetLeftPart(UriPartial.Authority) != origin?.GetLeftPart(UriPartial.Authority) &&
                    uri.GetLeftPart(UriPartial.Authority) != apiOrigin.GetLeftPart(UriPartial.Authority))
                    throw new InvalidOperationException("Paste a link from this Nova workspace.");
                var path = uri.AbsolutePath.Trim('/');
                if (path.StartsWith("whiteboard/join/", StringComparison.Ordinal))
                {
                    if (InviteToken(path) is not { } token)
                        throw new InvalidOperationException("This whiteboard invite is incomplete.");
                    await PreviewInvite(token);
                    return;
                }
                if (!whiteboardOnly && path == "connect")
                {
                    var parameters = new Windows.Foundation.WwwFormUrlDecoder(uri.Query);
                    var request = parameters.FirstOrDefault(item => item.Name == "request")?.Value;
                    if (Guid.TryParse(request, out var id))
                    {
                        await ReviewConnection(id);
                        return;
                    }
                }
                throw new InvalidOperationException("This link does not identify a board invite or agent connection.");
            }, true)), true);
    }

    private async Task PreviewInvite(string token)
    {
        var path = "/api/whiteboard-invites/" + Ui.PathId(token);
        var body = Ui.Stack(Ui.Subtitle("Loading invitation…"));
        Drawer("Join whiteboard", body, true);
        var cancellation = overlayCancellation.Token;
        try
        {
            var invite = await api.Get(path, cancellation);
            cancellation.ThrowIfCancellationRequested();
            body.Children.Clear();
            body.Children.Add(Ui.Section(invite.Text("title", "Whiteboard")));
            body.Children.Add(Ui.Subtitle($"Invitation role · {Label(invite.Text("role"))}"));
            body.Children.Add(ActionButton("Accept invitation", async () =>
            {
                var savePage = leavePage;
                if (savePage is not null && !await savePage()) return;
                cancellation.ThrowIfCancellationRequested();
                var board = await api.Post(path + "/accept", cancellation: cancellation);
                cancellation.ThrowIfCancellationRequested();
                if (board.Id().Length == 0) throw new InvalidOperationException("Nova did not return the joined whiteboard.");
                if (ReferenceEquals(leavePage, savePage)) leavePage = null;
                await Go("Board", board.Id());
            }, true));
        }
        catch (Exception error) when (!cancellation.IsCancellationRequested && error is ApiFailure or IOException)
        {
            body.Children.Clear();
            body.Children.Add(Ui.Text(error.Message));
            if (error is not ApiFailure { Status: System.Net.HttpStatusCode.BadRequest or System.Net.HttpStatusCode.NotFound })
                body.Children.Add(Ui.Button("Try again", () => PreviewInvite(token)));
        }
    }

    private async Task ReviewConnection(Guid id)
    {
        var path = $"/api/oauth/requests/{id:D}";
        var request = await api.Send(HttpMethod.Get, path, anonymous: true, cancellation: overlayCancellation.Token);
        Drawer("Connect an agent", Ui.Stack(Ui.Section(request.Text("clientName", "Agent")),
            Ui.Subtitle($"Signed in as {PersonName.Text}"),
            Ui.Subtitle($"Returns to {request.Text("redirectHost")}"),
            Ui.Subtitle($"Request expires {DateStamp(request.Text("expiresAt"))}"),
            Ui.Row(ActionButton("Deny", () => Decide(false)), ActionButton("Allow", () => Decide(true), true))), true);

        async Task Decide(bool allow)
        {
            var response = await api.Send(HttpMethod.Post, path + (allow ? "/approve" : "/deny"), anonymous: !allow);
            var callback = SafeExternalUri(response.Text("redirectTo"));
            if (callback is null || callback.Authority != request.Text("redirectHost") ||
                (callback.Scheme != "https" && !callback.IsLoopback))
                throw new InvalidOperationException("Nova returned an invalid agent callback.");
            if (!await Launcher.LaunchUriAsync(callback)) throw new InvalidOperationException("Windows could not return to the agent.");
            await CloseOverlay();
            Toast(allow ? "Connection approved." : "Connection denied.");
        }
    }

    private async Task RefreshSystemStatus(CancellationToken cancellation)
    {
        var status = await api.Send(HttpMethod.Get, "/api/system/status", anonymous: true, cancellation: cancellation);
        cancellation.ThrowIfCancellationRequested();
        var banner = status.Text("banner");
        var maintenance = status.Flag("maintenanceMode");
        systemAiAvailable = status.Field("aiEnabled").ValueKind != System.Text.Json.JsonValueKind.False;
        SystemBanner.Title = maintenance ? "Nova is in maintenance mode" : "Workspace announcement";
        SystemBanner.Message = banner;
        SystemBanner.Severity = maintenance ? InfoBarSeverity.Warning : InfoBarSeverity.Informational;
        SystemBanner.IsOpen = maintenance || banner.Length > 0;
    }
}
