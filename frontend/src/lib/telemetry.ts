import { browser } from '$app/environment';
import { Capacitor } from '@capacitor/core';

// Pusht Nutzungs-Events direkt an Loki (Grafana). Fire-and-forget:
// Telemetrie darf die App nie blockieren oder Fehler werfen.
// Offline entstandene Events werden in localStorage gepuffert und
// beim nächsten Online-Flush mit Original-Timestamp nachgeliefert.

const LOKI_URL = 'https://logs-ingest.schu.gg/loki/api/v1/push';
const LOKI_AUTH = 'Basic bG9nZ2VyOmJoUWhMRHVRdDV1ZzhPeGplMno=';
const PROJECT = 'task-suggestor';

const QUEUE_KEY = 'ts_telemetry_queue';
const CLIENT_KEY = 'ts_client_id';
const SESSION_KEY = 'ts_session_id';
const MAX_QUEUE = 500;
const FLUSH_INTERVAL_MS = 5000;

type Level = 'info' | 'warn' | 'error';

interface QueuedEvent {
  ts: string; // Unix-Nanosekunden als String (Loki-Format)
  level: Level;
  line: string;
}

let queue: QueuedEvent[] = [];
let username: string | null = null;
let initialized = false;
let sending = false;
let firstVisit = false;

function platform(): string {
  try {
    return Capacitor.isNativePlatform() ? 'android' : 'web';
  } catch {
    return 'web';
  }
}

function env(): string {
  return import.meta.env.DEV ? 'dev' : 'prod';
}

function loadQueue(): QueuedEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistQueue(): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function clientId(): string {
  let id = localStorage.getItem(CLIENT_KEY);
  if (!id) {
    id = randomId();
    localStorage.setItem(CLIENT_KEY, id);
    firstVisit = true;
  }
  return id;
}

function sessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = randomId();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function setTelemetryUser(name: string | null): void {
  username = name;
}

export function logEvent(event: string, fields: Record<string, unknown> = {}, level: Level = 'info'): void {
  if (!browser) return;
  try {
    const line = JSON.stringify({
      event,
      client_id: clientId(),
      session_id: sessionId(),
      user: username,
      online: navigator.onLine,
      ...fields,
    });
    queue.push({ ts: `${Date.now()}000000`, level, line });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    persistQueue();
  } catch {}
}

export async function flushTelemetry(useKeepalive = false): Promise<void> {
  if (!browser || sending || queue.length === 0 || !navigator.onLine) return;
  const batch = queue.slice();
  sending = true;
  try {
    const byLevel = new Map<Level, [string, string][]>();
    for (const e of batch) {
      const arr = byLevel.get(e.level) ?? [];
      arr.push([e.ts, e.line]);
      byLevel.set(e.level, arr);
    }
    const streams = [...byLevel.entries()].map(([level, values]) => ({
      stream: { project: PROJECT, source: 'frontend', platform: platform(), env: env(), level },
      values,
    }));
    const res = await fetch(LOKI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: LOKI_AUTH },
      body: JSON.stringify({ streams }),
      keepalive: useKeepalive,
    });
    // 204 = ok; 400 = von Loki abgelehnt (z.B. zu alt) → verwerfen statt ewig retryen
    if (res.ok || res.status === 400) {
      queue = queue.slice(batch.length);
      persistQueue();
    }
  } catch {
    // Netzwerkfehler: Queue bleibt, nächster Flush versucht es erneut
  } finally {
    sending = false;
  }
}

export function initTelemetry(): void {
  if (!browser || initialized) return;
  initialized = true;

  queue = loadQueue();

  // Einmal pro Browser-Session: Besuch loggen (first_visit = neuer Nutzer/Gerät)
  const isNewSession = !sessionStorage.getItem(SESSION_KEY);
  clientId(); // setzt firstVisit, falls Client-ID neu angelegt wird
  if (isNewSession) {
    logEvent('session.start', {
      first_visit: firstVisit,
      referrer: document.referrer || null,
      lang: navigator.language,
      screen: `${window.screen.width}x${window.screen.height}`,
    });
  }

  window.addEventListener('online', () => {
    logEvent('network.online');
    flushTelemetry();
  });
  window.addEventListener('offline', () => logEvent('network.offline'));

  window.addEventListener('error', (e) => {
    logEvent('error.js', {
      message: String(e.message).slice(0, 500),
      file: e.filename,
      line: e.lineno,
    }, 'error');
  });
  window.addEventListener('unhandledrejection', (e) => {
    logEvent('error.unhandled_rejection', { message: String(e.reason).slice(0, 500) }, 'error');
  });

  // Beim Verlassen/Minimieren letzten Stand rausschicken (keepalive überlebt den Tab-Wechsel)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushTelemetry(true);
  });

  setInterval(() => flushTelemetry(), FLUSH_INTERVAL_MS);
  flushTelemetry();
}
