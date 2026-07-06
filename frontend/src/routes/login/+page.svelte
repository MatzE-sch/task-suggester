<script lang="ts">
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { user } from '$lib/stores/auth';
  import { login, register, getMe, getTasks } from '$lib/api';
  import { loadCategories } from '$lib/stores/categories';
  import { replayMutations, clearQueue, pendingMutations } from '$lib/stores/offline';
  import { clearDataCaches } from '$lib/cache';

  let username = '';
  let password = '';
  let inviteCode = $page.url.searchParams.get('invite') ?? '';
  let error = '';
  let loading = false;
  let mode: 'login' | 'register' = inviteCode ? 'register' : 'login';

  async function submit() {
    error = '';
    loading = true;
    try {
      // Account-Wechsel (es war schon ein Token da): kein Gast-Merge, keine Daten-Leaks
      if (localStorage.getItem('token')) {
        clearQueue();
        clearDataCaches();
      }
      if (mode === 'login') {
        await login(username, password);
      } else {
        if (!inviteCode.trim()) { error = 'Einladungscode erforderlich'; return; }
        await register(username, password, inviteCode.trim());
      }
      const me = await getMe();
      user.set(me);
      // Gast-Arbeit in den Account hochladen (Queue hat jetzt einen Token)
      await replayMutations();
      if (get(pendingMutations).length === 0) {
        // Voller Sync gelungen → Server ist die Wahrheit
        await Promise.all([getTasks(), loadCategories()]).catch(() => {});
      }
      // Teil-Replay: lokalen Merge-Cache behalten, Rest läuft beim nächsten 'online'
      goto('/');
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center p-4" onkeydown={(e) => e.ctrlKey && e.key === 'Enter' && submit()}>
  <div class="w-full max-w-sm">
    <h1 class="text-2xl font-bold text-center mb-8 text-indigo-400">✓ Task Suggester</h1>

    <div class="bg-neutral-900 rounded-2xl p-6 space-y-4">
      <div class="flex rounded-xl overflow-hidden border border-neutral-800">
        <button
          class="flex-1 py-2 text-sm font-medium transition-colors {mode === 'login' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'}"
          onclick={() => (mode = 'login')}
        >Login</button>
        <button
          class="flex-1 py-2 text-sm font-medium transition-colors {mode === 'register' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'}"
          onclick={() => (mode = 'register')}
        >Registrieren</button>
      </div>

      <input
        bind:value={username}
        type="text"
        placeholder="Benutzername"
        class="w-full bg-neutral-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <input
        bind:value={password}
        type="password"
        placeholder="Passwort"
        class="w-full bg-neutral-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {#if mode === 'register'}
        <input
          bind:value={inviteCode}
          type="text"
          placeholder="Einladungscode *"
          class="w-full bg-neutral-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
        />
      {/if}

      {#if error}
        <p class="text-red-400 text-sm">{error}</p>
      {/if}

      <button
        onclick={submit}
        onkeydown={(e) => e.key === 'Enter' && submit()}
        disabled={loading || !username || !password || (mode === 'register' && !inviteCode)}
        class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl py-3 font-medium transition-colors"
      >
        {loading ? '...' : mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
      </button>
    </div>
  </div>
</div>
