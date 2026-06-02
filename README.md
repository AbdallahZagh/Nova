# Nova (Taskflow) — Frontend

Next.js frontend for [Nova](https://github.com/AbdallahZagh/Nova), a task management app with Kanban boards, a Gantt-style timeline, dashboard analytics, and a glassmorphic UI.

The Nest.js API lives in a separate **backend** repository (or `backend` branch). This repo’s **`frontend`** branch contains only the client.

## Features

- Dashboard metrics, activity heatmap, and urgent tasks
- Projects CRUD with status filters
- Kanban board (To Do, In Progress, In Review, Completed)
- Task drawer with subtasks, due dates, and activity feed
- Timeline view and profile page
- JWT auth with API proxy to the backend

## Tech stack

Next.js (App Router), React 19, Tailwind CSS v4, Lucide Icons.

## Getting started

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables (create `.env` from your backend URL):

```env
NEXT_PUBLIC_API_URL=
API_PROXY_TARGET=http://localhost:8000
```

3. Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Repository layout

| Branch / repo | Contents        |
|---------------|-----------------|
| `frontend`    | This Next.js app |
| `main`        | Workspace overview README |
| Backend repo  | Nest.js API, Prisma, PostgreSQL |

## Deploy

See [Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying). Point `API_PROXY_TARGET` at your production API.
