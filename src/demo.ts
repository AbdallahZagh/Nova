import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const DEMO_TOUR_STORAGE_KEY = "nova.demo.tour.dismissed";

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
] as const;

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
