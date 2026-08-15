import { apiClient } from "@/api/apiClient";

export type AiTaskSuggestion = {
  description?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  subTasks?: string[];
  suggestedDaysUntilDue?: number;
};

export async function suggestTaskAiApi(title: string) {
  const response = await apiClient.post<AiTaskSuggestion>("/api/tasks/ai-suggest", {
    title: title.trim(),
  });
  return response.data;
}

export async function suggestProjectDescriptionApi(title: string) {
  const response = await apiClient.post<{ description?: string }>(
    "/api/projects/ai-description",
    { title: title.trim() },
  );
  return response.data;
}
