<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { user, isLoggedIn, initAuth } from '$lib/stores/auth';
  import { logout } from '$lib/api';

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
          <span class="text-sm text-neutral-500">{$user?.username}</span>
          <button onclick={handleLogout} class="text-xs text-neutral-500 hover:text-white transition-colors">Logout</button>
        </div>
      {/if}
    </nav>
    <main class="flex-1 p-4 max-w-2xl mx-auto w-full">
      <slot />
    </main>
  </div>
{/if}
