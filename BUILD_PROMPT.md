# Nova Desktop — build prompt

You are building **Nova Taskflow Desktop**, a native Windows application for the existing Nova task system. Do not invent a new backend. Match the website’s information architecture and the colors below, drawn with native controls so the laptop stays cool and quiet.

Build it inside this folder: `nova-desktop`. Do not put the app in `nova-frontend`, `nova-backend`, or `nova-app`.

## 1. Stack — native Windows, no browser

Use **WinUI 3** on the **Windows App SDK**, in **C#** and **.NET 8**.

- The UI is XAML. Windows paints it. There is no HTML, CSS, JavaScript, WebView2, Electron, or Tauri.
- Idle memory should stay near a normal Windows app, well under a browser. Unload a page’s visual tree when the user leaves it. The whiteboard is the only heavy surface, and it unloads when the user navigates away.
- Use `CommunityToolkit.Mvvm` for commands and observable state. Use `System.Net.Http.HttpClient` for the API. Use `Windows.Security.Credentials.PasswordVault` for the access token.
- Use the Windows App SDK tray icon (`TrayIcon` in Windows App SDK 1.4+), a single-instance redirect, and `AppNotification` for toasts.
- Mica on the window backdrop, with the Nova colors painted on the sidebar and cards. Rounded corners come from `CornerRadius` 8 on controls and 12 on cards. Use Segoe UI Variable.
- Virtualize every long list (`ItemsRepeater` or `ListView` with a modern panel). Do not create a control per calendar cell that stays alive off-screen.

Commands:

- `dotnet build`
- `dotnet run` — opens the unpackaged window for development
- Publish a packaged MSIX with `dotnet publish` and a Windows App SDK self-contained profile so the user does not install a separate runtime by hand

App name: **Nova Taskflow**. Package identity: `NovaTaskflow`. Window title: `Nova Taskflow`.

Minimum window: **1100 × 720**. Default size: **1440 × 900**. Remember size and position in `ApplicationData`. One instance only: launching again focuses the existing window. Closing the window hides it to the tray. **Quit** exits the process.

Nova starts when Windows starts. That is the default, and the first run registers the startup task. Settings can turn **Launch Nova when I sign in to Windows** off. A global hotkey **Ctrl+Alt+N** opens or focuses Nova from anywhere, including when it is only in the tray. Register it with the Windows App SDK or `RegisterHotKey`, and unregister it on quit.

## 2. Backend the app talks to

Default API base: `https://nova-l5df.onrender.com`

The user can change it in Settings. Save the choice locally. There is no website session cookie. Every authenticated request sends:

`Authorization: Bearer <accessToken>`

`POST /api/auth/login` with JSON `{ "email": "<email or username>", "password": "<password>" }` returns:

```json
{ "message": "Login successful", "accessToken": "<jwt>", "user": { "id": "", "email": "", "fullName": "", "username": "", "roleTitle": "", "isDemo": false } }
```

Store `accessToken` in `PasswordVault` under the resource `Nova Taskflow`. Never write the token into a file, a setting, or the repo.

If the token is missing or any request returns **401**, clear it and show the sign-in window.

Demo accounts (`user.isDemo === true`) can read and can create notes. They cannot change subscriptions and they cannot call AI. Hide those buttons instead of letting them fail.

Main route groups, all under the API base:

- `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/forgot-password`, `POST /api/auth/register`
- `GET /api/users/me`, `PATCH /api/users/me`, avatar upload and delete
- `GET /api/dashboard`
- `GET|POST /api/projects`, `GET|PATCH|DELETE /api/projects/:id`, members
- `GET|POST /api/tasks`, `GET|PATCH|DELETE /api/tasks/:id`, assign and unassign
- `POST /api/tasks/ai-suggest` with `{ title, description?, existingSubtasks? }`
- `POST /api/subtasks`, `PATCH /api/subtasks/:id`, `DELETE /api/subtasks/:id`
- `GET|POST /api/task-comments`, reply, close
- `GET /api/timeline?filter=today|tomorrow|weekly|monthly|yearly`
- `GET|POST /api/subscriptions`, `GET|PATCH|DELETE /api/subscriptions/:id`, `POST /api/subscriptions/:id/renew`, `POST /api/subscriptions/renew-all`
- `GET|POST /api/notes`, `GET|PATCH|DELETE /api/notes/:id`
- `GET /api/search?q=`
- whiteboard routes already used by `nova-frontend` under `/api`
- `GET /api/system/status`, notifications and device tokens

