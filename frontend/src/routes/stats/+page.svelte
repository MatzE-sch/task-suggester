<script lang="ts">
  import { onMount } from 'svelte';
  import { getActivityStats, getCategories } from '$lib/api';
  import type { ActivityStats, Category } from '$lib/types';
  import ActivityCalendar from '$lib/components/ActivityCalendar.svelte';
  import {
    createCategory,
    updateCategory,
    deleteCategory,
  } from '$lib/api';

  let stats: ActivityStats = {};
  let categories: Category[] = [];
  let showCatForm = false;
  let newCatName = '';
  let newCatColor = '#6366f1';
  let newCatIcon = '';

  onMount(async () => {
    [stats, categories] = await Promise.all([getActivityStats(), getCategories()]);
  });

  async function addCategory() {
    if (!newCatName.trim()) return;
    const cat = await createCategory({ name: newCatName.trim(), color: newCatColor, icon: newCatIcon || undefined });
    categories = [...categories, cat];
    newCatName = '';
    newCatIcon = '';
    showCatForm = false;
  }

  async function removeCategory(id: number) {
    if (!confirm('Kategorie wirklich löschen?')) return;
    await deleteCategory(id);
    categories = categories.filter((c) => c.id !== id);
  }

  const totalDone = Object.values(stats).reduce((s, d) => s + d.count, 0);
  const activeDays = Object.values(stats).filter((d) => d.count > 0).length;
</script>

<div class="py-6 space-y-8">
  <div>
    <h1 class="text-xl font-bold mb-4">Aktivität</h1>
    <ActivityCalendar {stats} {categories} />
    <div class="flex gap-6 mt-4 text-sm text-neutral-400">
      <span><span class="text-white font-medium">{totalDone}</span> Tasks erledigt</span>
      <span><span class="text-white font-medium">{activeDays}</span> aktive Tage</span>
    </div>
  </div>

  <!-- Categories management -->
  <div>
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-lg font-semibold">Kategorien</h2>
      <button
        onclick={() => (showCatForm = !showCatForm)}
        class="text-sm px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
      >+ Neu</button>
    </div>

    {#if showCatForm}
      <div class="bg-neutral-900 rounded-xl p-4 space-y-3 mb-4">
        <div class="flex gap-3">
          <input bind:value={newCatIcon} placeholder="Icon (emoji)" class="w-16 bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center" />
          <input bind:value={newCatName} placeholder="Name *" class="flex-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <input bind:value={newCatColor} type="color" class="w-10 h-10 rounded-lg cursor-pointer bg-neutral-800 border-0 p-0.5" />
        </div>
        <div class="flex gap-2">
          <button onclick={addCategory} disabled={!newCatName.trim()} class="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg py-2 text-sm font-medium transition-colors">Anlegen</button>
          <button onclick={() => (showCatForm = false)} class="px-3 bg-neutral-800 rounded-lg text-sm">Abbrechen</button>
        </div>
      </div>
    {/if}

    <div class="space-y-2">
      {#each categories as cat}
        <div class="flex items-center justify-between bg-neutral-900 rounded-xl px-4 py-3">
          <div class="flex items-center gap-3">
            <div class="w-3 h-3 rounded-full" style="background-color: {cat.color}"></div>
            <span class="text-sm">{#if cat.icon}{cat.icon} {/if}{cat.name}</span>
          </div>
          <button onclick={() => removeCategory(cat.id)} class="text-xs text-neutral-600 hover:text-red-400 transition-colors">🗑</button>
        </div>
      {/each}
      {#if categories.length === 0}
        <p class="text-neutral-600 text-sm text-center py-4">Noch keine Kategorien angelegt.</p>
      {/if}
    </div>
  </div>
</div>
