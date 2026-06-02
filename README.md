# 🌌 Nova (Taskflow) Workspace

![Nova Preview](https://via.placeholder.com/1200x600/1e1e1e/e66a17?text=Nova+Task+Management+System)

Nova is a modern, enterprise-grade task management application designed for speed, clarity, and aesthetics. It combines a premium dark-theme glassmorphic interface with a robust, strictly-typed backend to deliver Kanban boards, horizontal Gantt timelines, and deep productivity analytics.

## ✨ Key Features

### Frontend (Next.js & Tailwind v4)
* **Glassmorphic UI:** A sleek, solid-color dark theme with frosted glass cards and vibrant `#e66a17` accents.
* **Dynamic Kanban Boards:** Manage tasks across states with an interactive side-drawer for deep editing and granular subtask checklists.
* **Gantt Timeline:** A chronological vertical timeline to visualize project deadlines and task cascades.
* **Productivity Heatmap:** A GitHub-style contribution graph tracking trailing 1-year task completion rates, complete with interactive hover tooltips.
* **Hydration-Safe Modals:** Fully accessible, portal-based overlay architecture for project and task creation.

### Backend (Nest.js & PostgreSQL)
* **Feature-Based Architecture:** Modular domain structure (`Auth`, `Users`, `Projects`, `Tasks`, `Dashboard`, `Timeline`).
* **Advanced Authentication:** Passport.js JWT strategies coupled with a secure, automated 6-digit OTP flow for registration and password recovery.
* **Automated Activity Logging:** System actions (like changing a task status) automatically generate history logs for the task activity feed.
* **Dynamic Aggregations:** Complex Prisma queries to compute real-time completion percentages based on nested subtasks.
* **Interactive API Docs:** Auto-generated Swagger (OpenAPI) documentation with full request validation.

## 🛠️ Tech Stack

**Client:** Next.js (App Router), React 19, Tailwind CSS v4, Lucide Icons.  
**Server:** Nest.js, TypeScript, Passport.js, class-validator.  
**Database:** PostgreSQL (Dockerized), Prisma ORM.  


Navigate to the backend directory:
```bash
cd backend
