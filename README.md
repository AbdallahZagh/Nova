# Nova Taskflow Desktop

Native Windows 10/11 client for the existing Nova API. The app supports Windows 10 version 2004 and newer.

The workspace includes task and project management, the timeline, subscriptions, notes and floating stickies, notifications, profile, support, and whiteboards. **Administration** is available for Super Admins and includes system health, account management, demo sessions, the support inbox, announcements, AI quotas, and audit history. Join a whiteboard from its page or paste a board invite or an agent connection link under **Settings → Open a Nova link**.

## Run

Open PowerShell in this folder with the .NET 8 SDK available and run:

```powershell
dotnet build
dotnet run
```

On this workspace, the SDK is also available at `$env:LOCALAPPDATA\Microsoft\dotnet\dotnet.exe`.

The MSIX and portable release both bundle the .NET and Windows App SDK runtimes. The portable release can be built with:

```powershell
dotnet publish -c Release --self-contained true -o .\dist\NovaTaskflow
```

Open `dist\NovaTaskflow\NovaTaskflow.exe`. Closing the window sends it to the tray by default. Use **Ctrl+Alt+N** to show Nova and **Ctrl+Alt+S** to open the Stickies picker over your current app. Each sticky has its own window and uses the shared Nova note colors. It has an always-on-top toggle and saved monitor placement. Moving or resizing it also saves portable bounds to the shared note. The tray menu includes **Quit Nova**. The launch-at-sign-in setting is available under **Settings**.

Resize the main window to use the compact icon rail and stacked page layouts. Stickies can be resized from their edges or through **Sticky options → Window size**. Under **Settings → Appearance**, choose Light, Dark, or System to match Windows.

## Shared controls

`Themes/Nova.xaml` provides the shared palette and WinUI styles for buttons, text and password fields, search, dropdowns, date pickers, menus, and dialogs. Native controls keep Windows keyboard and accessibility behavior. Use `Ui` for controls built from C# and the same styles for XAML views. `TimelineCalendar` renders the workspace's day grid.

## Publish an MSIX

```powershell
dotnet publish -p:PublishProfile=NovaMsix
```

Package output is in `AppPackages`. Sign the package with a certificate whose subject matches the manifest publisher. For a development package signed with a self-signed certificate, install the public `.cer` in **Local Computer → Trusted People** before installing the MSIX. Verify installation with `Get-AppxPackage NovaTaskflow`. The portable release is available without package registration.

## Smoke tests

Debug builds provide a self-contained fixture test and a hosted demo test. Each uses a temporary profile. The hosted test reads workspace data after demo sign-in. The fixture exercises note writes and uses a loopback API.

```powershell
$app = Resolve-Path '.\bin\x64\Debug\net8.0-windows10.0.19041.0\win-x64\NovaTaskflow.exe'
$report = Join-Path $env:TEMP 'nova-desktop-smoke.txt'
Start-Process $app -ArgumentList ('--smoke "{0}"' -f $report) -Wait
Get-Content $report
```

Add `--hosted` for the hosted demo. Add `--inspect` to save dark and light renders alongside the report.

For the cross-client check, use `--smoke <report> --note-sync` with a disposable Nova API on loopback and the same realtime provider configured for all clients. Put the loopback origin in `server.txt` and a unique test note title in `marker.txt` next to the report. After desktop reports `READY`, create that note in web, append `Android edit <title>` in Android, then verify the desktop's `Windows edit <title>` appears in both clients. Delete the note from web to verify the standalone sticky closes.

## Work offline

Nova retains previously loaded pages in a Windows-protected cache. Task, project, subtask, and subscription changes wait in **Workspace sync** when disconnected. Review conflicting edits there. If a create request may have reached Nova before the connection dropped, check the workspace for an existing copy before retrying.

Note and sticky drafts recover on the same PC after quitting or restarting. Open a recovered draft from Notes or Stickies. Workspace changes and note drafts are associated with the signed-in account and API server.

While Nova runs in the tray, it receives notification and system-status changes through the existing Supabase subscriptions, with periodic refresh as a fallback. Selecting a previously delivered Windows notification opens its details after the signed-in workspace loads.

The installed MSIX can also show notifications after the workspace and tray exit. **Settings → Notifications → Check for notifications after quitting** controls a per-user Windows Task Scheduler entry that checks the existing inbox about every two minutes while Windows is signed in. Each check exits after it runs. The first successful check records the inbox baseline, and later checks skip items that are read or have already been seen. Delivery uses the account saved in Windows Credential Locker and resumes after sign-in if the Nova session expires.

### Instant Windows push

The instant path uses Windows Push Notification Services. Register a Microsoft Entra application and map the installed Package Family Name to its application and service-principal object IDs using [Microsoft’s packaged app setup](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/push-notifications/push-quickstart). Register the Windows package with the same app ID used by the API. The Windows App SDK runtime and push Singleton must be available on the target machine.

```powershell
dotnet publish '-p:PublishProfile=NovaMsix' "-p:NovaWindowsPushAppId=$env:NOVA_WNS_APP_ID"
```

The server sends an inbox wake signal through WNS. Nova fetches and displays the authenticated notification, then exits if reopened by WNS in the background. The scheduled check still catches missed notifications. The normal publish command produces the scheduled-delivery build.

## Whiteboard interoperability

Pending whiteboard ink is saved locally in a Windows-protected draft associated with the signed-in Nova account. When you revisit the board, Nova retries those edits against the server. Desktop shapes and annotations use Nova’s existing stroke format. Text and sticky annotations are saved as ink. Page names entered on desktop are stored in desktop settings. All other board content is saved through the existing Nova API.
