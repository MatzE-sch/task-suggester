export type TaskStatus = 'open' | 'in_progress' | 'waiting' | 'done' | 'skipped';
export type SuggestMode = 'random' | 'deadline' | 'category';

export interface Category {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  sort_order: number;
}

export type TaskType = 'normal' | 'deadline' | 'recurring';

export interface Task {
  id: number;
  title: string;
  description: string | null;
  task_type: TaskType;
  status: TaskStatus;
  deadline: string | null;
  recurrence_days: number | null;
  snoozed_until: string | null;
  skip_count: number;
  owner_id: number;
  created_at: string;
  updated_at: string;
  categories: Category[];
  dependency_ids: number[];
}

export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface ActivityDay {
  count: number;
  category_ids: number[];
  category_counts: Record<string, number>;
}

export type ActivityStats = Record<string, ActivityDay>;
