import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const DEMO_TOUR_STORAGE_KEY = "nova.demo.tour.dismissed.v3";

export type DemoTourIcon = "sparkles" | "folder" | "calendar" | "pen" | "moon";

export type DemoTourStep = {
  id: string;
  icon: DemoTourIcon;
  eyebrow: string;
  title: string;
  paragraphs: string[];
  highlights?: string[];
};

export const DEMO_TOUR_STEPS: DemoTourStep[] = [
  {
    id: "idea",
    icon: "sparkles",
    eyebrow: "Welcome to Nova",
    title: "A workspace for how small teams actually work",
    paragraphs: [
      "Most tools scatter a team across a board, a doc, and a chat thread that dies in a week. Nova keeps the plan and the thinking in one quiet place — projects, tasks, dates, and a shared whiteboard, together.",
      "This is the live product, not a slideshow. A sample launch is already waiting. Walk through it the way a teammate would.",
    ],
    highlights: ["Projects", "Tasks", "Timeline", "Whiteboard"],
  },
  {
    id: "projects",
    icon: "folder",
    eyebrow: "Projects and tasks",
    title: "From a name to a board you can run",
    paragraphs: [
      "Open Aurora Launch. That is a real project: statuses, due dates, comments, and subtasks. People on cards and comments show a photo or initials — open a name to see their profile.",
      "This is the part people recognize immediately. A kanban that behaves like work, not a prototype.",
    ],
    highlights: ["Kanban", "Comments", "Subtasks", "Profiles"],
  },
  {
    id: "timeline",
    icon: "calendar",
    eyebrow: "Timeline",
    title: "See the week, not just the card",
    paragraphs: [
      "Timeline lifts due dates off the board so you can read the sprint as a week, not a pile of titles.",
      "It is the view you open before standup, or when someone asks what lands next. Nothing to configure — the dates are already on the sample work.",
    ],
  },
  {
    id: "whiteboard",
    icon: "pen",
    eyebrow: "Whiteboard",
    title: "Sketch next to the work",
    paragraphs: [
      "The Sprint whiteboard is live. Draw. The colored initials in the corner are who is here — each person gets a color so you can tell whose stroke is whose, even in a crowded room. Undo is shared, so you are not fighting the last visitor. Export a page as PNG or PDF when you want a snapshot.",
      "Kickoff flows, arrows, messy notes — they belong here, beside the tasks they describe. One page, one canvas, everyone looking at the same ink.",
    ],
    highlights: ["Live drawing", "Who is drawing", "Shared undo", "PNG and PDF"],
  },
  {
    id: "sandbox",
    icon: "moon",
    eyebrow: "This demo",
    title: "Public on purpose. Clean every night.",
    paragraphs: [
      "You are in a shared account. Skip anything personal. Other visitors may be in the same rooms at the same time.",
      "A few doors stay closed — invites, AI, new projects, extra boards, and profile photo edits — so free-tier quotas survive a public demo. Everything else is yours to try. By morning, the sandbox starts over.",
    ],
    highlights: ["No personal data", "Nightly reset", "Explore freely"],
  },
];

async function readFlag() {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(DEMO_TOUR_STORAGE_KEY);
  }
  return SecureStore.getItemAsync(DEMO_TOUR_STORAGE_KEY);
}

async function writeFlag() {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DEMO_TOUR_STORAGE_KEY, "1");
    }
    return;
  }
  await SecureStore.setItemAsync(DEMO_TOUR_STORAGE_KEY, "1");
}

export async function hasDismissedDemoTour() {
  try {
    return (await readFlag()) === "1";
  } catch {
    return false;
  }
}

export async function dismissDemoTour() {
  try {
    await writeFlag();
  } catch {
    // ignore
  }
}
