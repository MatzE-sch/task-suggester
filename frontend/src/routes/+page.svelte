<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { getSuggestion, taskAction, createTask, getTasks, updateTask } from '$lib/api';
  import { loadCategories, categories } from '$lib/stores/categories';
  import { showShortcutHints, newTaskSignal } from '$lib/stores/shortcuts';
  import type { Task, SuggestMode, Category } from '$lib/types';
  import TaskCard from '$lib/components/TaskCard.svelte';
  import TaskForm from '$lib/components/TaskForm.svelte';

  let task: Task | null = null;
  let allTasks: Task[] = [];
  let mode: SuggestMode = 'random';
  let selectedCategoryIds: number[] = [];
  let loading = false;
  let error = '';
  let showBlockForm = false;
  let showEditForm = false;
  let showSnoozeForm = false;
  let showNewTaskForm = false;
  let snoozeDate = '';
  let noTasks = false;

  onMount(async () => {
    if (get(newTaskSignal) > 0) {
      showNewTaskForm = true;
      newTaskSignal.set(0);
    }
    await loadCategories();
    await fetchTasks();
    await fetchSuggestion();
  });

  async function fetchTasks() {
    try { allTasks = await getTasks(); } catch {}
  }

  async function fetchSuggestion() {
    error = '';
    noTasks = false;
    loading = true;
    try {
      task = await getSuggestion(mode, selectedCategoryIds);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('No eligible')) { noTasks = true; task = null; }
      else { error = msg || 'Fehler beim Laden'; }
    } finally {
      loading = false;
    }
  }

  async function doAction(action: string, snoozedUntil?: string) {
    if (!task) return;
    loading = true;
    showSnoozeForm = false;
    try {
      await taskAction(task.id, action, undefined, snoozedUntil ? new Date(snoozedUntil).toISOString() : undefined);
      await fetchTasks();
      await fetchSuggestion();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }

  function confirmSnooze() {
    if (!snoozeDate) return;
    doAction('waiting', snoozeDate.length === 10 ? snoozeDate + 'T00:00' : snoozeDate);
  }

  async function doBlock(data: Parameters<typeof createTask>[0]) {
    if (!task) return;
    loading = true;
    showBlockForm = false;
    try {
      await taskAction(task.id, 'block', data);
      await fetchTasks();
      await fetchSuggestion();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }

  async function doEdit(data: Parameters<typeof createTask>[0]) {
    if (!task) return;
    loading = true;
    showEditForm = false;
    try {
      task = await updateTask(task.id, data);
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }

  async function doNewTask(data: Parameters<typeof createTask>[0]) {
    loading = true;
    showNewTaskForm = false;
    try {
      await createTask(data);
      await fetchTasks();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }

  function toggleModeCat(cat: Category) {
    selectedCategoryIds = selectedCategoryIds.includes(cat.id)
      ? selectedCategoryIds.filter((id) => id !== cat.id)
      : [...selectedCategoryIds, cat.id];
  }
</script>

<div class="py-6 space-y-6">
  <!-- Mode selector -->
  <div class="flex items-center gap-2 flex-wrap">
    {#each [['random', 'Zufällig'], ['deadline', 'Deadline'], ['category', 'Kategorie']] as [m, label]}
      <button
        onclick={() => { mode = m as SuggestMode; fetchSuggestion(); }}
        class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors {mode === m ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'}"
      >{label}</button>
    {/each}
  </div>

  <!-- Category filter (only in category mode) -->
  {#if mode === 'category' && $categories.length > 0}
    <div class="flex flex-wrap gap-2">
      {#each $categories as cat}
        <button
          onclick={() => { toggleModeCat(cat); fetchSuggestion(); }}
          class="text-xs px-2.5 py-1 rounded-full transition-all"
          style={selectedCategoryIds.includes(cat.id)
            ? `background-color: ${cat.color}; color: white`
            : `background-color: ${cat.color}22; color: ${cat.color}; border: 1px solid ${cat.color}44`}
        >{#if cat.icon}{cat.icon} {/if}{cat.name}</button>
      {/each}
    </div>
  {/if}

  <!-- New task inline form -->
  {#if showNewTaskForm}
    <div class="bg-neutral-900 rounded-2xl p-5 space-y-4">
      <p class="font-medium text-sm text-neutral-300">Neuen Task anlegen:</p>
      <TaskForm
        {allTasks}
        onSubmit={doNewTask}
        onCancel={() => (showNewTaskForm = false)}
      />
    </div>
  {/if}

  <!-- Task card / states -->
  {#if loading && !task}
    <div class="bg-neutral-900 rounded-2xl p-6 animate-pulse h-32"></div>
  {:else if noTasks}
    <div class="bg-neutral-900 rounded-2xl p-6 text-center space-y-2">
      <p class="text-2xl">🎉</p>
      <p class="font-medium">Keine offenen Tasks!</p>
      <p class="text-sm text-neutral-500">Alle Aufgaben erledigt oder blockiert.</p>
      <button onclick={() => (showNewTaskForm = true)} class="inline-block mt-2 text-sm text-indigo-400 hover:underline">Neuen Task anlegen</button>
    </div>
  {:else if task && !showEditForm && !showBlockForm}
    <TaskCard {task} />

    {#if showSnoozeForm}
      <!-- Snooze form (task card stays visible above) -->
      <div
        class="bg-neutral-900 rounded-2xl p-5 space-y-4"
        onkeydown={(e) => e.ctrlKey && e.key === 'Enter' && confirmSnooze()}
      >
        <p class="font-medium text-sm text-neutral-300">Ab wann soll der Task wieder auftauchen?</p>
        <input
          bind:value={snoozeDate}
          type="date"
          class="w-full bg-neutral-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <div class="flex gap-2">
          <button
            onclick={() => { const d = new Date(); d.setDate(d.getDate()+1); snoozeDate = d.toISOString().slice(0,10); confirmSnooze(); }}
            class="flex-1 bg-neutral-800 hover:bg-neutral-700 rounded-xl py-2.5 text-sm transition-colors"
          >Morgen</button>
          <button
            onclick={() => { const d = new Date(); d.setDate(d.getDate()+7); snoozeDate = d.toISOString().slice(0,10); confirmSnooze(); }}
            class="flex-1 bg-neutral-800 hover:bg-neutral-700 rounded-xl py-2.5 text-sm transition-colors"
          >Nächste Woche</button>
        </div>
        <div class="flex gap-3">
          <button
            onclick={confirmSnooze}
            disabled={!snoozeDate}
            class="flex-1 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 rounded-xl py-2.5 text-sm font-medium transition-colors"
          >Zurückstellen</button>
          <button
            onclick={() => (showSnoozeForm = false)}
            class="px-4 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-sm transition-colors"
          >Abbrechen</button>
        </div>
      </div>
    {/if}

  {:else if showBlockForm}
    <div class="bg-neutral-900 rounded-2xl p-5 space-y-4">
      <p class="font-medium text-sm text-neutral-300">Neuen Blocker-Task anlegen:</p>
      <TaskForm
        allTasks={allTasks.filter((t) => t.id !== task?.id)}
        onSubmit={doBlock}
        onCancel={() => (showBlockForm = false)}
      />
    </div>
  {:else if showEditForm && task}
    <div class="bg-neutral-900 rounded-2xl p-5 space-y-4">
      <p class="font-medium text-sm text-neutral-300">Task bearbeiten:</p>
      <TaskForm
        task={task}
        {allTasks}
        onSubmit={doEdit}
        onCancel={() => (showEditForm = false)}
      />
    </div>
  {/if}

  {#if error}
    <p class="text-red-400 text-sm text-center">{error}</p>
  {/if}
</div>

<!-- Action buttons: fixed on mobile, inline on desktop -->
{#if task && !showEditForm && !showBlockForm && !showNewTaskForm}
  <!-- Desktop (md+): inline below content -->
  {#if !showSnoozeForm}
    <div class="hidden md:block space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <button
          onclick={() => doAction('done')}
          class="bg-green-700 hover:bg-green-600 rounded-xl py-3 font-medium text-sm transition-colors flex items-center justify-center gap-2"
        >✅ Erledigt{#if $showShortcutHints}<kbd class="ml-1 text-xs bg-green-900 px-1 rounded">e</kbd>{/if}</button>
        <button
          onclick={() => doAction('start')}
          class="bg-indigo-700 hover:bg-indigo-600 rounded-xl py-3 font-medium text-sm transition-colors flex items-center justify-center gap-2"
        >▶ Arbeite daran</button>
        <button
          onclick={() => (showBlockForm = true)}
          class="bg-neutral-800 hover:bg-neutral-700 rounded-xl py-3 font-medium text-sm transition-colors flex items-center justify-center gap-2"
        >⛔ Erst das erledigen</button>
        <button
          onclick={() => { showSnoozeForm = true; snoozeDate = ''; }}
          class="bg-neutral-800 hover:bg-neutral-700 rounded-xl py-3 font-medium text-sm transition-colors flex items-center justify-center gap-2"
        >⏳ Warte bis ...</button>
        <button
          onclick={() => doAction('skip')}
          class="bg-neutral-800 hover:bg-neutral-700 rounded-xl py-3 font-medium text-sm transition-colors flex items-center justify-center gap-2"
        >⏭ Jetzt nicht</button>
        <button
          onclick={() => (showEditForm = true)}
          class="bg-neutral-800 hover:bg-neutral-700 rounded-xl py-3 font-medium text-sm transition-colors flex items-center justify-center gap-2"
        >✏️ Bearbeiten</button>
      </div>
      <button
        onclick={fetchSuggestion}
        class="w-full py-2 text-sm text-neutral-500 hover:text-white transition-colors"
      >↻ Anderen vorschlagen</button>
    </div>
  {/if}

  <!-- Mobile: fixed bottom bar -->
  {#if !showSnoozeForm}
    <div class="md:hidden fixed bottom-16 left-0 right-0 bg-neutral-950/95 backdrop-blur border-t border-neutral-800 p-3 space-y-2 z-30">
      <button
        onclick={fetchSuggestion}
        class="w-full py-1.5 text-xs text-neutral-500 hover:text-white transition-colors"
      >↻ Anderen vorschlagen</button>
      <div class="grid grid-cols-2 gap-2">
        <button
          onclick={() => doAction('done')}
          class="bg-green-700 hover:bg-green-600 rounded-xl py-3 font-medium text-sm transition-colors flex items-center justify-center gap-2"
        >✅ Erledigt</button>
        <button
          onclick={() => doAction('start')}
          class="bg-indigo-700 hover:bg-indigo-600 rounded-xl py-3 font-medium text-sm transition-colors flex items-center justify-center gap-2"
        >▶ Arbeite daran</button>
        <button
          onclick={() => (showBlockForm = true)}
          class="bg-neutral-800 hover:bg-neutral-700 rounded-xl py-3 font-medium text-sm transition-colors flex items-center justify-center gap-2"
        >⛔ Erst das erledigen</button>
        <button
          onclick={() => { showSnoozeForm = true; snoozeDate = ''; }}
          class="bg-neutral-800 hover:bg-neutral-700 rounded-xl py-3 font-medium text-sm transition-colors flex items-center justify-center gap-2"
        >⏳ Warte bis ...</button>
        <button
          onclick={() => doAction('skip')}
          class="bg-neutral-800 hover:bg-neutral-700 rounded-xl py-3 font-medium text-sm transition-colors flex items-center justify-center gap-2"
        >⏭ Jetzt nicht</button>
        <button
          onclick={() => (showEditForm = true)}
          class="bg-neutral-800 hover:bg-neutral-700 rounded-xl py-3 font-medium text-sm transition-colors flex items-center justify-center gap-2"
        >✏️ Bearbeiten</button>
      </div>
    </div>
  {/if}
{/if}
