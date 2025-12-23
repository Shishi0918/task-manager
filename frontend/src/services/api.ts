import type {
  AuthResponse,
  User,
  Task,
  TaskSourceType,
  MonthlyData,
  Stats,
  Organization,
  Project,
  ProjectMember,
  ProjectTask,
  ProjectDetail,
} from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class ApiError extends Error {
  status?: number;

  constructor(
    message: string,
    status?: number
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    const errorMessage = typeof error.error === 'string'
      ? error.error
      : (error.error ? JSON.stringify(error.error) : 'Request failed');
    throw new ApiError(errorMessage, response.status);
  }
  if (response.status === 204) {
    return {} as T;
  }
  return response.json();
};

// Auth API
export const authApi = {
  register: async (
    email: string,
    password: string,
    username: string
  ): Promise<AuthResponse> => {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username }),
    });
    return handleResponse<AuthResponse>(response);
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return handleResponse<AuthResponse>(response);
  },

  me: async (): Promise<{ user: User }> => {
    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{ user: User }>(response);
  },
};

// Task API
export const taskApi = {
  getTasks: async (year: number, month: number): Promise<{ tasks: Task[] }> => {
    const response = await fetch(
      `${API_URL}/api/tasks?year=${year}&month=${month}`,
      {
        headers: getAuthHeaders(),
      }
    );
    return handleResponse<{ tasks: Task[] }>(response);
  },

  createTask: async (
    name: string,
    year: number,
    month: number,
    displayOrder: number,
    startDate?: string,
    endDate?: string,
    startTime?: string | null,
    endTime?: string | null,
    sourceType?: TaskSourceType | null
  ): Promise<{ task: Task }> => {
    const response = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, year, month, displayOrder, startDate, endDate, startTime, endTime, sourceType }),
    });
    return handleResponse<{ task: Task }>(response);
  },

  updateTask: async (
    id: string,
    data: Partial<Pick<Task, 'name' | 'displayOrder' | 'startDate' | 'endDate' | 'startTime' | 'endTime' | 'isActive' | 'isCompleted' | 'parentId'>>
  ): Promise<{ task: Task }> => {
    const response = await fetch(`${API_URL}/api/tasks/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ task: Task }>(response);
  },

  deleteTask: async (id: string): Promise<void> => {
    const response = await fetch(`${API_URL}/api/tasks/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<void>(response);
  },

  carryForwardTasks: async (
    year: number,
    month: number
  ): Promise<{ message: string; count: number; nextYear: number; nextMonth: number }> => {
    const response = await fetch(
      `${API_URL}/api/tasks/carry-forward?year=${year}&month=${month}`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
      }
    );
    return handleResponse<{ message: string; count: number; nextYear: number; nextMonth: number }>(response);
  },
};

