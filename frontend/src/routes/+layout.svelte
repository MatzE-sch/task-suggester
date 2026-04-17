<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { user, isLoggedIn, initAuth } from '$lib/stores/auth';
  import { logout, createInvite } from '$lib/api';

  let showInviteModal = false;
  let inviteLink = '';
  let inviteLoading = false;

  onMount(() => {
    initAuth();
    if ($page.url.pathname !== '/login' && !localStorage.getItem('token')) {
      goto('/login');
    }
  });

  $: if (browser && $page.url.pathname !== '/login' && !localStorage.getItem('token')) {
    goto('/login');
  }

  function handleLogout() {
    logout();
    user.set(null);
    goto('/login');
  }

  async function generateInvite() {
    inviteLoading = true;
    try {
      const inv = await createInvite();
      inviteLink = `${window.location.origin}/login?invite=${inv.code}`;
      showInviteModal = true;
    } finally {
      inviteLoading = false;
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(inviteLink);
  }
</script>

{#if $page.url.pathname === '/login'}
  <slot />
{:else}
  <div class="min-h-screen flex flex-col">
    <nav class="border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
      <div class="flex gap-4 items-center">
        <a href="/" class="font-semibold text-indigo-400 text-lg">✓ Tasks</a>
        <a href="/tasks" class="text-sm text-neutral-400 hover:text-white transition-colors">Liste</a>
        <a href="/stats" class="text-sm text-neutral-400 hover:text-white transition-colors">Stats</a>
      </div>
      {#if $isLoggedIn}
        <div class="flex items-center gap-3">
          <button
            onclick={generateInvite}
            disabled={inviteLoading}
            class="text-xs text-neutral-500 hover:text-indigo-400 transition-colors"
            title="Einladungslink generieren"
          >+ Einladen</button>
          <span class="text-neutral-700">|</span>
          <span class="text-sm text-neutral-500">{$user?.username}</span>
          <button onclick={handleLogout} class="text-xs text-neutral-500 hover:text-white transition-colors">Logout</button>
        </div>
      {/if}
    </nav>
    <main class="flex-1 p-4 max-w-2xl mx-auto w-full">
      <slot />
    </main>
  </div>

  {#if showInviteModal}
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onclick={() => (showInviteModal = false)}>
      <div class="bg-neutral-900 rounded-2xl p-6 w-full max-w-sm space-y-4" onclick={(e) => e.stopPropagation()}>
        <h2 class="font-semibold">Einladungslink</h2>
        <p class="text-xs text-neutral-500">Dieser Link kann nur einmal verwendet werden.</p>
        <div class="bg-neutral-800 rounded-xl px-3 py-2 text-xs font-mono break-all text-neutral-300">
          {inviteLink}
        </div>
        <div class="flex gap-3">
          <button
            onclick={copyLink}
            class="flex-1 bg-indigo-600 hover:bg-indigo-500 rounded-xl py-2.5 text-sm font-medium transition-colors"
          >Link kopieren</button>
          <button
            onclick={() => (showInviteModal = false)}
            class="px-4 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-sm transition-colors"
          >Schließen</button>
        </div>
      </div>
    </div>
  {/if}
{/if}