Do not add a desktop-only database for tasks. The server is the source of truth. Cache the last successful GET responses so the last screen still opens when the network is down, and show a banner: **You’re offline. Showing the last saved copy.**

## 3. Live notes

Notes already save themselves. The desktop app must show those saves from the website and the phone.

After each successful note create, update, or delete, the backend broadcasts on the Supabase Realtime channel `notes:<userId>`, event name `note`.

Payload:

- `{ "kind": "saved", "note": <note object returned by the API> }`
- `{ "kind": "deleted", "id": "<note id>" }`

Subscribe with the public Supabase client (URL and anon key already used by `nova-frontend` and `nova-app`). On `saved`, update the notes list, an open note, and any floating sticky. On `deleted`, remove it.

If this device is currently typing in that note (`pending` local edits not yet saved), do not replace the text. Otherwise, if the incoming `updatedAt` is newer than the note on screen, replace the visible fields. The device doing the typing keeps the caret where it is.

## 4. Folder structure

```
nova-desktop/
  NovaTaskflow.csproj
  App.xaml                         theme dictionaries, dark default
  App.xaml.cs                      single instance, tray, startup
  Shell/
    ShellWindow.xaml               sidebar + top bar + frame
    TrayCommands.cs
  Api/                             one class per resource, HttpClient, typed records
  Auth/                            login, PasswordVault
  Live/NotesChannel.cs             Supabase realtime
  Views/
    SignInView.xaml
    DashboardView.xaml
    ProjectsView.xaml
    ProjectView.xaml
    TimelineView.xaml
    WhiteboardView.xaml
    SubscriptionsView.xaml
    NotesView.xaml
    NoteView.xaml
    ProfileView.xaml
    SettingsView.xaml
  Controls/                        NovaButton, NovaTextBox, NovaCard, Drawer, Calendar, Skeleton, Toast
  ViewModels/
```

Navigate by swapping the `Frame` content. Do not keep every page’s control tree alive. Cache the last JSON for the page the user just left, and drop the controls.

## 5. Visual system — copy these values

Dark is the default. Light is a second `ResourceDictionary` the theme button swaps at runtime.

Dark:

- Page `#161312`
- Sidebar `#1c1816`
- Accent `#e66a17`
- Text `#e8e3e0`
- Glass button `rgba(79, 69, 62, 0.2)`
- Glass card `rgba(230, 106, 23, 0.05)`
- Glass border `rgba(255, 255, 255, 0.05)`
- Danger `#ff0000`, warning `#ffff00`, success `#00ff00` only as status dots. Body text never uses pure yellow.

Light:

- Page `#f5f1ec`
- Sidebar `#ede6db`
- Accent `#c56010`
- Text `#1c1208`
- Glass button `rgba(42, 22, 6, 0.07)`
- Glass card `rgba(42, 22, 6, 0.05)`
- Glass border `rgba(42, 22, 6, 0.14)`
- Danger `#dc2626`, warning `#d97706`, success `#16a34a`

Draw controls as WinUI styles, not as a web page:

- Primary button: accent fill, white Segoe UI Variable semibold label, height 36, corner radius 8.
- Quiet button: glass-button fill, 1px glass border, primary text.
- Navigation item: icon plus label, height 40, corner radius 8. Selected: glass fill, glass border, accent foreground.
- Cards: corner radius 12, glass-card fill, 1px glass border, padding 16.
- Drawers: `ContentDialog` is wrong for task details. Use a right-side panel, width 480, that slides over a dim layer. Escape and the dim layer close it.
- Inputs: `TextBox` with the glass border and a 12px corner radius. Placeholder text at 35% opacity.
- Skeleton: `Rectangle` blocks in the glass-button color with a short opacity pulse. Match the shape of the page that is loading.
- Toast: a small transient `InfoBar` or a flyout at the bottom, not a modal.