// Completion API
export const completionApi = {
  getCompletions: async (year: number, month: number): Promise<MonthlyData> => {
    const response = await fetch(
      `${API_URL}/api/completions?year=${year}&month=${month}`,
      {
        headers: getAuthHeaders(),
      }
    );
    return handleResponse<MonthlyData>(response);
  },

  upsertCompletion: async (
    taskId: string,
    targetDate: string,
    isCompleted: boolean
  ): Promise<void> => {
    const response = await fetch(`${API_URL}/api/completions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ taskId, targetDate, isCompleted }),
    });
    return handleResponse<void>(response);
  },

  getStats: async (year: number, month: number): Promise<Stats> => {
    const response = await fetch(
      `${API_URL}/api/completions/stats?year=${year}&month=${month}`,
      {
        headers: getAuthHeaders(),
      }
    );
    return handleResponse<Stats>(response);
  },
};

// Template API
export const templateApi = {
  getTemplates: async (): Promise<{ templates: Array<{ templateName: string; createdAt: string; updatedAt: string }> }> => {
    const response = await fetch(`${API_URL}/api/templates`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{ templates: Array<{ templateName: string; createdAt: string; updatedAt: string }> }>(response);
  },

  saveTemplate: async (
    templateName: string,
    year: number,
    month: number
  ): Promise<{ message: string; templateName: string; count: number }> => {
    const response = await fetch(
      `${API_URL}/api/templates/save?year=${year}&month=${month}`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ templateName }),
      }
    );
    return handleResponse<{ message: string; templateName: string; count: number }>(response);
  },

  applyTemplate: async (
    templateName: string,
    year: number,
    month: number
  ): Promise<{ message: string; templateName: string; count: number }> => {
    const response = await fetch(`${API_URL}/api/templates/apply`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ templateName, year, month }),
    });
    return handleResponse<{ message: string; templateName: string; count: number }>(response);
  },

  deleteTemplate: async (
    templateName: string
  ): Promise<{ message: string; templateName: string; count: number }> => {
    const response = await fetch(`${API_URL}/api/templates/delete`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ templateName }),
    });
    return handleResponse<{ message: string; templateName: string; count: number }>(response);
  },

  saveMonthlyTemplate: async (
    templateName: string,
    tasks: Array<{
      name: string;
      displayOrder: number;
      startDay: number | null;
      endDay: number | null;
      startTime?: string | null;
      endTime?: string | null;
      parentIndex?: number | null;
    }>
  ): Promise<{ message: string; templateName: string; count: number }> => {
    const response = await fetch(`${API_URL}/api/templates/save-monthly`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ templateName, tasks }),
    });
    return handleResponse<{ message: string; templateName: string; count: number }>(response);
  },

  getTemplateDetails: async (
    templateName: string
  ): Promise<{
    templateName: string;
    tasks: Array<{
      id: string;
      name: string;
      displayOrder: number;
      startDay: number | null;
      endDay: number | null;
      startTime: string | null;
      endTime: string | null;
      parentId: string | null;
    }>;
  }> => {
    const response = await fetch(`${API_URL}/api/templates/${encodeURIComponent(templateName)}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{
      templateName: string;
      tasks: Array<{
        id: string;
        name: string;
        displayOrder: number;
        startDay: number | null;
        endDay: number | null;
        startTime: string | null;
        endTime: string | null;
        parentId: string | null;
      }>;
    }>(response);
  },

  saveYearlyTemplate: async (
    templateName: string,
    tasks: Array<{
      name: string;
      displayOrder: number;
      startMonth: number | null;
      endMonth: number | null;
    }>
  ): Promise<{ message: string; templateName: string; count: number }> => {
    const response = await fetch(`${API_URL}/api/templates/save-yearly`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ templateName, tasks }),
    });
    return handleResponse<{ message: string; templateName: string; count: number }>(response);
  },

  getYearlyTemplateDetails: async (
    templateName: string
  ): Promise<{
    templateName: string;
    tasks: Array<{
      name: string;
      displayOrder: number;
      startMonth: number | null;
      endMonth: number | null;
    }>;
  }> => {
    const response = await fetch(`${API_URL}/api/templates/yearly/${encodeURIComponent(templateName)}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{
      templateName: string;
      tasks: Array<{
        name: string;
        displayOrder: number;
        startMonth: number | null;
        endMonth: number | null;
      }>;
    }>(response);
  },
};

// Organization API
export const organizationApi = {
  create: async (name: string): Promise<{ organization: Organization }> => {
    const response = await fetch(`${API_URL}/api/organization`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name }),
    });
    return handleResponse<{ organization: Organization }>(response);
  },

  get: async (): Promise<{ organization: Organization }> => {
    const response = await fetch(`${API_URL}/api/organization`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{ organization: Organization }>(response);
  },

  invite: async (email: string): Promise<{ message: string; invitation: { id: string; email: string; expiresAt: string } }> => {
    const response = await fetch(`${API_URL}/api/organization/invite`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ email }),
    });
    return handleResponse<{ message: string; invitation: { id: string; email: string; expiresAt: string } }>(response);
  },

  acceptInvitation: async (token: string): Promise<{ message: string; organizationName: string }> => {
    const response = await fetch(`${API_URL}/api/organization/accept-invitation`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ token }),
    });
    return handleResponse<{ message: string; organizationName: string }>(response);
  },

  removeUser: async (userId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_URL}/api/organization/users/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ message: string }>(response);
  },

  cancelInvitation: async (invitationId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_URL}/api/organization/invitations/${invitationId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ message: string }>(response);
  },

  leave: async (): Promise<{ message: string }> => {
    const response = await fetch(`${API_URL}/api/organization/leave`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ message: string }>(response);
  },
};

// SpotTask type
export interface SpotTask {
  id: string;
  name: string;
  displayOrder: number;
  implementationYear: number;
  implementationMonth: number;
  startDay: number | null;
  endDay: number | null;
  parentId?: string | null;
  children?: SpotTask[];
  level?: number;
}

// SpotTask API
export const spotTaskApi = {
  getAll: async (): Promise<{ spotTasks: SpotTask[] }> => {
    const response = await fetch(`${API_URL}/api/spot-tasks`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{ spotTasks: SpotTask[] }>(response);
  },

  getByYearMonth: async (year: number, month: number): Promise<{ spotTasks: SpotTask[] }> => {
    const response = await fetch(`${API_URL}/api/spot-tasks/${year}/${month}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{ spotTasks: SpotTask[] }>(response);
  },

  create: async (data: Omit<SpotTask, 'id'>): Promise<{ spotTask: SpotTask }> => {
    const response = await fetch(`${API_URL}/api/spot-tasks`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ spotTask: SpotTask }>(response);
  },

  update: async (id: string, data: Partial<SpotTask>): Promise<{ spotTask: SpotTask }> => {
    const response = await fetch(`${API_URL}/api/spot-tasks/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ spotTask: SpotTask }>(response);
  },

  delete: async (id: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_URL}/api/spot-tasks/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ message: string }>(response);
  },

  bulkDelete: async (ids: string[]): Promise<{ message: string; count: number }> => {
    const response = await fetch(`${API_URL}/api/spot-tasks/bulk-delete`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ids }),
    });
    return handleResponse<{ message: string; count: number }>(response);
  },

  bulkSave: async (tasks: Omit<SpotTask, 'id'>[]): Promise<{ message: string; count: number; spotTasks: SpotTask[] }> => {
    const response = await fetch(`${API_URL}/api/spot-tasks/bulk-save`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ tasks }),
    });
    return handleResponse<{ message: string; count: number; spotTasks: SpotTask[] }>(response);
  },
};

// YearlyTask type
export interface YearlyTask {
  id: string;
  name: string;
  displayOrder: number;
  implementationMonth: number | null;
  startDay: number | null;
  endDay: number | null;
  parentId?: string | null;
  children?: YearlyTask[];
  level?: number;
}

// YearlyTask API
export const yearlyTaskApi = {
  getAll: async (): Promise<{ yearlyTasks: YearlyTask[] }> => {
    const response = await fetch(`${API_URL}/api/yearly-tasks`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{ yearlyTasks: YearlyTask[] }>(response);
  },

  bulkSave: async (
    tasks: Array<{
      name: string;
      displayOrder: number;
      implementationMonth: number | null;
      startDay: number | null;
      endDay: number | null;
      parentIndex?: number | null;
    }>
  ): Promise<{ message: string; count: number; yearlyTasks: YearlyTask[] }> => {
    const response = await fetch(`${API_URL}/api/yearly-tasks/bulk-save`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ tasks }),
    });
    return handleResponse<{ message: string; count: number; yearlyTasks: YearlyTask[] }>(response);
  },
};

// WeeklyTask types
export interface WeeklyTaskSchedule {
  dayOfWeek: number; // 0=月, 1=火, 2=水, 3=木, 4=金, 5=土, 6=日
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
}

export interface WeeklyTask {
  id: string;
  name: string;
  displayOrder: number;
  parentId?: string | null;
  children?: WeeklyTask[];
  schedules?: WeeklyTaskSchedule[];
  level?: number;
}

// WeeklyTask API
export const weeklyTaskApi = {
  getAll: async (): Promise<{ weeklyTasks: WeeklyTask[] }> => {
    const response = await fetch(`${API_URL}/api/weekly-tasks`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{ weeklyTasks: WeeklyTask[] }>(response);
  },

  updateSchedule: async (
    taskId: string,
    schedule: WeeklyTaskSchedule
  ): Promise<{ schedule: WeeklyTaskSchedule }> => {
    const response = await fetch(`${API_URL}/api/weekly-tasks/${taskId}/schedule`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(schedule),
    });
    return handleResponse<{ schedule: WeeklyTaskSchedule }>(response);
  },

  deleteSchedule: async (
    taskId: string,
    dayOfWeek: number
  ): Promise<{ message: string }> => {
    const response = await fetch(`${API_URL}/api/weekly-tasks/${taskId}/schedule/${dayOfWeek}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ message: string }>(response);
  },

  bulkSave: async (
    tasks: Array<{
      name: string;
      displayOrder: number;
      parentIndex?: number | null;
      schedules?: WeeklyTaskSchedule[];
    }>
  ): Promise<{ message: string; count: number }> => {
    const response = await fetch(`${API_URL}/api/weekly-tasks/bulk-save`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ tasks }),
    });
    return handleResponse<{ message: string; count: number }>(response);
  },

  bulkDelete: async (ids: string[]): Promise<{ message: string; count: number }> => {
    const response = await fetch(`${API_URL}/api/weekly-tasks/bulk-delete`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ids }),
    });
    return handleResponse<{ message: string; count: number }>(response);
  },
};

