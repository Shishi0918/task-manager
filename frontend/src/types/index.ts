export interface User {
  id: string;
  email: string;
  username: string;
}

export interface Task {
  id: string;
  name: string;
  year: number;
  month: number;
  displayOrder: number;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskWithCompletions {
  id: string;
  name: string;
  year: number;
  month: number;
  displayOrder: number;
  startDate?: string | null;
  endDate?: string | null;
  isCompleted: boolean;
  completions: Record<string, boolean>;
}

export interface MonthlyData {
  year: number;
  month: number;
  tasks: TaskWithCompletions[];
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface Stats {
  year: number;
  month: number;
  totalTasks: number;
  daysInMonth: number;
  completedCount: number;
  totalPossibleCompletions: number;
  completionRate: number;
}
