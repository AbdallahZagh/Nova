/**
 * Tasks the user is actually assigned to (primary assignee or extra assignment row).
 * Used by profiles so counts and activity reflect personal work, not every
 * unassigned task sitting in a shared project.
 */
export function assignedTasksWhere(userId: string) {
  return {
    OR: [{ assigneeId: userId }, { assignments: { some: { userId } } }],
  };
}

/**
 * Work that should show up on dashboard / timeline / search:
 *   1. Explicit assignee
 *   2. Extra assignment row
 *   3. Unassigned tasks in a project they own or belong to
 */
export function myTasksWhere(userId: string) {
  return {
    OR: [
      ...assignedTasksWhere(userId).OR,
      {
        assigneeId: null,
        project: {
          OR: [{ ownerId: userId }, { members: { some: { userId } } }],
        },
      },
    ],
  };
}

export function myProjectsWhere(userId: string) {
  return {
    OR: [{ ownerId: userId }, { members: { some: { userId } } }],
  };
}
