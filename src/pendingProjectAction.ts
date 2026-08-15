let pendingNewTaskProjectId: string | null = null;

export function requestOpenNewTask(projectId: string) {
  pendingNewTaskProjectId = projectId;
}

export function consumeOpenNewTask(projectId: string) {
  if (pendingNewTaskProjectId !== projectId) return false;
  pendingNewTaskProjectId = null;
  return true;
}