// DailyTask types
export interface DailyTask {
  id: string;
  name: string;
  displayOrder: number;
  startTime: string | null;
  endTime: string | null;
  parentId?: string | null;
  children?: DailyTask[];
  level?: number;
}

// DailyTask API
export const dailyTaskApi = {
  getAll: async (): Promise<{ dailyTasks: DailyTask[] }> => {
    const response = await fetch(`${API_URL}/api/daily-tasks`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{ dailyTasks: DailyTask[] }>(response);
  },

  bulkSave: async (
    tasks: Array<{
      name: string;
      displayOrder: number;
      startTime: string | null;
      endTime: string | null;
      parentIndex?: number | null;
    }>
  ): Promise<{ message: string; count: number }> => {
    const response = await fetch(`${API_URL}/api/daily-tasks/bulk-save`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ tasks }),
    });
    return handleResponse<{ message: string; count: number }>(response);
  },

  bulkDelete: async (ids: string[]): Promise<{ message: string; count: number }> => {
    const response = await fetch(`${API_URL}/api/daily-tasks/bulk-delete`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ids }),
    });
    return handleResponse<{ message: string; count: number }>(response);
  },
};

// Project API
export const projectApi = {
  getAll: async (): Promise<{ projects: Project[] }> => {
    const response = await fetch(`${API_URL}/api/projects`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{ projects: Project[] }>(response);
  },

  get: async (id: string): Promise<{ project: ProjectDetail }> => {
    const response = await fetch(`${API_URL}/api/projects/${id}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{ project: ProjectDetail }>(response);
  },

  create: async (data: {
    name: string;
    members?: Array<{ name: string; color: string }>;
  }): Promise<{ project: ProjectDetail }> => {
    const response = await fetch(`${API_URL}/api/projects`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ project: ProjectDetail }>(response);
  },

  update: async (id: string, data: { name?: string }): Promise<{ project: Project }> => {
    const response = await fetch(`${API_URL}/api/projects/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ project: Project }>(response);
  },

  delete: async (id: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_URL}/api/projects/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ message: string }>(response);
  },

  bulkDelete: async (ids: string[]): Promise<{ message: string; count: number }> => {
    const response = await fetch(`${API_URL}/api/projects/bulk-delete`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ids }),
    });
    return handleResponse<{ message: string; count: number }>(response);
  },

  // Members
  getMembers: async (projectId: string): Promise<{ members: ProjectMember[] }> => {
    const response = await fetch(`${API_URL}/api/projects/${projectId}/members`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{ members: ProjectMember[] }>(response);
  },

  addMember: async (
    projectId: string,
    data: { name: string; color: string }
  ): Promise<{ member: ProjectMember }> => {
    const response = await fetch(`${API_URL}/api/projects/${projectId}/members`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ member: ProjectMember }>(response);
  },

  updateMember: async (
    projectId: string,
    memberId: string,
    data: { name?: string; color?: string }
  ): Promise<{ member: ProjectMember }> => {
    const response = await fetch(`${API_URL}/api/projects/${projectId}/members/${memberId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ member: ProjectMember }>(response);
  },

  deleteMember: async (projectId: string, memberId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_URL}/api/projects/${projectId}/members/${memberId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ message: string }>(response);
  },

  bulkSaveMembers: async (
    projectId: string,
    members: Array<{ name: string; color: string }>
  ): Promise<{ members: ProjectMember[] }> => {
    const response = await fetch(`${API_URL}/api/projects/${projectId}/members/bulk-save`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ members }),
    });
    return handleResponse<{ members: ProjectMember[] }>(response);
  },

  // Tasks
  getTasks: async (projectId: string): Promise<{ tasks: ProjectTask[] }> => {
    const response = await fetch(`${API_URL}/api/projects/${projectId}/tasks`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{ tasks: ProjectTask[] }>(response);
  },

  createTask: async (
    projectId: string,
    data: {
      name: string;
      memberId?: string | null;
      parentId?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      displayOrder: number;
    }
  ): Promise<{ task: ProjectTask }> => {
    const response = await fetch(`${API_URL}/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ task: ProjectTask }>(response);
  },

  updateTask: async (
    projectId: string,
    taskId: string,
    data: {
      name?: string;
      memberId?: string | null;
      parentId?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      displayOrder?: number;
      isCompleted?: boolean;
    }
  ): Promise<{ task: ProjectTask }> => {
    const response = await fetch(`${API_URL}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ task: ProjectTask }>(response);
  },

  deleteTask: async (projectId: string, taskId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_URL}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ message: string }>(response);
  },

  bulkDeleteTasks: async (
    projectId: string,
    ids: string[]
  ): Promise<{ message: string; count: number }> => {
    const response = await fetch(`${API_URL}/api/projects/${projectId}/tasks/bulk-delete`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ids }),
    });
    return handleResponse<{ message: string; count: number }>(response);
  },
};
