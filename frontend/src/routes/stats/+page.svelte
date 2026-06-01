<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { getActivityStats, getCategories, createCategory, updateCategory, deleteCategory, getTaskLog, deleteTaskLog, updateTaskLog, updateTask } from '$lib/api';
  import type { ActivityStats, Category, ActivityLogEntry } from '$lib/types';
  import { isLightColor } from '$lib/utils';
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

  // Task Log state
  let logEntries: ActivityLogEntry[] = [];
  let logLoading = false;
  let pendingDeleteLogId: number | null = null;
  let editLogId: number | null = null;
  let editLogDate = '';
  let datePickerInput: HTMLInputElement;
  let expandedLogId: number | null = null;

  function toggleLogExpand(id: number) {
    if (expandedLogId !== id) pendingDeleteLogId = null;
    expandedLogId = expandedLogId === id ? null : id;
  }

  function startEditLog(entry: ActivityLogEntry) {
    editLogId = entry.id;
    editLogDate = entry.logged_date;
    tick().then(() => datePickerInput?.showPicker());
  }

  async function saveEditLog() {
    if (!editLogId || !editLogDate) return;
    const id = editLogId;
    const date = editLogDate;
    editLogId = null;
    editLogDate = '';
    await updateTaskLog(id, { logged_date: date });
    logEntries = logEntries.map((e) => (e.id === id ? { ...e, logged_date: date } : e));
  }

  async function handleReopenTask(entry: ActivityLogEntry) {
    if (!entry.task_id) return;
    await updateTask(entry.task_id, { status: 'open' });
  }

  async function handleUndoLog(entry: ActivityLogEntry) {
    if (entry.task_id) {
      await updateTask(entry.task_id, { status: 'open' });
    }
    await deleteTaskLog(entry.id);
    logEntries = logEntries.filter((e) => e.id !== entry.id);
  }

  async function confirmDeleteLog(id: number) {
    await deleteTaskLog(id);
    logEntries = logEntries.filter((e) => e.id !== id);
    pendingDeleteLogId = null;
    stats = await getActivityStats();
  }

  $: logByDate = (() => {
    const groups: { date: string; entries: ActivityLogEntry[] }[] = [];
    for (const entry of logEntries) {
      const last = groups[groups.length - 1];
      if (last && last.date === entry.logged_date) {
        last.entries.push(entry);
      } else {
        groups.push({ date: entry.logged_date, entries: [entry] });
      }
    }
    return groups;
  })();

  function formatLogDate(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('de-DE', {
      weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

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
    logLoading = true;
    try {
      logEntries = await getTaskLog();
    } finally {
      logLoading = false;
    }
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
            class="text-xs px-2.5 py-1 rounded-full {isLightColor(cat.color) ? 'cat-light-color' : ''}"
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
              <div class="flex gap-2 items-center min-w-0">
                <input bind:value={editIcon} placeholder="Icon" class="w-10 min-w-0 shrink-0 bg-neutral-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center" />
                <input bind:value={editName} class="min-w-0 flex-1 bg-neutral-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <input bind:value={editColor} type="color" class="w-8 h-8 rounded cursor-pointer bg-neutral-800 border-0 p-0.5 shrink-0" />
                <button onclick={() => saveEdit(cat.id)} class="text-green-400 hover:text-green-300 text-lg leading-none shrink-0">✓</button>
                <button onclick={() => (editingId = null)} class="text-neutral-500 hover:text-white text-lg leading-none shrink-0">✕</button>
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

  <!-- Erledigt-Log -->
  <div>
    <h2 class="text-lg font-semibold mb-3">Erledigt-Log</h2>
    {#if logLoading}
      <p class="text-neutral-600 text-sm text-center py-8">Laden...</p>
    {:else if logByDate.length === 0}
      <p class="text-neutral-600 text-sm text-center py-8">Keine erledigten Einträge.</p>
    {:else}
      <input type="date" bind:this={datePickerInput} bind:value={editLogDate} onchange={saveEditLog} class="sr-only" />
      <div class="space-y-4">
        {#each logByDate as group}
          <div>
            <div class="text-xs text-neutral-500 font-medium px-1 pb-2 border-b border-neutral-800 mb-2">
              {formatLogDate(group.date)}
            </div>
            <div class="space-y-1.5">
              {#each group.entries as entry (entry.id)}
                <div
                  class="bg-neutral-900 rounded-xl overflow-hidden cursor-pointer select-none"
                  onclick={() => toggleLogExpand(entry.id)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => e.key === 'Enter' && toggleLogExpand(entry.id)}
                >
                  <div class="px-3 py-2.5">
                    {#if entry.task_title}
                      <span class="text-sm font-medium block">
                        {#if entry.task_type === 'recurring'}<span class="text-neutral-500 mr-1">🔁</span>{/if}{entry.task_title}
                      </span>
                    {:else}
                      <span class="text-sm text-neutral-600 italic">gelöscht</span>
                    {/if}
                    {#if entry.category_ids.length > 0}
                      <div class="flex flex-wrap gap-1 mt-1">
                        {#each entry.category_ids as catId}
                          {@const cat = categories.find(c => c.id === catId)}
                          {#if cat}
                            <span class="text-xs px-1.5 py-0.5 rounded {isLightColor(cat.color) ? 'cat-light-color' : ''}" style="background-color: {cat.color}22; color: {cat.color}">{cat.name}</span>
                          {/if}
                        {/each}
                      </div>
                    {/if}
                  </div>
                  <div class="task-actions {expandedLogId === entry.id ? 'open' : ''}">
                    <div>
                      <div class="px-3 pb-3 pt-2 flex gap-2 border-t border-neutral-800" onclick={(e) => e.stopPropagation()}>
                        {#if entry.task_id}
                          <button onclick={() => handleReopenTask(entry)} class="flex-1 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors text-neutral-300" title="Task öffnen">↗ Öffnen</button>
                          <button onclick={() => handleUndoLog(entry)} class="flex-1 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors text-blue-400" title="Rückgängig">↺ Rückgängig</button>
                        {/if}
                        <button onclick={() => startEditLog(entry)} class="flex-1 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors text-yellow-400" title="Datum ändern">📅 Datum</button>
                        {#if pendingDeleteLogId === entry.id}
                          <button onclick={() => confirmDeleteLog(entry.id)} class="flex-1 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm transition-colors font-medium">Löschen</button>
                          <button onclick={() => (pendingDeleteLogId = null)} class="flex-1 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-neutral-300 text-sm transition-colors">Abbruch</button>
                        {:else}
                          <button onclick={() => (pendingDeleteLogId = entry.id)} class="flex-1 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-red-400 text-sm transition-colors">🗑 Löschen</button>
                        {/if}
                      </div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .task-actions {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 200ms ease;
  }
  .task-actions.open {
    grid-template-rows: 1fr;
  }
  .task-actions > div {
    overflow: hidden;
  }
</style>
