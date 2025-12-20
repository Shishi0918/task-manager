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
  parentId?: string | null;
  children?: Task[];
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
  parentId?: string | null;
  children?: TaskWithCompletions[];
  completions: Record<string, boolean>;
  level?: number; // 階層レベル（0=ルート、1=第1階層、2=第2階層）
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

export interface SubscriptionStatus {
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
  planType: 'INDIVIDUAL' | 'ORGANIZATION';
  trialEndsAt: string | null;
  trialDaysRemaining: number;
  currentPeriodEnd: string | null;
  isActive: boolean;
  organizationName: string | null;
  userRole: 'ADMIN' | 'MEMBER';
}

export interface Organization {
  id: string;
  name: string;
  subscriptionStatus: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  maxUsers: number;
  users: OrganizationMember[];
  invitations: Invitation[];
}

export interface OrganizationMember {
  id: string;
  email: string;
  username: string;
  role: 'ADMIN' | 'MEMBER';
  createdAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
}

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
