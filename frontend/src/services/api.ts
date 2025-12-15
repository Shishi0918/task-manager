import type {
  AuthResponse,
  User,
  Task,
  MonthlyData,
  Stats,
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
    throw new ApiError(
      error.error || 'Request failed',
      response.status
    );
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
    endDate?: string
  ): Promise<{ task: Task }> => {
    const response = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, year, month, displayOrder, startDate, endDate }),
    });
    return handleResponse<{ task: Task }>(response);
  },

  updateTask: async (
    id: string,
    data: Partial<Pick<Task, 'name' | 'displayOrder' | 'startDate' | 'endDate' | 'isActive' | 'isCompleted'>>
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
};