Type: Segoe UI Variable. Titles are semibold. Primary actions are filled accent with white text. Secondary actions are quiet. Destructive actions use danger text, never a giant red page.

Every screen has a loading skeleton shaped like the final layout, an empty state with one sentence and one action, and an error toast. Do not use a blank white page.

## 6. Window chrome

Use the **native title bar** so minimize, maximize, and close behave like Windows. Do not draw a fake title bar.

Inside the window:

- Left sidebar, **256px**, full height, background sidebar color.
- Top bar, **64px**, from the right of the sidebar to the window edge.
- Content scrolls under the top bar. Padding **32px**.

### Sidebar, top to bottom

1. Logo mark plus two lines of text: **NOVA** in accent, **Taskflow** in small tracked-out text under it. Not a button.
2. Nav buttons, full width, icon plus label, 14px icon, 14px label, radius 12px, padding 10px 12px:
   - **Dashboard**
   - **Projects**
   - **Whiteboard**
   - **Timeline**
   - **Subscriptions**
   - **Notes**
   The active item has a glass background, a glass border, and accent text. Inactive items are 70% text and turn accent on hover.
3. Spacer.
4. The signed-in person: avatar or initials, full name, role title. Click opens **Profile**.
5. **Log out**. While it runs, the label is **Signing out…** and the button is disabled. It calls `POST /api/auth/logout`, clears the token, and returns to sign-in. If the logout request fails, still clear the local token and return to sign-in.

### Top bar, left to right

1. **Search** — a wide pill, placeholder `Search tasks, projects, subscriptions, users...`, with a small **Ctrl K** hint on the right. Click, or Ctrl+K, opens the command palette. It is not a separate page.
2. **Stickies** — accent outline button, label **Stickies**. It does not create a note. It opens the sticky menu described in the Notes section. Shortcut **Ctrl+Alt+S**. Do not use Ctrl+Shift+N; that opens an incognito window in Chrome.
3. **Notifications** — bell icon button, `aria-label` “Notifications”. If the unread count is above 0, show a numeric badge. Click opens the notification drawer from the right.
4. **Theme** — icon button. Dark mode shows a sun and the tooltip **Switch to light mode**. Light mode shows a moon and **Switch to dark mode**. Persist the choice.
5. **Profile** — avatar button, tooltip **View your profile**. Same destination as the sidebar person.

### System tray

Right-click menu:

- **Open Nova** — show and focus the window
- **Stickies** — open the sticky menu, not a blank note
- **Quit Nova**

Left-click the tray icon opens the window. The window Close button hides to the tray. Quit is the only exit.

### Keyboard

- Ctrl+K search
- Ctrl+Alt+N show Nova from anywhere in Windows
- Ctrl+Alt+S sticky menu. Do not use Ctrl+Shift+N.
- Ctrl+1 Dashboard, Ctrl+2 Projects, Ctrl+3 Whiteboard, Ctrl+4 Timeline, Ctrl+5 Subscriptions, Ctrl+6 Notes
- Ctrl+, Settings
- Ctrl+W hide to tray
- Ctrl+Q quit

## 7. Sign-in window

When there is no token, do not show the sidebar. Show one centered card, max width **420px**, on the page background.

- Small eyebrow: **WELCOME BACK**
- Title: **Taskflow**
- Subtitle: **Sign in to manage your workspace**
- Theme icon button in the top-right corner of the window
- Field **Email or username**, placeholder `you@company.com or @username`, required
- Field **Password**, required, with a **Show password** / **Hide password** eye button
- Text link **Forgot password?** opens a second card: email field, **Send reset code**, **Back to sign in**
- Primary button **Sign in**. While the request runs, label **Signing in…**, button disabled
- Secondary button **Try demo**. Label while running: **Opening demo…**
- Footer: **Don’t have an account? Create one** opens register: full name, username, email, password, role title, **Create account**, **Back to sign in**

Errors:

