import { browser } from '$app/environment';
import { PUBLIC_API_URL } from '$env/static/public';
import type { Task, Category, User, ActivityStats, SuggestMode, TaskType, ActivityLogEntry, BlockSettings } from './types';
import {
  cacheTasks, getCachedTasks,
  cacheCategories, getCachedCategories,
  cacheActivityStats, getCachedActivityStats,
  cacheUser, getCachedUser,
  cacheBlockSettings, getCachedBlockSettings,
} from './cache';
import { queueMutation, cancelTempTask } from './stores/offline';
import { logEvent, setTelemetryUser } from './telemetry';

const BASE = PUBLIC_API_URL;

export class ApiError extends Error {
  constructor(public status: number, detail: string) {
    super(detail);
  }
}

function offline(): boolean {
  return browser && !navigator.onLine;
}

function getToken(): string | null {
  if (!browser) return null;
  return localStorage.getItem('token');
}

// Gastmodus (kein Login): rein lokal arbeiten, Mutationen sammeln sich in der
// Offline-Queue und werden beim Login in den Account hochgeladen
function localOnly(): boolean {
  return offline() || !getToken();
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
    throw new ApiError(res.status, err.detail ?? 'Request failed');
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
  if (!res.ok) {
    logEvent('auth.login_failed', { username }, 'warn');
    throw new Error('Login fehlgeschlagen');
  }
  const data = await res.json();
  localStorage.setItem('token', data.access_token);
  setTelemetryUser(username);
  logEvent('auth.login', { username });
}

export async function register(username: string, password: string, inviteCode: string): Promise<void> {
  await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, invite_code: inviteCode }),
  });
  logEvent('auth.register', { username });
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
    setTelemetryUser(u.username);
    return u;
  } catch (e) {
    // Nur bei 401 (Token ungültig/abgelaufen) durchreichen — alles andere
    // (Netzwerkfehler, 5xx während Deploy/Neustart) darf nicht ausloggen
    if (!(e instanceof ApiError && e.status === 401)) {
      const cached = getCachedUser();
      if (cached) return cached;
    }
    throw e;
  }
}

export function logout() {
  logEvent('auth.logout');
  localStorage.removeItem('token');
  setTelemetryUser(null);
}

