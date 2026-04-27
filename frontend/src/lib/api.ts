import { browser } from '$app/environment';
import { PUBLIC_API_URL } from '$env/static/public';
import type { Task, Category, User, ActivityStats, SuggestMode, TaskType, ActivityLogEntry } from './types';
import {
  cacheTasks, getCachedTasks,
  cacheCategories, getCachedCategories,
  cacheActivityStats, getCachedActivityStats,
  cacheUser, getCachedUser,
} from './cache';
import { queueMutation } from './stores/offline';

const BASE = PUBLIC_API_URL;

function offline(): boolean {
  return browser && !navigator.onLine;
}

function getToken(): string | null {
  if (!browser) return null;
  return localStorage.getItem('token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Auth
export async function login(username: string, password: string): Promise<void> {
  const form = new URLSearchParams({ username, password });
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!res.ok) throw new Error('Login fehlgeschlagen');
  const data = await res.json();
  localStorage.setItem('token', data.access_token);
}

export async function register(username: string, password: string, inviteCode: string): Promise<void> {
  await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, invite_code: inviteCode }),
  });
  await login(username, password);
}

export async function getMe(): Promise<User> {
  if (offline()) {
    const cached = getCachedUser();
    if (cached) return cached;
    throw new Error('Offline');
  }
  try {
    const u = await request<User>('/auth/me');
    cacheUser(u);
    return u;
  } catch (e) {
    // TypeError = fetch konnte Server nicht erreichen (kein/schlechtes Netz)
    // In dem Fall gecachten User zurückgeben statt ausloggen
    if (e instanceof TypeError) {
      const cached = getCachedUser();
      if (cached) return cached;
    }
    throw e;
  }
}

export function logout() {
  localStorage.removeItem('token');
}

// Tasks
export async function getTasks(): Promise<Task[]> {
  try {
    const tasks = await request<Task[]>('/tasks');
    cacheTasks(tasks);
    return tasks;
  } catch (e) {
    const cached = getCachedTasks();
    if (cached) return cached;
    throw e;
  }
}

export async function createTask(data: {
  title: string;
  description?: string;
  task_type?: string;
  deadline?: string;
  recurrence_days?: number | null;
  category_ids?: number[];
  dependency_ids?: number[];
}): Promise<Task> {
  if (offline()) {
    const now = new Date().toISOString();
    const tempTask: Task = {
      id: -Date.now(),
      title: data.title,
      description: data.description ?? null,
      task_type: (data.task_type as TaskType) ?? 'normal',
      status: 'open',
      deadline: data.deadline ?? null,
      recurrence_days: data.recurrence_days ?? null,
      snoozed_until: null,
      skip_count: 0,
      owner_id: 0,
      created_at: now,
      updated_at: now,
      categories: [],
      dependency_ids: data.dependency_ids ?? [],
    };
    cacheTasks([...(getCachedTasks() ?? []), tempTask]);
    queueMutation('POST', '/tasks', JSON.stringify(data));
    return tempTask;
  }
  const task = await request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) });
  cacheTasks([...(getCachedTasks() ?? []), task]);
  return task;
}

export async function updateTask(id: number, data: Partial<{
  title: string;
  description: string;
  task_type: string;
  deadline: string | null;
  recurrence_days: number | null;
  status: string;
  snoozed_until: string;
  category_ids: number[];
  dependency_ids: number[];
}>): Promise<Task> {
  if (offline()) {
    const cached = getCachedTasks() ?? [];
    const existing = cached.find((t) => t.id === id);
    if (!existing) throw new Error('Task nicht gefunden');
    const updated = { ...existing, ...data, updated_at: new Date().toISOString() } as Task;
    cacheTasks(cached.map((t) => (t.id === id ? updated : t)));
    queueMutation('PATCH', `/tasks/${id}`, JSON.stringify(data));
    return updated;
  }
  const task = await request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  const cached = getCachedTasks() ?? [];
  cacheTasks(cached.map((t) => (t.id === task.id ? task : t)));
  return task;
}

export async function deleteTask(id: number): Promise<void> {
  if (offline()) {
    cacheTasks((getCachedTasks() ?? []).filter((t) => t.id !== id));
    queueMutation('DELETE', `/tasks/${id}`, null);
    return;
  }
  await request<void>(`/tasks/${id}`, { method: 'DELETE' });
  cacheTasks((getCachedTasks() ?? []).filter((t) => t.id !== id));
}

