<script lang="ts">
  import { goto } from '$app/navigation';
  import { user } from '$lib/stores/auth';
  import { login, register } from '$lib/api';
  import { getMe } from '$lib/api';

  let username = '';
  let password = '';
  let error = '';
  let loading = false;
  let mode: 'login' | 'register' = 'login';

  async function submit() {
    error = '';
    loading = true;
    try {
      if (mode === 'login') {
        await login(username, password);
      } else {
        await register(username, password);
      }
      const me = await getMe();
      user.set(me);
      goto('/');
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center p-4">
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
        onkeydown={(e) => e.key === 'Enter' && submit()}
        class="w-full bg-neutral-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {#if error}
        <p class="text-red-400 text-sm">{error}</p>
      {/if}

      <button
        onclick={submit}
        disabled={loading || !username || !password}
        class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl py-3 font-medium transition-colors"
      >
        {loading ? '...' : mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
      </button>
    </div>
  </div>
</div>
