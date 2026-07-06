import { browser } from '$app/environment';
import { writable, derived } from 'svelte/store';
import type { User } from '../types';

export const user = writable<User | null>(null);
export const isLoggedIn = derived(user, ($u) => $u !== null);

export function initAuth() {
  if (!browser) return;
  const token = localStorage.getItem('token');
  if (!token) return;
  import('../api').then(({ getMe, ApiError }) =>
    getMe()
      .then((u) => user.set(u))
      .catch((e) => {
        // Nur bei 401 (Token ungültig/abgelaufen) ausloggen — Netzwerkfehler
        // oder Serverfehler (z.B. 502 während Deploy) behalten den Token
        if (e instanceof ApiError && e.status === 401) {
          localStorage.removeItem('token');
          user.set(null);
        }
      })
  );
}
