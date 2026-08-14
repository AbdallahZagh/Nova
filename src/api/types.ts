export type ApiUser = {
  id: string;
  email: string;
  fullName: string;
  username?: string | null;
  roleTitle: string;
  bio?: string | null;
  avatarUrl?: string | null;
  isActive?: boolean;
  isArchived?: boolean;
  projectCount?: number;
  taskCount?: number;
  projectsCount?: number;
  tasksCount?: number;
  totalProjects?: number;
  totalTasks?: number;
  project_count?: number;
  task_count?: number;
  projects_count?: number;
  tasks_count?: number;
  total_projects?: number;
  total_tasks?: number;
  activity?: Record<string, ApiUserActivityTask[]>;
  projects?: ApiUserProject[];
  _meta?: Record<string, unknown>;
  stats?: Record<string, unknown>;
  isDemo?: boolean;
};

export type ApiUserActivityTask = {
  id: string;
  title: string;
  status: string;
  dueDate?: string | null;
  projectName: string;
  completionPercentage?: number;
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
  refreshToken?: string;
  user: ApiUser;
};

export type LogoutResponse = {
  message?: string;
  action?: string;
};

export type MessageResponse = {
  message: string;
  _devOtp?: string;
  accessToken?: string;
  refreshToken?: string;
  user?: ApiUser;
};

export type UpdateProfilePayload = {
  fullName?: string;
  name?: string;
  username?: string;
  roleTitle?: string;
  role?: string;
  bio?: string;
};

export type OtpPurpose = "REGISTER" | "FORGOT_PASSWORD" | "REACTIVATE";