// Tasks
export async function getTasks(): Promise<Task[]> {
  if (!getToken()) return getCachedTasks() ?? [];
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
  priority?: number;
  category_ids?: number[];
  dependency_ids?: number[];
}): Promise<Task> {
  logEvent('task.created', { task_type: data.task_type ?? 'normal', local: localOnly() });
  if (localOnly()) {
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
      last_completed_at: null,
      skip_count: 0,
      priority: data.priority ?? 3,
      owner_id: 0,
      created_at: now,
      updated_at: now,
      categories: [],
      dependency_ids: data.dependency_ids ?? [],
    };
    cacheTasks([...(getCachedTasks() ?? []), tempTask]);
    queueMutation('POST', '/tasks', JSON.stringify(data), tempTask.id);
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
  priority: number;
  category_ids: number[];
  dependency_ids: number[];
}>): Promise<Task> {
  logEvent('task.updated', { task_id: id, local: localOnly() });
  if (localOnly()) {
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
  logEvent('task.deleted', { task_id: id, local: localOnly() });
  if (id < 0) {
    // Nie gesyncter Temp-Task: komplett aus Queue + Cache entfernen, nie zum Server
    cancelTempTask(id);
    cacheTasks((getCachedTasks() ?? []).filter((t) => t.id !== id));
    return;
  }
  if (localOnly()) {
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
  logEvent('task.action', { task_id: id, action, local: localOnly() });

  if (localOnly()) {
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
  if (!getToken()) return getCachedActivityStats() ?? {};
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

// Task Log — Server-only; als Gast/offline leer statt Fehler
export async function getTaskLog(): Promise<ActivityLogEntry[]> {
  if (localOnly()) return [];
  try {
    return await request<ActivityLogEntry[]>('/tasks/log');
  } catch {
    return [];
  }
}

export async function deleteTaskLog(id: number): Promise<void> {
  return request<void>(`/tasks/log/${id}`, { method: 'DELETE' });
}

export async function updateTaskLog(id: number, data: { category_ids?: number[]; logged_date?: string }): Promise<ActivityLogEntry> {
  return request<ActivityLogEntry>(`/tasks/log/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

// Suggest — vollständig client-side, kein Server-Request nötig
function recurringPct(t: Task): number {
  if (!t.recurrence_days) return -1;
  if (t.last_completed_at)
    return (Date.now() - new Date(t.last_completed_at).getTime()) / (t.recurrence_days * 86400000) * 100;
  if (!t.snoozed_until) return -1;
  const due = new Date(t.snoozed_until).getTime();
  return (Date.now() - (due - t.recurrence_days * 86400000)) / (t.recurrence_days * 86400000) * 100;
}

export function isEligible(task: Task, tasks: Task[], mode: SuggestMode, categoryIds: number[]): boolean {
  const now = Date.now();
  const doneIds = new Set(tasks.filter((t) => t.status === 'done' || t.status === 'skipped').map((t) => t.id));
  if (task.status !== 'open' && task.status !== 'in_progress') return false;
  if (task.snoozed_until && new Date(task.snoozed_until).getTime() > now) return false;
  if (task.dependency_ids.some((id) => !doneIds.has(id))) return false;
  if (mode === 'category' && categoryIds.length > 0 && !task.categories.some((c) => categoryIds.includes(c.id))) return false;
  return true;
}

export function pickSuggestion(tasks: Task[], mode: SuggestMode, categoryIds: number[]): Task {
  const eligible = tasks.filter((t) => isEligible(t, tasks, mode, categoryIds));
  logEvent('suggest.pick', { mode, eligible: eligible.length });
  if (eligible.length === 0) throw new Error('No eligible tasks');
  if (mode === 'deadline') {
    const withDl = eligible
      .filter((t) => t.deadline)
      .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());
    return withDl[0] ?? eligible[Math.floor(Math.random() * eligible.length)];
  }
  if (mode === 'recurring') {
    const rec = eligible.filter((t) => t.task_type === 'recurring');
    if (rec.length > 0) return rec.sort((a, b) => recurringPct(b) - recurringPct(a))[0];
  }
  if (mode === 'prio') {
    return eligible.sort((a, b) => b.priority - a.priority)[0];
  }
  return eligible[Math.floor(Math.random() * eligible.length)];
}

export function getSuggestion(mode: SuggestMode, categoryIds: number[] = []): Task {
  return pickSuggestion(getCachedTasks() ?? [], mode, categoryIds);
}

// Categories
export async function getCategories(): Promise<Category[]> {
  if (!getToken()) return getCachedCategories() ?? [];
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
  logEvent('category.created', { name: data.name });
  return request<Category>('/categories', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateCategory(id: number, data: Partial<{ name: string; color: string; icon: string; sort_order: number }>): Promise<Category> {
  return request<Category>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteCategory(id: number): Promise<void> {
  logEvent('category.deleted', { category_id: id });
  return request<void>(`/categories/${id}`, { method: 'DELETE' });
}

// Block-Settings (App-Blocker der Android-App)
export async function getBlockSettings(): Promise<BlockSettings> {
  if (!getToken()) {
    return getCachedBlockSettings() ?? { enabled: false, blocked_packages: [], schedule_windows: [] };
  }
  try {
    const s = await request<BlockSettings>('/block-settings');
    cacheBlockSettings(s);
    return s;
  } catch (e) {
    const cached = getCachedBlockSettings();
    if (cached) return cached;
    throw e;
  }
}

export async function putBlockSettings(s: BlockSettings): Promise<BlockSettings> {
  logEvent('blocklist.updated', {
    enabled: s.enabled,
    apps: s.blocked_packages.length,
    windows: s.schedule_windows.length,
  });
  cacheBlockSettings(s);
  // Gast: nur lokal speichern, nie queuen — Geräte-Config gehört nicht in den Account-Merge
  if (!getToken()) return s;
  if (offline()) {
    queueMutation('PUT', '/block-settings', JSON.stringify(s));
    return s;
  }
  return request<BlockSettings>('/block-settings', { method: 'PUT', body: JSON.stringify(s) });
}

// Invites
export interface InviteCode {
  id: number;
  code: string;
  used: boolean;
}

export async function createInvite(): Promise<InviteCode> {
  logEvent('invite.created');
  return request<InviteCode>('/invites', { method: 'POST' });
}

export async function getInvites(): Promise<InviteCode[]> {
  return request<InviteCode[]>('/invites');
}

// ICS Export — client-side aus gecachten Tasks
export function downloadIcs(): void {
  const tasks = getCachedTasks() ?? [];
  logEvent('export.ics', { tasks: tasks.length });
  const statusMap: Record<string, string> = {
    open: 'NEEDS-ACTION', in_progress: 'IN-PROCESS',
    waiting: 'NEEDS-ACTION', done: 'COMPLETED', skipped: 'CANCELLED',
  };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Task Suggester//DE'];
  for (const t of tasks) {
    lines.push('BEGIN:VTODO');
    lines.push(`UID:${t.id}@task-suggester`);
    lines.push(`SUMMARY:${t.title.replace(/\n/g, '\\n')}`);
    if (t.description) lines.push(`DESCRIPTION:${t.description.replace(/\n/g, '\\n')}`);
    if (t.deadline) lines.push(`DUE;VALUE=DATE:${t.deadline.slice(0, 10).replace(/-/g, '')}`);
    lines.push(`STATUS:${statusMap[t.status] ?? 'NEEDS-ACTION'}`);
    lines.push('END:VTODO');
  }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tasks.ics';
  a.click();
  URL.revokeObjectURL(url);
}
