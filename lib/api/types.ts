/** User profile returned by GET /api/users/me and login */
export type ApiUser = {
  id: string;
  email: string;
  fullName: string;
  roleTitle: string;
  username?: string | null;
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
  activity?: Record<string, ApiUserActivityTask[]>;
  projects?: ApiUserProject[];
  _meta?: Record<string, unknown>;
  stats?: Record<string, unknown>;
  isDemo?: boolean;
  /** Platform role. Job title is `roleTitle`. */
  role?: "USER" | "SUPER_ADMIN";
  accountRole?: "USER" | "SUPER_ADMIN";
};

export type ApiUserActivityTask = {
  id: string;
  title: string;
  status: string;
  dueDate: string;
  projectName: string;
  completionPercentage: number;
};

export type ApiUserProject = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | string;
  totalTasksCount?: number;
  userTasksCount?: number;
  completedUserTasksCount?: number;
};

export type LoginResponse = {
  accessToken: string;
  access_token?: string;
  user: ApiUser;
};

export type LogoutResponse = {
  message?: string;
  action?: string;
};

export type UpdateProfilePayload = {
  fullName?: string;
  roleTitle?: string;
  username?: string;
  bio?: string;
  avatarUrl?: string;
};

export type ApiErrorBody = {
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
};
