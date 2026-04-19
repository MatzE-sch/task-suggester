<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { user, isLoggedIn, initAuth } from '$lib/stores/auth';
  import { logout, createInvite } from '$lib/api';
  import { showShortcutHints, newTaskSignal } from '$lib/stores/shortcuts';

  let showInviteModal = false;
  let inviteLink = '';
  let inviteLoading = false;
  let showMobileMenu = false;
  let ctrlHoldTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    initAuth();
    if ($page.url.pathname !== '/login' && !localStorage.getItem('token')) {
      goto('/login');
    }

    function handleKeydown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

      if (e.key === 'Control' && !ctrlHoldTimer) {
        ctrlHoldTimer = setTimeout(() => showShortcutHints.set(true), 1000);
      }

      if (inInput) return;

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 't') { e.preventDefault(); goto('/'); }
        else if (e.key === 'l') { e.preventDefault(); goto('/tasks'); }
        else if (e.key === 's') { e.preventDefault(); goto('/stats'); }
        else if (e.key === 'n') { e.preventDefault(); newTaskSignal.update(n => n + 1); if ($page.url.pathname !== '/') goto('/'); }
      }
    }

    function handleKeyup(e: KeyboardEvent) {
      if (e.key === 'Control') {
        if (ctrlHoldTimer) { clearTimeout(ctrlHoldTimer); ctrlHoldTimer = null; }
        showShortcutHints.set(false);
      }
    }

    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('keyup', handleKeyup);
    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('keyup', handleKeyup);
    };
  });

  $: if (browser && $page.url.pathname !== '/login' && !localStorage.getItem('token')) {
    goto('/login');
  }

  function handleLogout() {
    logout();
    user.set(null);
    showMobileMenu = false;
    goto('/login');
  }

  async function generateInvite() {
    inviteLoading = true;
    showMobileMenu = false;
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
    <nav class="sticky top-0 z-10 bg-neutral-950 border-b border-neutral-800 px-4 py-3 flex items-center justify-between relative">
      <!-- Left: logo + desktop nav links -->
      <div class="flex gap-4 items-center">
        <a href="/" class="font-semibold text-indigo-400 text-lg">
          ✓ Tasks
          {#if $showShortcutHints}<kbd class="ml-1 text-xs bg-neutral-800 px-1 rounded">t</kbd>{/if}
        </a>
        <a href="/tasks" class="hidden md:inline text-sm text-neutral-400 hover:text-white transition-colors">
          Liste{#if $showShortcutHints}<kbd class="ml-1 text-xs bg-neutral-800 px-1 rounded">l</kbd>{/if}
        </a>
        <a href="/stats" class="hidden md:inline text-sm text-neutral-400 hover:text-white transition-colors">
          Stats{#if $showShortcutHints}<kbd class="ml-1 text-xs bg-neutral-800 px-1 rounded">s</kbd>{/if}
        </a>
      </div>

      <!-- Right: desktop controls -->
      {#if $isLoggedIn}
        <div class="hidden md:flex items-center gap-3">
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

        <!-- Mobile: user icon button -->
        <button
          onclick={() => (showMobileMenu = !showMobileMenu)}
          class="md:hidden w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white"
          aria-label="Menü"
        >{$user?.username?.[0]?.toUpperCase() ?? '?'}</button>
      {/if}

      <!-- Mobile dropdown menu -->
      {#if showMobileMenu}
        <div
          class="md:hidden absolute right-4 top-14 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl z-50 w-48 py-2 flex flex-col"
          role="menu"
        >
          <span class="px-4 py-2 text-xs text-neutral-500">{$user?.username}</span>
          <hr class="border-neutral-800 my-1" />
          <a href="/tasks" onclick={() => (showMobileMenu = false)} class="px-4 py-2.5 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors flex items-center justify-between">
            Liste {#if $showShortcutHints}<kbd class="text-xs bg-neutral-700 px-1 rounded">l</kbd>{/if}
          </a>
          <a href="/stats" onclick={() => (showMobileMenu = false)} class="px-4 py-2.5 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors flex items-center justify-between">
            Stats {#if $showShortcutHints}<kbd class="text-xs bg-neutral-700 px-1 rounded">s</kbd>{/if}
          </a>
          <hr class="border-neutral-800 my-1" />
          <button onclick={generateInvite} disabled={inviteLoading} class="px-4 py-2.5 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors text-left">
            + Einladen
          </button>
          <button onclick={handleLogout} class="px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-neutral-800 transition-colors text-left">
            Logout
          </button>
        </div>
        <!-- click outside to close -->
        <div class="fixed inset-0 z-40" onclick={() => (showMobileMenu = false)} aria-hidden="true"></div>
      {/if}
    </nav>

    <main class="flex-1 p-4 max-w-2xl mx-auto w-full pb-48 md:pb-4">
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