- No token in a 200 response: **Login succeeded but no access token was returned.**
- API message, if the server sent one
- Network failure: **Unable to sign in. Check your connection and try again.**

After success, open **Dashboard**. Do not show “check your connection” when the login response was 200 and included `accessToken`.

## 8. Command palette

Modal, centered, width **640px**, above a dim scrim. Clicking the scrim or pressing Escape closes it.

- Search input, autofocus, same placeholder as the top bar
- Results grouped: **Projects**, **Tasks**, **Whiteboards**, **Subscriptions**, **Notes**, **People**
- Each row: icon, title, one secondary line (project name, amount and next charge, or email)
- Arrow keys move the highlight. Enter opens it.
- Empty query shows nothing but the input. No matches: **No results**.

Opening a row navigates and closes the palette.

## 9. Notifications drawer

Right drawer, width **420px**. Title **Notifications**.

- Tabs: **All**, **Unread**
- Each row: title, message, relative time, unread dot
- **Mark read** on an unread row
- Empty: **No notifications yet** or **You’re all caught up**
- Close button, Escape, and scrim click close it

A native notification may also fire for a new item when the window is hidden. Clicking it opens Nova on that item.

## 10. Dashboard

Title **Dashboard**. Subtitle is the date: `Your workspace overview for <weekday, month day>`.

Top strip, three cards:

- **Last project** — name, updated date. Click opens that project. Empty: **No project yet** and a button **Create a project**.
- **Last whiteboard** — title, edited date. Click opens the board.
- **Due today** — the task due today, or **Nothing due today**.

Metric row, four cards:

- **Tasks due today** — count, and `n assigned overall`
- **Active projects** — count
- **Productivity score** — percent, and `n / n subtasks`
- **Due in 30 days** — subscription total, and `n overdue to review` if any are overdue

**Coming up** card:

- Title **Coming up**, monthly cost beside it
- Text button **View all subscriptions**
- If any charge date has passed: a danger banner **n subscriptions passed their saved charge date** and a button **Review and renew** that opens Subscriptions filtered to overdue
- Up to four rows: service, plan, date and timing (“in 2 days”, “today”, “5 days overdue”), status pill, amount
- A row click opens that subscription

**Recent activity**: the contribution heatmap of scheduled tasks. Clicking a day with tasks opens Timeline on that day.

Skeleton: same cards, grey glass blocks, no spinner in the middle of the page.

## 11. Projects

Title **Projects**. Subtitle **Manage and track your active projects.**

Toolbar:

- **New project** — accent button. Opens a drawer: **Name** (required), **Description**, **Status** select (`Active`, `In Progress`, `Completed`, `Archived`), **Cancel**, **Create project**.
- Ownership filter: **All**, **Owned**, **Shared**
- Status filter: **All statuses** plus the four statuses

Each project card:

- Name, status pill, description
- `n / n tasks · n/n subtasks`
- Late count, or **None late**
- Next due date
- Owner avatar
- **Project actions** menu: **Open**, **Edit**, **Archive** or **Restore**, **Delete**
- **Delete** asks: title **Delete project?**, body **This permanently removes the project and its tasks.**, buttons **Cancel** and **Delete**

Clicking the card opens the project. Empty: **No projects yet** and **New project**.

## 12. Project

Back button **Projects**.

Header: project name, status, description, member avatars.

Buttons:

- **New task**
- **Board** / **List** toggle if both exist; default is the task board
- **Notes** opens the project notes drawer
- **Members**
- **Suggestions**

Task board columns, in this order: **To Do**, **In Progress**, **In Review**, **Completed**.

A task card shows title, priority dot, due date, assignee avatars, and subtask progress `done/total`. Click opens the task drawer. Dragging between columns changes status and saves immediately.

**New task** drawer:

- **Task title**, required
- **Generate with AI** — full width, sparkle icon, subtitle **Fill description, priority, due date, and subtasks.** Hidden for the demo account. Disabled until the title is non-empty. While running: **Generating task draft**.
- Description, Priority (`Low`, `Medium`, `High`), Due date, Assignees
- Subtasks: checkbox, text, assignee, remove, **Add a subtask**
- **Cancel**, **Create task**