export async function taskAction(id: number, action: string, newTask?: {
  title: string;
  description?: string;
  deadline?: string;
  category_ids?: number[];
}, snoozedUntil?: string): Promise<Task> {
  const d = new Date();
  const logged_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const body = JSON.stringify({ action, new_task: newTask, snoozed_until: snoozedUntil, logged_date });

  if (offline()) {
    const cached = getCachedTasks() ?? [];
    const existing = cached.find((t) => t.id === id);
    if (!existing) throw new Error('Task nicht gefunden');
    const statusMap: Record<string, Task['status']> = {
      done: 'done', start: 'in_progress', waiting: 'waiting', block: 'waiting', skip: 'open',
    };
    const updated: Task = {
      ...existing,
      status: statusMap[action] ?? existing.status,
      snoozed_until: action === 'waiting' ? (snoozedUntil ?? null) : existing.snoozed_until,
      skip_count: action === 'skip' ? existing.skip_count + 1 : existing.skip_count,
      updated_at: new Date().toISOString(),
    };
    cacheTasks(cached.map((t) => (t.id === id ? updated : t)));
    queueMutation('POST', `/tasks/${id}/action`, body);
    return updated;
  }

  const task = await request<Task>(`/tasks/${id}/action`, { method: 'POST', body });
  const cached = getCachedTasks() ?? [];
  cacheTasks(cached.map((t) => (t.id === task.id ? task : t)));
  return task;
}

export async function getActivityStats(): Promise<ActivityStats> {
  try {
    const stats = await request<ActivityStats>('/tasks/stats/activity');
    cacheActivityStats(stats);
    return stats;
  } catch (e) {
    const cached = getCachedActivityStats();
    if (cached) return cached;
    throw e;
  }
}

// Task Log
export async function getTaskLog(): Promise<ActivityLogEntry[]> {
  return request<ActivityLogEntry[]>('/tasks/log');
}

export async function deleteTaskLog(id: number): Promise<void> {
  return request<void>(`/tasks/log/${id}`, { method: 'DELETE' });
}

export async function updateTaskLog(id: number, data: { category_ids?: number[]; logged_date?: string }): Promise<ActivityLogEntry> {
  return request<ActivityLogEntry>(`/tasks/log/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

// Suggest
export async function getSuggestion(mode: SuggestMode, categoryIds: number[] = []): Promise<Task> {
  if (offline()) {
    const cached = getCachedTasks() ?? [];
    const eligible = cached.filter((t) => {
      if (t.status !== 'open' && t.status !== 'in_progress') return false;
      if (categoryIds.length > 0 && !t.categories.some((c) => categoryIds.includes(c.id))) return false;
      return true;
    });
    if (eligible.length === 0) throw new Error('Keine passenden Aufgaben offline verfügbar');
    return eligible[Math.floor(Math.random() * eligible.length)];
  }
  return request<Task>('/suggest', {
    method: 'POST',
    body: JSON.stringify({ mode, category_ids: categoryIds }),
  });
}

// Categories
export async function getCategories(): Promise<Category[]> {
  try {
    const cats = await request<Category[]>('/categories');
    cacheCategories(cats);
    return cats;
  } catch (e) {
    const cached = getCachedCategories();
    if (cached) return cached;
    throw e;
  }
}

export async function createCategory(data: { name: string; color: string; icon?: string }): Promise<Category> {
  return request<Category>('/categories', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateCategory(id: number, data: Partial<{ name: string; color: string; icon: string; sort_order: number }>): Promise<Category> {
  return request<Category>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteCategory(id: number): Promise<void> {
  return request<void>(`/categories/${id}`, { method: 'DELETE' });
}

// Invites
export interface InviteCode {
  id: number;
  code: string;
  used: boolean;
}

export async function createInvite(): Promise<InviteCode> {
  return request<InviteCode>('/invites', { method: 'POST' });
}

export async function getInvites(): Promise<InviteCode[]> {
  return request<InviteCode[]>('/invites');
}

// ICS Export
export async function downloadIcs(): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}/export/ics`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Export fehlgeschlagen');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tasks.ics';
  a.click();
  URL.revokeObjectURL(url);
}
