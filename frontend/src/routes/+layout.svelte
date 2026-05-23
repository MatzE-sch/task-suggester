<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { user, isLoggedIn, initAuth } from '$lib/stores/auth';
  import { logout, createInvite } from '$lib/api';
  import { showShortcutHints } from '$lib/stores/shortcuts';
  import { theme, resolveTheme } from '$lib/stores/theme';
  import type { Theme } from '$lib/stores/theme';
  import { isOnline, pendingMutations, replayMutations } from '$lib/stores/offline';
  import { loadCategories } from '$lib/stores/categories';
  import { clearDataCaches } from '$lib/cache';
  import { PUBLIC_BUILD_TIME } from '$env/static/public';

  let showInviteModal = false;
  let inviteLink = '';
  let inviteLoading = false;
  let showMobileMenu = false;
  let ctrlHoldTimer: ReturnType<typeof setTimeout> | null = null;

  const NAV = [
    { href: '/', label: 'Heute', key: 't' },
    { href: '/tasks', label: 'Liste', key: 'l' },
    { href: '/stats', label: 'Stats', key: 's' },
  ];

  onMount(() => {
    initAuth();
    if ($page.url.pathname !== '/login' && !localStorage.getItem('token')) {
      goto('/login');
    }

    async function handleOnline() {
      await replayMutations();
      loadCategories().catch(() => {});
    }
    window.addEventListener('online', handleOnline);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function applyTheme() {
      const resolved = resolveTheme($theme, mq);
      document.documentElement.classList.toggle('light', resolved === 'light');
    }
    applyTheme();
    const unsubTheme = theme.subscribe(() => applyTheme());
    mq.addEventListener('change', applyTheme);

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
        else if (e.key === 'n') { e.preventDefault(); goto('/tasks/new'); }
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
      unsubTheme();
      mq.removeEventListener('change', applyTheme);
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('keyup', handleKeyup);
      window.removeEventListener('online', handleOnline);
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

{#if !$isOnline}
  <div class="fixed bottom-16 md:bottom-4 left-1/2 -translate-x-1/2 z-50 bg-amber-700 text-amber-50 text-xs rounded-full py-1.5 px-4 shadow-lg whitespace-nowrap pointer-events-none">
    Offline{#if $pendingMutations.length > 0} · {$pendingMutations.length} ausstehend{/if}
  </div>
{/if}

{#if $page.url.pathname === '/login'}
  <slot />
{:else}

<div class="h-dvh flex flex-col md:block overflow-hidden">
  <!-- Desktop sidebar -->
  <aside class="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-52 bg-neutral-950 border-r border-neutral-800 p-5 z-20">
    <div class="mb-8">
      <span class="font-bold text-indigo-400 text-lg">✓ Tasks</span>
    </div>

    <nav class="flex flex-col gap-1 flex-1">
      {#each NAV as item}
        <a
          href={item.href}
          class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors
            {$page.url.pathname === item.href ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-900'}"
        >
          {#if item.href === '/'}
            <svg viewBox="0 0 24 24" class="w-4 h-4 shrink-0" fill="currentColor"><path d="M12 2l2.09 6.26L20 9.27l-4.91 4.73 1.18 6.73L12 17.27l-4.27 3.46 1.18-6.73L4 9.27l5.91-1.01z"/></svg>
          {:else if item.href === '/tasks'}
            <svg viewBox="0 0 24 24" class="w-4 h-4 shrink-0" fill="currentColor"><path d="M3 5h2v2H3zm4 0h14v2H7zm-4 5h2v2H3zm4 0h14v2H7zm-4 5h2v2H3zm4 0h14v2H7z"/></svg>
          {:else}
            <svg viewBox="0 0 24 24" class="w-4 h-4 shrink-0" fill="currentColor"><path d="M5 20h2v-8H5zm4 0h2v-4H9zm4 0h2V10h-2zm4 0h2V4h-2z"/></svg>
          {/if}
          {item.label}
          {#if $showShortcutHints}<kbd class="ml-auto text-xs bg-neutral-700 px-1 rounded">{item.key}</kbd>{/if}
        </a>
      {/each}
    </nav>

    <div class="border-t border-neutral-800 pt-4 space-y-1 text-sm">
      <p class="text-xs text-neutral-500 px-1">{$user?.username}</p>
      {#if PUBLIC_BUILD_TIME}
        <p class="text-xs text-neutral-700 px-1 pb-1" title="Build-Zeit">Build: {new Date(PUBLIC_BUILD_TIME).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
      {/if}
      <div class="flex rounded-xl overflow-hidden mb-1">
        {#each [['dark', '🌙'], ['light', '☀'], ['auto', 'auto']] as [t, icon]}
          <button
            onclick={() => theme.set(t as Theme)}
            class="flex-1 py-1.5 text-xs transition-colors {$theme === t ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-white hover:bg-neutral-900'}"
            title={t === 'dark' ? 'Dunkel' : t === 'light' ? 'Hell' : 'System'}
          >{icon}</button>
        {/each}
      </div>
      <button
        onclick={generateInvite}
        disabled={inviteLoading}
        class="w-full text-left px-3 py-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors text-sm"
      >+ Einladen</button>
      <button
        onclick={handleLogout}
        class="w-full text-left px-3 py-2 rounded-xl text-neutral-500 hover:text-red-400 hover:bg-neutral-900 transition-colors text-sm"
      >Logout</button>
    </div>
  </aside>

  <!-- Mobile top bar -->
  <header class="md:hidden shrink-0 z-10 bg-neutral-950 border-b border-neutral-800 px-4 py-3 flex items-center justify-between relative">
    <span class="font-semibold text-indigo-400">✓ Tasks</span>
    {#if $isLoggedIn}
      <button
        onclick={() => (showMobileMenu = !showMobileMenu)}
        class="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white"
        aria-label="Menü"
      >{$user?.username?.[0]?.toUpperCase() ?? '?'}</button>
    {/if}

    {#if showMobileMenu}
      <div
        class="absolute right-4 top-14 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl z-50 w-48 py-2 flex flex-col"
        role="menu"
      >
        <span class="px-4 pt-2 text-xs text-neutral-500">{$user?.username}</span>
        {#if PUBLIC_BUILD_TIME}
          <span class="px-4 pb-2 text-xs text-neutral-700">Build: {new Date(PUBLIC_BUILD_TIME).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
        {/if}
        <div class="flex mx-3 mb-1 rounded-xl overflow-hidden border border-neutral-800">
          {#each [['dark', '🌙'], ['light', '☀'], ['auto', 'auto']] as [t, icon]}
            <button
              onclick={() => { theme.set(t as Theme); showMobileMenu = false; }}
              class="flex-1 py-1.5 text-xs transition-colors {$theme === t ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-white hover:bg-neutral-800'}"
            >{icon}</button>
          {/each}
        </div>
        <hr class="border-neutral-800 my-1" />
        <button onclick={generateInvite} disabled={inviteLoading} class="px-4 py-2.5 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors text-left">
          + Einladen
        </button>
        <button onclick={() => { clearDataCaches(); showMobileMenu = false; location.reload(); }} class="px-4 py-2.5 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors text-left">
          ↺ Aktualisieren
        </button>
        <button onclick={handleLogout} class="px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-neutral-800 transition-colors text-left">
          Logout
        </button>
      </div>
      <div class="fixed inset-0 z-40" onclick={() => (showMobileMenu = false)} aria-hidden="true"></div>
    {/if}
  </header>

  <!-- Content -->
  <main class="md:ml-52 p-4 max-w-2xl mx-auto md:mx-0 w-full flex-1 min-h-0 overflow-y-auto md:flex-none md:h-screen pb-6 md:pb-8">
    <slot />
  </main>

  <!-- Mobile bottom nav -->
  <nav class="md:hidden shrink-0 z-10 bg-neutral-950 border-t border-neutral-800 flex">
    {#each NAV as item}
      <a
        href={item.href}
        class="flex-1 flex flex-col items-center py-3 gap-1 transition-colors
          {$page.url.pathname === item.href ? 'text-indigo-400' : 'text-neutral-400'}"
      >
        {#if item.href === '/'}
          <svg viewBox="0 0 24 24" class="w-5 h-5" fill="currentColor"><path d="M12 2l2.09 6.26L20 9.27l-4.91 4.73 1.18 6.73L12 17.27l-4.27 3.46 1.18-6.73L4 9.27l5.91-1.01z"/></svg>
        {:else if item.href === '/tasks'}
          <svg viewBox="0 0 24 24" class="w-5 h-5" fill="currentColor"><path d="M3 5h2v2H3zm4 0h14v2H7zm-4 5h2v2H3zm4 0h14v2H7zm-4 5h2v2H3zm4 0h14v2H7z"/></svg>
        {:else}
          <svg viewBox="0 0 24 24" class="w-5 h-5" fill="currentColor"><path d="M5 20h2v-8H5zm4 0h2v-4H9zm4 0h2V10h-2zm4 0h2V4h-2z"/></svg>
        {/if}
        <span class="text-xs">{item.label}</span>
      </a>
    {/each}
    <button
      onclick={() => goto('/tasks/new')}
      class="flex-1 flex flex-col items-center py-3 gap-1 transition-colors text-neutral-400 hover:text-indigo-400"
    >
      <svg viewBox="0 0 24 24" class="w-5 h-5" fill="currentColor"><path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z"/></svg>
      <span class="text-xs">Neu</span>
    </button>
  </nav>

</div>
{/if}

{#if showInviteModal}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onclick={() => (showInviteModal = false)}>
    <div class="bg-neutral-900 rounded-2xl p-6 w-full max-w-sm space-y-4" onclick={(e) => e.stopPropagation()}>
      <h2 class="font-semibold">Einladungslink</h2>
      <p class="text-xs text-neutral-500">Dieser Link kann nur einmal verwendet werden.</p>
      <div class="bg-neutral-800 rounded-xl px-3 py-2 text-xs font-mono break-all text-neutral-300">
        {inviteLink}
      </div>
      <div class="flex gap-3">
        <button onclick={copyLink} class="flex-1 bg-indigo-600 hover:bg-indigo-500 rounded-xl py-2.5 text-sm font-medium transition-colors">Link kopieren</button>
        <button onclick={() => (showInviteModal = false)} class="px-4 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-sm transition-colors">Schließen</button>
      </div>
    </div>
  </div>
{/if}
