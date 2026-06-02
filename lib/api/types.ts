/** User profile returned by GET /api/users/me and login */
export type ApiUser = {
  id: string;
  email: string;
  fullName: string;
  roleTitle: string;
  bio?: string | null;
  avatarUrl?: string | null;
  /** Number of projects owned by the user */
  projectCount?: number;
  /** Number of tasks across the user's projects */
  taskCount?: number;
  /** Alternate field names some API versions use */
  projectsCount?: number;
  tasksCount?: number;
  totalProjects?: number;
  totalTasks?: number;
  project_count?: number;
  task_count?: number;
  _meta?: Record<string, unknown>;
  stats?: Record<string, unknown>;
};

export type LoginResponse = {
  accessToken: string;
  user: ApiUser;
};

export type LogoutResponse = {
  message?: string;
  action?: string;
};

export type UpdateProfilePayload = {
  fullName?: string;
  roleTitle?: string;
  bio?: string;
  avatarUrl?: string;
};

export type ApiErrorBody = {
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
};
