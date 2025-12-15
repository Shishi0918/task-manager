import { Request } from 'express';

export interface AuthRequest extends Request {
  userId?: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  username: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface CreateTaskInput {
  name: string;
  year: number;
  month: number;
  displayOrder: number;
  startDate?: string;
  endDate?: string;
}

export interface UpdateTaskInput {
  name?: string;
  displayOrder?: number;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
}

export interface CompletionInput {
  taskId: string;
  targetDate: string;
  isCompleted: boolean;
}