AI-filled fields show a small **AI draft** pill until the user edits them.

**Members** drawer: list of people, role select `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`, **Remove**, and **Add member** (search people, choose role, **Add**). Viewers cannot add, edit, or delete.

**Suggestions** drawer: list of suggestions, **New suggestion** (text, **Add**), and on each item **Convert to task** and **Dismiss**.

## 13. Task drawer

Right drawer, width **480px**. Title **Task details**. Close, Escape, and scrim.

Fields:

- Title
- **Suggest an update** — hidden for demo and for viewers. Subtitle: **Refresh the description, priority, due date, and missing subtasks.** It sends the current title, description, and existing subtask titles to `/api/tasks/ai-suggest`. It fills description, priority, and due date, and adds only subtasks whose text is not already there. Toast: **Update suggested. Review the description, date, and new subtasks, then save.**
- Status select: **To Do**, **In Progress**, **In Review**, **Completed**
- Priority select: **Low**, **Medium**, **High**
- **Due date** date picker, placeholder **Select due date...**
- **Assigned to** multi-select, **Save assignment**
- Description textarea, placeholder **Add a description...**

**Subtasks** card: progress `done/total` and a bar.

Each subtask row:

- Round checkbox, tooltip **Mark complete** or **Mark incomplete**
- Name. Click to edit. Enter saves, Escape cancels. Confirm check appears when the text changed.
- Remove, tooltip **Remove subtask**
- **Subtask date** date picker. Saving the date persists immediately.
- Assignees multi-select and **Save subtask assignment** when the user can assign

Add row: input placeholder **Add a subtask…**, Enter or the accent **+** button adds it.

**Comments** card: count, list, composer, **Comment**. On your own comment: **Reply** (admins and owners) and **Close**.

Footer: **Delete task** (danger, confirms **This permanently removes the task and its subtasks.**) and **Save**. **Save** is disabled while saving and its label becomes **Saving…**.

Viewers see the same fields disabled. No save, no delete, no AI, no add subtask.

## 14. Timeline

Title **Timeline**.

Header right: **Calendar** and **Gantt**. The active one is filled accent.

Filter bar:

- **Today**, **Tomorrow**, **This week**, **This month**, **This year**
- Project select, default **All projects**

Second bar:

- **All**, **Tasks**, **Subscriptions**
- Legend dots: **To Do**, **In Progress**, **In Review**, **Completed**, **Subscription**
- One line of help: for calendar, **Hover a day to preview. Click one task to open it, or click a busy day to pick from the list.** For Gantt, **Bars run from created date to due date.**

The subtitle under the title shows the window, the date span, the task count, and the charge count. Example: `This month · Nov 1 – Nov 30, 2026 · 2 tasks`.

Changing Today, This week, This month, This year, or the project **immediately** replaces the board with a skeleton and changes the subtitle to `Loading this week…` (use the selected range). Do not leave the previous calendar visible. When the request finishes, show the new board. Clicking the already selected filter does nothing.

Calendar: month grid, or a 7-column week, or a single day, matching the filter. A day with one task opens it. A day with several opens a small list. A subscription diamond opens that subscription.

Gantt: one row per task, bar from start to due. Today is a vertical line.

Empty: **Nothing due** and the name of the current range.

## 15. Whiteboard

List title **Whiteboard**.

- **New board** — name, optional project, **Create**
- Cards: title, project or **Personal**, last edited, member faces
- Card menu **Board actions**: **Open**, **Rename**, **Duplicate**, **Copy share link**, **Delete**

Editor, full content area:

- Back, board title (click to rename), page tabs, **New page**, page menu **Rename** and **Delete page**
- Tools: **Select**, **Pen**, **Eraser**, **Line**, **Rectangle**, **Ellipse**, **Text**, **Sticky**
- Color swatches and a thickness slider for the pen
- **Undo**, **Redo**
- **Members** — invite by search, role, **Copy invite link**, remove member
- **Comments**
- **Export** — PNG at least, plus the formats the website already offers
- **Share**
- Presence avatars of people on the board

