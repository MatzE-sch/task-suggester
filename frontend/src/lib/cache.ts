import { browser } from '$app/environment';
import type { Task, Category, User, ActivityStats } from './types';

const KEYS = {
  tasks: 'ts_tasks',
  categories: 'ts_categories',
  activityStats: 'ts_activity_stats',
  user: 'ts_user',
};

function save<T>(key: string, data: T): void {
  if (!browser) return;
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}

function load<T>(key: string): T | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export const cacheTasks = (tasks: Task[]) => save(KEYS.tasks, tasks);
export const getCachedTasks = (): Task[] | null => load<Task[]>(KEYS.tasks);

export const cacheCategories = (cats: Category[]) => save(KEYS.categories, cats);
export const getCachedCategories = (): Category[] | null => load<Category[]>(KEYS.categories);

export const cacheActivityStats = (stats: ActivityStats) => save(KEYS.activityStats, stats);
export const getCachedActivityStats = (): ActivityStats | null => load<ActivityStats>(KEYS.activityStats);

export const cacheUser = (user: User) => save(KEYS.user, user);
export const getCachedUser = (): User | null => load<User>(KEYS.user);
