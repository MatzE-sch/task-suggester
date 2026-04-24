import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { PUBLIC_API_URL } from '$env/static/public';

export interface PendingMutation {
  id: string;
  method: string;
  path: string;
  body: string | null;
  timestamp: number;
}

const QUEUE_KEY = 'ts_pending_mutations';

function loadQueue(): PendingMutation[] {
  if (!browser) return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistQueue(mutations: PendingMutation[]): void {
  if (!browser) return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(mutations));
}

export const isOnline = writable(browser ? navigator.onLine : true);
export const pendingMutations = writable<PendingMutation[]>(loadQueue());

if (browser) {
  window.addEventListener('online', () => isOnline.set(true));
  window.addEventListener('offline', () => isOnline.set(false));
}

export function queueMutation(method: string, path: string, body: string | null): void {
  const mutation: PendingMutation = {
    id: `${Date.now()}-${Math.random()}`,
    method,
    path,
    body,
    timestamp: Date.now(),
  };
  pendingMutations.update((ms) => {
    const updated = [...ms, mutation];
    persistQueue(updated);
    return updated;
  });
}

export async function replayMutations(onComplete?: () => void): Promise<void> {
  const mutations = get(pendingMutations);
  if (mutations.length === 0) { onComplete?.(); return; }

  const token = browser ? localStorage.getItem('token') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const remaining: PendingMutation[] = [];
  for (const mutation of mutations) {
    try {
      const res = await fetch(`${PUBLIC_API_URL}${mutation.path}`, {
        method: mutation.method,
        headers,
        body: mutation.body ?? undefined,
      });
      if (!res.ok && res.status !== 404 && res.status !== 409) {
        remaining.push(mutation);
        break;
      }
    } catch {
      remaining.push(mutation);
      break;
    }
  }

  pendingMutations.set(remaining);
  persistQueue(remaining);
  onComplete?.();
}
