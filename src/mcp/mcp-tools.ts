/** Same strings the HTTP controllers use for the demo sandbox. */
export const DEMO_MESSAGES = {
  createProject:
    'The demo workspace already has a sample project. Create an account to add your own.',
  deleteProject: 'The demo project cannot be deleted. It resets every night.',
  addMember: 'The demo account cannot invite people.',
  removeMember: 'The demo account cannot change members.',
} as const;

export const NovaTool = {
  getDashboard: 'get_dashboard',
  search: 'search',
  listProjects: 'list_projects',
  getProject: 'get_project',
  listProjectTasks: 'list_project_tasks',
  getTask: 'get_task',
  listTaskComments: 'list_task_comments',
  createProject: 'create_project',
  updateProject: 'update_project',
  deleteProject: 'delete_project',
  addProjectMember: 'add_project_member',
  updateProjectMember: 'update_project_member',
  removeProjectMember: 'remove_project_member',
  createTask: 'create_task',
  updateTask: 'update_task',
  deleteTask: 'delete_task',
  assignTask: 'assign_task',
  unassignTask: 'unassign_task',
  createSubtask: 'create_subtask',
  updateSubtask: 'update_subtask',
  deleteSubtask: 'delete_subtask',
  assignSubtask: 'assign_subtask',
  unassignSubtask: 'unassign_subtask',
  createTaskComment: 'create_task_comment',
  replyTaskComment: 'reply_task_comment',
  closeTaskComment: 'close_task_comment',
} as const;

export const NOVA_MCP_TOOL_NAMES = Object.values(NovaTool);

/** Tools that must never be exposed. They spend quota or bypass the product. */
export const EXCLUDED_MCP_TOOLS = [
  'ai_description',
  'ai_suggest',
  'admin',
  'delete_account',
] as const;