Leaving with unsaved strokes asks **Save snapshot?** with **Stay** and **Leave**.

Pan with the middle mouse or Space+drag. Zoom with Ctrl+wheel. Delete removes the selection.

## 16. Subscriptions

This is a personal list of services the user pays for. It is not Nova billing.

Title **Subscriptions**. Subtitle **What you pay, and the day it charges next.**

**Add subscription** opens the form drawer.

Summary strip:

- **Monthly cost** — one figure per currency, plus the yearly figure
- **Next 30 days** — total and up to four upcoming charges (name, date, amount)
- **Breakdown** — **Active**, **Trial**, **Paused or canceled**, each a button that sets the filter

If any charge date has passed, a banner:

- **n charge dates have passed**
- **Nova never moves a date on its own. If they already charged, renew them and the dates roll to the next cycle.**
- **Review** filters to overdue
- **Renew all** renews every overdue active or trial subscription

Toolbar:

- Tabs **All**, **Active**, **Trials**, **Overdue**, **Stopped**, each with a count
- Search, placeholder **Search subscriptions**
- Sort **Soonest charge**, **Name**, **Amount**

Cards, grouped **Due soon**, **Later**, **Paused and canceled**:

- Monogram, service, plan, status pill
- Price and cadence (`$20.00 per month`)
- Timing: **Renews in 2 days**, **5 days overdue**, **Trial ends in 3 days**, **Paused**, **Canceled**
- Charge date, cancel-by date
- Price change line when present: **Was $15.00 before**
- Actions, one of: **Mark renewed**, **Pause**, **Resume**, **Reactivate**
- Clicking the card opens the details drawer

Details drawer: header with price, **Cost** (price, per month, per year, price history), **Timing** (next charge, status, repeats, cancel by), **Reminder**. Footer **Delete**, **Pause** or **Resume**, **Edit**.

Edit and create form:

- **Service**, **Plan**
- **Amount**, **Currency**
- **Repeats**: Every `n` `day|week|month|year`
- **Next charge date**
- **Status**: Active, Trial, Paused, Canceled
- **Reminder**: Remind me `n` days before. Helper: **Nova notifies you n days before the charge, so you can cancel in time. Use 0 to turn it off.**
- **More details**: reason, cancel link, payment label
- **Delete** (edit only), **Save** or **Save changes**

**Mark renewed** on a charge dated today moves it one full cycle ahead. A passed date rolls to the next date that is not in the past. Paused and canceled cards do not show **Mark renewed**.

Demo: the page can be viewed. Any write shows **The demo account cannot manage subscriptions.**

## 17. Notes

Title **Notes**.

Toolbar:

- **New note** opens the full note page
- **Stickies** opens the sticky menu. It does not create a blank note.
- Scope: **All**, **Personal**, **Projects**, **Pinned**
- Search
- Color filter: Stone, Amber, Coral, Sage, Sky, Violet
- **On screen** toggle for floating notes

Cards:

- Title, or the preview if there is no title
- Body, up to four lines
- Checklist preview, three items, then `+n more`
- A thumbtack only when pinned
- Project name or **Personal**
- Edited time
- Click opens the note
- Right-click or the card menu: **Open**, **Pin to top** or **Unpin**, **Duplicate**, **Delete**

Empty: **Capture your first note** and **New note**. Filtered empty: **No notes match** and **Clear filters**.

The list updates live when another device saves or deletes a note.

### Note page

Back. Save status text: **Saving…**, **Saved · edited <time>**, **Saves automatically as you write**, or the error.

Buttons: **Pin** / **Unpin** (thumbtack, filled accent when pinned), **More**.

**More** menu: **Pin to top** or **Unpin**, **Duplicate**, **Turn into a task** (only if a project is chosen), **Delete note**.

Fields, no save button. Changes save about **700ms** after typing pauses, and immediately for pin, color, and project:

- Title, placeholder **Title**
- Body, placeholder **Start writing…**
- Checklist. Button **Add a checklist** when there are no items, then **Add item**. Each row: checkbox, text, remove. Enter on a non-empty row inserts the next row.
- **Colour**: six dots, Stone Amber Coral Sage Sky Violet
- **Project**: **Personal (no project)** or a project. Helper: **A project only groups the note. It stays private to you.**
- **Pin to top**
- **Keep on screen** — floats the note on every page

