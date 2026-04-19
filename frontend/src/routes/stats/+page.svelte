<script lang="ts">
  import { onMount } from 'svelte';
  import { getActivityStats, getCategories, createCategory, updateCategory, deleteCategory } from '$lib/api';
  import type { ActivityStats, Category } from '$lib/types';
  import ActivityCalendar from '$lib/components/ActivityCalendar.svelte';

  let stats: ActivityStats = {};
  let categories: Category[] = [];
  let editMode = false;
  let showNewForm = false;
  let newCatName = '';
  let newCatColor = '#6366f1';
  let newCatIcon = '';
  let editingId: number | null = null;
  let editName = '';
  let editColor = '#6366f1';
  let editIcon = '';
  let dragId: number | null = null;
  let dragOverId: number | null = null;
  let touchClone: HTMLElement | null = null;

  function onTouchStart(e: TouchEvent, id: number) {
    dragId = id;
    const row = (e.currentTarget as HTMLElement).closest('[data-cat-id]') as HTMLElement;
    if (!row) return;
    touchClone = row.cloneNode(true) as HTMLElement;
    const rect = row.getBoundingClientRect();
    Object.assign(touchClone.style, {
      position: 'fixed', opacity: '0.85', zIndex: '9999',
      width: rect.width + 'px', pointerEvents: 'none',
      left: rect.left + 'px', top: rect.top + 'px',
      transition: 'none',
    });
    document.body.appendChild(touchClone);
  }

  function onTouchMove(e: TouchEvent) {
    if (!touchClone || dragId === null) return;
    e.preventDefault();
    const t = e.touches[0];
    touchClone.style.top = t.clientY - touchClone.offsetHeight / 2 + 'px';
    const el = document.elementFromPoint(t.clientX, t.clientY)?.closest('[data-cat-id]');
    dragOverId = el ? Number(el.getAttribute('data-cat-id')) : null;
  }

  function onTouchEnd() {
    if (dragId !== null && dragOverId !== null) onDrop(dragOverId);
    touchClone?.remove(); touchClone = null;
    dragId = null; dragOverId = null;
  }

  onMount(async () => {
    [stats, categories] = await Promise.all([getActivityStats(), getCategories()]);
  });

  async function addCategory() {
    if (!newCatName.trim()) return;
    const cat = await createCategory({ name: newCatName.trim(), color: newCatColor, icon: newCatIcon || undefined });
    categories = [...categories, cat];
    newCatName = ''; newCatIcon = ''; showNewForm = false;
  }

  async function removeCategory(id: number) {
    if (!confirm('Kategorie wirklich löschen?')) return;
    await deleteCategory(id);
    categories = categories.filter(c => c.id !== id);
  }

  function startEdit(cat: Category) {
    editingId = cat.id;
    editName = cat.name;
    editColor = cat.color;
    editIcon = cat.icon ?? '';
  }

  async function saveEdit(id: number) {
    const updated = await updateCategory(id, { name: editName.trim(), color: editColor, icon: editIcon || undefined });
    categories = categories.map(c => c.id === id ? updated : c);
    editingId = null;
  }

  function onDragStart(id: number) { dragId = id; }
  function onDragOver(e: DragEvent, id: number) { e.preventDefault(); dragOverId = id; }
  function onDrop(targetId: number) {
    if (dragId === null || dragId === targetId) { dragId = null; dragOverId = null; return; }
    const from = categories.findIndex(c => c.id === dragId);
    const to = categories.findIndex(c => c.id === targetId);
    const reordered = [...categories];
    reordered.splice(to, 0, reordered.splice(from, 1)[0]);
    categories = reordered;
    reordered.forEach((cat, i) => {
      if (cat.sort_order !== i) {
        cat.sort_order = i;
        updateCategory(cat.id, { sort_order: i });
      }
    });
    dragId = null; dragOverId = null;
  }

  $: totalDone = Object.values(stats).reduce((s, d) => s + d.count, 0);
  $: activeDays = Object.values(stats).filter(d => d.count > 0).length;
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

  <div>
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-lg font-semibold">Kategorien</h2>
      <div class="flex gap-2">
        <button
          onclick={() => { editMode = !editMode; editingId = null; }}
          class="text-sm px-3 py-1.5 rounded-lg transition-colors {editMode ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'}"
          title="Bearbeiten"
        >✏</button>
        <button
          onclick={() => (showNewForm = !showNewForm)}
          class="text-sm px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
        >+ Neu</button>
      </div>
    </div>

    {#if showNewForm}
      <div class="bg-neutral-900 rounded-xl p-4 space-y-3 mb-4">
        <div class="flex gap-3">
          <input bind:value={newCatIcon} placeholder="Icon" class="w-14 bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center" />
          <input bind:value={newCatName} placeholder="Name *" class="flex-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <input bind:value={newCatColor} type="color" class="w-10 h-10 rounded-lg cursor-pointer bg-neutral-800 border-0 p-0.5" />
        </div>
        <div class="flex gap-2">
          <button onclick={addCategory} disabled={!newCatName.trim()} class="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg py-2 text-sm font-medium transition-colors">Anlegen</button>
          <button onclick={() => (showNewForm = false)} class="px-3 bg-neutral-800 rounded-lg text-sm">Abbrechen</button>
        </div>
      </div>
    {/if}

    {#if !editMode}
      <!-- Kompakte Chip-Ansicht -->
      <div class="flex flex-wrap gap-2">
        {#each categories as cat}
          <span
            class="text-xs px-2.5 py-1 rounded-full"
            style="background-color: {cat.color}22; color: {cat.color}; border: 1px solid {cat.color}44"
          >{#if cat.icon}{cat.icon} {/if}{cat.name}</span>
        {/each}
      </div>
    {:else}
      <!-- Edit-Modus mit Drag & Drop -->
      <div class="space-y-1">
        {#each categories as cat (cat.id)}
          <div
            data-cat-id={cat.id}
            draggable="true"
            ondragstart={() => onDragStart(cat.id)}
            ondragover={(e) => onDragOver(e, cat.id)}
            ondrop={() => onDrop(cat.id)}
            ondragend={() => { dragId = null; dragOverId = null; }}
            class="bg-neutral-900 rounded-xl px-3 py-2.5 transition-opacity {dragOverId === cat.id && dragId !== cat.id ? 'opacity-40' : ''}"
          >
            {#if editingId === cat.id}
              <div class="flex gap-2 items-center">
                <input bind:value={editIcon} placeholder="Icon" class="w-12 bg-neutral-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center" />
                <input bind:value={editName} class="flex-1 bg-neutral-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <input bind:value={editColor} type="color" class="w-8 h-8 rounded cursor-pointer bg-neutral-800 border-0 p-0.5 shrink-0" />
                <button onclick={() => saveEdit(cat.id)} class="text-green-400 hover:text-green-300 text-lg leading-none">✓</button>
                <button onclick={() => (editingId = null)} class="text-neutral-500 hover:text-white text-lg leading-none">✕</button>
              </div>
            {:else}
              <div class="flex items-center gap-2">
                <span
                  class="text-neutral-500 cursor-grab active:cursor-grabbing text-xl select-none px-2 py-1 -ml-1 touch-none"
                  ontouchstart={(e) => onTouchStart(e, cat.id)}
                  ontouchmove={onTouchMove}
                  ontouchend={onTouchEnd}
                >≡</span>
                <div class="w-3 h-3 rounded-full shrink-0" style="background-color: {cat.color}"></div>
                <span class="text-sm flex-1">{#if cat.icon}{cat.icon} {/if}{cat.name}</span>
                <button onclick={() => startEdit(cat)} class="text-neutral-500 hover:text-white transition-colors text-sm px-1">✏</button>
                <button onclick={() => removeCategory(cat.id)} class="text-neutral-600 hover:text-red-400 transition-colors text-sm px-1">🗑</button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
