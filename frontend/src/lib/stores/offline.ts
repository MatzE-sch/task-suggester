import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { PUBLIC_API_URL } from '$env/static/public';
import { getCachedTasks, cacheTasks } from '../cache';
import { logEvent } from '../telemetry';

export interface PendingMutation {
  id: string;
  method: string;
  path: string;
  body: string | null;
  timestamp: number;
  // Bei POST /tasks: lokale (negative) Temp-ID des angelegten Tasks,
  // wird beim Replay auf die echte Server-ID gemappt
  tempId?: number;
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

export function queueMutation(method: string, path: string, body: string | null, tempId?: number): void {
  const mutation: PendingMutation = {
    id: `${Date.now()}-${Math.random()}`,
    method,
    path,
    body,
    timestamp: Date.now(),
    ...(tempId !== undefined ? { tempId } : {}),
  };
  pendingMutations.update((ms) => {
    const updated = [...ms, mutation];
    persistQueue(updated);
    return updated;
  });
}

/** Entfernt einen nie gesyncten Gast-/Offline-Task komplett aus der Queue:
 *  sein POST, alle Mutationen auf ihn und Referenzen in dependency_ids. */
export function cancelTempTask(tempId: number): void {
  pendingMutations.update((ms) => {
    const pathRe = new RegExp(`^/tasks/${tempId}(/|$)`);
    const updated = ms
      .filter((m) => m.tempId !== tempId && !pathRe.test(m.path))
      .map((m) => {
        if (!m.body) return m;
        try {
          const p = JSON.parse(m.body);
          if (Array.isArray(p.dependency_ids) && p.dependency_ids.includes(tempId)) {
            return { ...m, body: JSON.stringify({ ...p, dependency_ids: p.dependency_ids.filter((d: number) => d !== tempId) }) };
          }
        } catch {}
        return m;
      });
    persistQueue(updated);
    return updated;
  });
}

export function clearQueue(): void {
  pendingMutations.set([]);
  persistQueue([]);
}

/** Ersetzt Temp-IDs (negative) in Pfad und dependency_ids durch echte Server-IDs. */
function remapIds(m: PendingMutation, idMap: Map<number, number>): PendingMutation {
  let { path, body } = m;
  const match = path.match(/^\/tasks\/(-\d+)(\/.*)?$/);
  if (match) {
    const real = idMap.get(Number(match[1]));
    if (real !== undefined) path = `/tasks/${real}${match[2] ?? ''}`;
  }
  if (body) {
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed.dependency_ids)) {
        parsed.dependency_ids = parsed.dependency_ids.map((id: number) => idMap.get(id) ?? id);
        body = JSON.stringify(parsed);
      }
    } catch {}
  }
  return { ...m, path, body };
}

export async function replayMutations(onComplete?: () => void): Promise<void> {
  const mutations = get(pendingMutations);
  if (mutations.length === 0) { onComplete?.(); return; }

  const token = browser ? localStorage.getItem('token') : null;
  // Gast-Queue wartet auf Login — erst dann wird in den Account gesynct
  if (!token) { onComplete?.(); return; }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const idMap = new Map<number, number>();
  let failedIndex = -1;
  for (let i = 0; i < mutations.length; i++) {
    // Queue ist chronologisch: der Create eines Temp-Tasks kommt vor seinen Edits
    const m = remapIds(mutations[i], idMap);
    try {
      const res = await fetch(`${PUBLIC_API_URL}${m.path}`, {
        method: m.method,
        headers,
        body: m.body ?? undefined,
      });
      if (res.ok) {
        if (m.method === 'POST' && m.path === '/tasks' && m.tempId !== undefined) {
          const created = await res.json().catch(() => null);
          if (created && typeof created.id === 'number') idMap.set(m.tempId, created.id);
        }
      } else if (res.status !== 404 && res.status !== 409) {
        failedIndex = i;
        break;
      }
    } catch {
      failedIndex = i;
      break;
    }
  }

  // Rest bereits remapped persistieren: erfolgreiche POSTs laufen nie doppelt,
  // deren Follow-ups tragen schon echte IDs; ein gescheiterter POST behält
  // seine tempId für den nächsten Versuch
  const remaining = failedIndex < 0 ? [] : mutations.slice(failedIndex).map((m) => remapIds(m, idMap));
  pendingMutations.set(remaining);
  persistQueue(remaining);
  logEvent('sync.replayed', { replayed: mutations.length - remaining.length, remaining: remaining.length });

  // Lokalen Cache konsistent halten: Temp-IDs durch echte ersetzen
  if (idMap.size > 0) {
    const cached = getCachedTasks();
    if (cached) {
      cacheTasks(cached.map((t) => ({
        ...t,
        id: idMap.get(t.id) ?? t.id,
        dependency_ids: t.dependency_ids.map((d) => idMap.get(d) ?? d),
      })));
    }
  }
  onComplete?.();
}
