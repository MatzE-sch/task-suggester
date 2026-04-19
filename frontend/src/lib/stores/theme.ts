import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'dark' | 'light' | 'auto';

const stored = browser ? (localStorage.getItem('theme') as Theme | null) : null;
export const theme = writable<Theme>(stored ?? 'auto');

if (browser) {
  theme.subscribe((value) => localStorage.setItem('theme', value));
}

export function resolveTheme(t: Theme, mq: MediaQueryList): 'dark' | 'light' {
  if (t === 'dark') return 'dark';
  if (t === 'light') return 'light';
  return mq.matches ? 'dark' : 'light';
}
