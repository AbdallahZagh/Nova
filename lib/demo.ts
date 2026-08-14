import { apiFetch } from "@/lib/api/client";

export const DEMO_TOUR_STORAGE_KEY = "nova.demo.tour.dismissed";

export type DemoCredentials = {
  email: string;
  password: string;
};

export async function getDemoCredentialsApi() {
  return apiFetch<DemoCredentials>("/api/auth/demo", { auth: false });
}

export function hasDismissedDemoTour() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(DEMO_TOUR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissDemoTour() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEMO_TOUR_STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}

export const DEMO_TOUR_POINTS = [
  {
    title: "Projects and tasks",
    body: "Open Aurora Launch, change a status, add a comment, or create a small extra task.",
  },
  {
    title: "Timeline",
    body: "See due dates across work. Good for a quick scan of the sample sprint.",
  },
  {
    title: "Whiteboard",
    body: "Draw on the sprint board. Undo is shared. You can export a page as PNG or PDF.",
  },
  {
    title: "Shared sandbox",
    body: "Other visitors may be here at the same time. The workspace resets every night, and a few actions (invites, AI, new projects) stay off to protect free-tier quotas.",
  },
];
