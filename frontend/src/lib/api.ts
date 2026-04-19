import { browser } from '$app/environment';
import { PUBLIC_API_URL } from '$env/static/public';
import type { Task, Category, User, ActivityStats, SuggestMode } from './types';

const BASE = PUBLIC_API_URL;

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
  return request<User>('/auth/me');
}

export function logout() {
  localStorage.removeItem('token');
}

// Tasks
export async function getTasks(): Promise<Task[]> {
  return request<Task[]>('/tasks');
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
  return request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateTask(id: number, data: Partial<{
  title: string;
  description: string;
  task_type: string;
  deadline: string | null;
  recurrence_days: number | null;
  status: string;
  category_ids: number[];
  dependency_ids: number[];
}>): Promise<Task> {
  return request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteTask(id: number): Promise<void> {
  return request<void>(`/tasks/${id}`, { method: 'DELETE' });
}

export async function taskAction(id: number, action: string, newTask?: {
  title: string;
  description?: string;
  deadline?: string;
  category_ids?: number[];
}, snoozedUntil?: string): Promise<Task> {
  const d = new Date();
  const logged_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return request<Task>(`/tasks/${id}/action`, {
    method: 'POST',
    body: JSON.stringify({ action, new_task: newTask, snoozed_until: snoozedUntil, logged_date }),
  });
}

export async function getActivityStats(): Promise<ActivityStats> {
  return request<ActivityStats>('/tasks/stats/activity');
}

// Suggest
export async function getSuggestion(mode: SuggestMode, categoryIds: number[] = []): Promise<Task> {
  return request<Task>('/suggest', {
    method: 'POST',
    body: JSON.stringify({ mode, category_ids: categoryIds }),
  });
}

// Categories
export async function getCategories(): Promise<Category[]> {
  return request<Category[]>('/categories');
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