Delete confirms **Delete note?** / **This removes the note from your account.** Buttons **Cancel** and **Delete**.

While the note loads, show the note skeleton: a back button and two action buttons, a title line, five text lines, a checklist button, six color dots, and a project field. The notes **list** uses the normal page skeleton, not this one.

### Sticky menu and floating stickies

**Stickies** and **Ctrl+Alt+S** open one sticky card titled **Stickies**. It lists every note from `GET /api/notes`: title or preview, and **Personal** or the project name. A note already on screen says **On screen**. Clicking a row opens that note as a floating sticky, using `PATCH /api/notes/:id` with `floating: true` when it was not already floating. **New note** at the bottom creates one empty sticky through the existing notes API. Several stickies can be open at once, up to six. Clicking a note that is already open brings that sticky to the front. Closing a sticky sets `floating` to false and does not delete the note.

Each open sticky is a small card on top of the current screen, draggable, resizable, the note color as its background. Title, body, checklist, color dots, **Add a checklist**, **Close**. Position and size save with the note through the existing notes API. Live updates from the website or phone still apply to a sticky that is open and not being typed in.

## 18. Profile

Title is the person’s name.

- Avatar, **Change photo**, **Remove photo**
- **Full name**, **Username**, **Role**, **Bio**, **Save**
- **Email** is shown and not edited here
- **Change password** sends a reset code to the email
- **Deactivate account** confirms, then signs out
- Activity heatmap of their tasks

## 19. Settings — desktop only

Opened from Ctrl+, or **Settings** at the bottom of the sidebar under Log out.

- **API server** text field, default `https://nova-l5df.onrender.com`, button **Save server**. Changing it signs the user out.
- **Launch Nova when I sign in to Windows** checkbox, **on by default**. The first launch registers the startup task.
- **Close button hides Nova** checkbox, default on
- **Open last page on startup** checkbox, default on
- About: version, **Check the website** is not a button. Do not add an update feed.

## 20. How saving works

- Task fields in the drawer save when **Save** is pressed, except subtask dates, subtask checks, and subtask renames, which save on commit.
- Notes save on their own. Do not add a Save button on the note page.
- Subscription **Mark renewed**, **Pause**, **Resume**, **Reactivate**, and **Renew all** save immediately.
- Board drag-and-drop saves the new status immediately.
- A failed save restores the previous value and shows a toast with the server message.

## 21. What not to build

- Do not build sprints. That is a later Nova task.
- Do not build a second database.
- Do not build Nova billing. Subscriptions are the user’s own services.
- Do not call Gemini from the desktop app. AI goes through `POST /api/tasks/ai-suggest` only.
- Do not host a WebView, and do not load the website inside the window.
- Do not require the user to run the website or the phone app.

## 22. Build order

1. WinUI window, tray, PasswordVault, sign-in.
2. Shell: sidebar, top bar, theme, navigation.
3. Dashboard from `GET /api/dashboard`.
4. Projects, project board, task drawer, subtask dates, AI suggest on create and on update.
5. Timeline with the immediate loading skeleton.
6. Subscriptions, including renew, renew all, pause, resume, reactivate.
7. Notes, note page, floating stickies, live channel.
8. Search, notifications, profile, settings.
9. Whiteboard.
10. Offline cache, Windows installer, and a smoke test of every button above.

## 23. Done when

- `dotnet run` opens a window, signs in, and reaches the dashboard.
- Every sidebar item opens a real screen, not a placeholder.
- Hiding the window and opening it from the tray returns to the same page.
- A note typed on the website appears on the desktop list and, if that note is open and not being typed in, in the editor.
- Changing the timeline range never leaves the old calendar on screen.
- A subtask can store its own date, and **Suggest an update** changes an existing task without deleting subtasks that were already there.
- The demo account cannot see subscription writes or AI.
- `dotnet publish` produces an MSIX the user can install. The installed process stays light while Nova is sitting in the tray.
