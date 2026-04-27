<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { getTasks, createTask, deleteTask, updateTask, taskAction, downloadIcs, getTaskLog, deleteTaskLog, updateTaskLog } from '$lib/api';
  import { getCachedTasks, cacheActivityStats } from '$lib/cache';
  import { loadCategories } from '$lib/stores/categories';
  import { categories } from '$lib/stores/categories';
  import type { Task, TaskStatus, TaskType, ActivityLogEntry } from '$lib/types';
  import { isLightColor } from '$lib/utils';
  import TaskForm from '$lib/components/TaskForm.svelte';
  import { longpress } from '$lib/actions/longpress';

  let tasks: Task[] = [];
  let showForm = false;
  let editTask: Task | null = null;
  let filter: TaskStatus | 'all' | 'recurring' = 'all';
  let loading = false;
  let search = '';

  // Task Log state
  let logEntries: ActivityLogEntry[] = [];
  let logLoading = false;
  let editLogId: number | null = null;
  let editLogCategoryIds: number[] = [];
  let editLogDate = '';

  const STATUS_LABELS: Record<TaskStatus, string> = {
    open: 'Offen',
    in_progress: 'In Arbeit',
    waiting: 'Wartend',
    done: 'Erledigt',
    skipped: 'Übersprungen',
  };

  const STATUS_COLORS: Record<TaskStatus, string> = {
    open: 'text-blue-400',
    in_progress: 'text-indigo-400',
    waiting: 'text-yellow-400',
    done: 'text-green-400',
    skipped: 'text-neutral-500',
  };

  const SCROLL_KEY = 'tasks-scroll';

  function getMain(): HTMLElement | null {
    return document.querySelector('main');
  }

  function saveScroll() {
    const el = getMain();
    if (el) sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop));
  }

  async function restoreScroll() {
    await tick();
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved) {
      const el = getMain();
      if (el) el.scrollTop = parseInt(saved);
    }
  }

  onMount(() => {
    const cached = getCachedTasks();
    if (cached) tasks = cached;

    Promise.all([loadCategories(), load()]).then(() => restoreScroll());

    const el = getMain();
    el?.addEventListener('scroll', saveScroll, { passive: true });
    return () => el?.removeEventListener('scroll', saveScroll);
  });

  async function load() {
    tasks = await getTasks();
  }

  async function loadLog() {
    logLoading = true;
    try {
      logEntries = await getTaskLog();
    } finally {
      logLoading = false;
    }
  }

  $: if (filter === 'done') loadLog();

  // Group log entries by date for display
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

  async function handleDeleteLog(id: number) {
    if (!confirm('Eintrag wirklich löschen?')) return;
    await deleteTaskLog(id);
    logEntries = logEntries.filter((e) => e.id !== id);
    cacheActivityStats({} as never);
  }

  function startEditLog(entry: ActivityLogEntry) {
    editLogId = entry.id;
    editLogCategoryIds = [...entry.category_ids];
    editLogDate = entry.logged_date;
  }

  function cancelEditLog() {
    editLogId = null;
  }

  async function saveEditLog(id: number) {
    const updated = await updateTaskLog(id, {
      category_ids: editLogCategoryIds,
      logged_date: editLogDate,
    });
    logEntries = logEntries.map((e) => {
      if (e.id !== id) return e;
      return { ...e, category_ids: updated.category_ids, logged_date: updated.logged_date };
    });
    // Re-sort if date changed
    logEntries = [...logEntries].sort((a, b) =>
      b.logged_date.localeCompare(a.logged_date) || b.created_at.localeCompare(a.created_at)
    );
    editLogId = null;
    cacheActivityStats({} as never);
  }

  function toggleLogCategory(id: number) {
    if (editLogCategoryIds.includes(id)) {
      editLogCategoryIds = editLogCategoryIds.filter((c) => c !== id);
    } else {
      editLogCategoryIds = [...editLogCategoryIds, id];
    }
  }

  function openNewForm() {
    showForm = true;
    editTask = null;
    getMain()?.scrollTo({ top: 0 });
  }

  function openEditTask(task: Task) {
    editTask = task;
    getMain()?.scrollTo({ top: 0 });
  }

  function cancelNew() {
    showForm = false;
    restoreScroll();
  }

  function cancelEdit() {
    editTask = null;
    restoreScroll();
  }

  async function handleCreate(data: Parameters<typeof createTask>[0]) {
    loading = true;
    try {
      await createTask(data);
      showForm = false;
      await load();
      await restoreScroll();
    } finally { loading = false; }
  }

  async function handleEdit(data: Parameters<typeof createTask>[0]) {
    if (!editTask) return;
    loading = true;
    try {
      await updateTask(editTask.id, data);
      editTask = null;
      await load();
      await restoreScroll();
    } finally { loading = false; }
  }

  async function handleDelete(id: number) {
    if (!confirm('Task wirklich löschen?')) return;
    await deleteTask(id);
    await load();
  }

  async function markDone(id: number) {
    try {
      await taskAction(id, 'done');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (!msg.includes('already completed')) alert(msg || 'Fehler');
    }
    await load();
  }

  $: filtered = (filter === 'all'
    ? tasks
    : filter === 'recurring'
      ? tasks.filter((t) => t.task_type === 'recurring')
      : filter === 'done'
        ? []
        : tasks.filter((t) => t.status === filter)
  ).filter((t) => !search || t.title.toLowerCase().includes(search.toLowerCase()));

  function recurringProgress(task: Task): number {
    if (!task.recurrence_days) return -1;
    if (task.status === 'waiting' && task.last_completed_at && task.snoozed_until) {
      const waitingUntil = new Date(task.snoozed_until).getTime();
      const lastDone = new Date(task.last_completed_at).getTime();
      return (waitingUntil - lastDone) / (task.recurrence_days * 86400000) * 100;
    }
    if (task.last_completed_at) {
      return (Date.now() - new Date(task.last_completed_at).getTime()) / (task.recurrence_days * 86400000) * 100;
    }
    if (!task.snoozed_until) return -1;
    const due = new Date(task.snoozed_until).getTime();
    const lastDone = due - task.recurrence_days * 86400000;
    return (Date.now() - lastDone) / (task.recurrence_days * 86400000) * 100;
  }

  function progressColor(pct: number): string {
    if (pct < 70) return 'text-green-500';
    if (pct < 100) return 'text-yellow-400';
    if (pct < 150) return 'text-orange-400';
    return 'text-red-400';
  }

  let ordered: { task: Task; depth: number }[] = [];
  $: {
    if (filter === 'done') {
      ordered = [];
    } else if (filter === 'recurring') {
      ordered = filtered
        .slice()
        .sort((a, b) => recurringProgress(b) - recurringProgress(a))
        .map((task) => ({ task, depth: 0 }));
    } else {
      const taskMap = new Map(tasks.map((t) => [t.id, t]));
      const depOfFiltered = new Set(filtered.flatMap((t) => t.dependency_ids));
      ordered = [];
      const placed = new Set<number>();
      function place(id: number, depth: number, ancestors: Set<number>) {
        if (placed.has(id) || ancestors.has(id)) return;
        const t = taskMap.get(id);
        if (!t) return;
        placed.add(id);
        ordered.push({ task: t, depth });
        const next = new Set(ancestors);
        next.add(id);
        for (const depId of t.dependency_ids) place(depId, depth + 1, next);
      }
      const topLevel = filtered.filter((t) => !depOfFiltered.has(t.id));
      for (const task of topLevel) place(task.id, 0, new Set());
      for (const task of filtered) place(task.id, 0, new Set());
    }
  }
</script>

{#if showForm || editTask}
  <div class="py-6 space-y-4">
    <div class="flex items-center gap-3">
      <button
        onclick={() => { if (editTask) cancelEdit(); else cancelNew(); }}
        class="text-neutral-400 hover:text-white transition-colors text-lg leading-none"
        title="Zurück"
      >←</button>
      <h1 class="text-xl font-bold">{editTask ? 'Task bearbeiten' : 'Neuer Task'}</h1>
    </div>
    <div class="bg-neutral-900 rounded-2xl p-5">
      {#if editTask}
        <TaskForm task={editTask} allTasks={tasks} onSubmit={handleEdit} onCancel={cancelEdit} />
      {:else}
        <TaskForm onSubmit={handleCreate} onCancel={cancelNew} allTasks={tasks} />
      {/if}
    </div>
  </div>
{:else}
  <div class="py-6 space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold">Alle Tasks</h1>
      <div class="flex gap-2">
        <button
          onclick={() => downloadIcs()}
          class="text-xs px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors text-neutral-400"
        >📅 ICS</button>
        <button
          onclick={openNewForm}
          class="text-sm px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors font-medium"
        >+ Neu</button>
      </div>
    </div>

    <!-- Status filter -->
    <div class="flex gap-2 flex-wrap">
      {#each [['all', 'Alle'], ['open', 'Offen'], ['in_progress', 'In Arbeit'], ['waiting', 'Wartend'], ['done', 'Erledigt'], ['recurring', '🔁 Wiederkehrend']] as [f, label]}
        <button
          onclick={() => (filter = f as typeof filter)}
          class="text-xs px-3 py-1.5 rounded-full transition-colors {filter === f ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'}"
        >{label}</button>
      {/each}
    </div>

    {#if filter !== 'done'}
      <!-- Search -->
      <input
        bind:value={search}
        type="search"
        placeholder="Suchen..."
        class="w-full bg-neutral-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      <!-- Task list -->
      <div class="space-y-2">
        {#each ordered as { task, depth } (task.id)}
          <div class="bg-neutral-900 rounded-xl p-4 flex items-start justify-between gap-3" style="margin-left: {depth * 1.5}rem; {depth > 0 ? 'border-left: 2px solid #404040;' : ''}">
            <div class="flex-1 min-w-0">
              <p class="font-medium truncate" use:longpress>{task.title}</p>
              <div class="flex items-center gap-3 mt-1 flex-wrap">
                <span class="text-xs {STATUS_COLORS[task.status]}">{STATUS_LABELS[task.status]}</span>
                {#each task.categories as cat}
                  <span class="text-xs px-1.5 py-0.5 rounded {isLightColor(cat.color) ? 'cat-light-color' : ''}" style="background-color: {cat.color}22; color: {cat.color}">{cat.name}</span>
                {/each}
                {#if task.task_type === 'recurring' && task.recurrence_days}
                  {@const pct = recurringProgress(task)}
                  <span class="text-xs text-neutral-500">🔁 {task.recurrence_days % 30 === 0 ? `${task.recurrence_days / 30}M` : task.recurrence_days % 7 === 0 ? `${task.recurrence_days / 7}W` : `${task.recurrence_days}T`}</span>
                  {#if pct >= 0}
                    <span class="text-xs font-medium {progressColor(pct)}">{Math.round(pct)}%</span>
                  {/if}
                {/if}
                {#if task.deadline}
                  <span class="text-xs text-neutral-500">📅 {new Date(task.deadline).toLocaleDateString('de-DE')}</span>
                {/if}
                {#if task.status === 'waiting' && task.snoozed_until}
                  <span class="text-xs text-yellow-500">⏳ {new Date(task.snoozed_until).toLocaleDateString('de-DE')}</span>
                {/if}
              </div>
            </div>
            <div class="flex gap-2 shrink-0 items-center">
              {#if task.status !== 'done'}
                <button onclick={() => markDone(task.id)} class="text-base text-neutral-500 hover:text-green-400 transition-colors font-bold" title="Als erledigt markieren">✓</button>
              {/if}
              <button onclick={() => openEditTask(task)} class="text-base text-neutral-500 hover:text-yellow-400 transition-colors">✏</button>
              <button onclick={() => handleDelete(task.id)} class="text-base text-neutral-500 hover:text-red-400 transition-colors">🗑</button>
            </div>
          </div>
        {/each}

        {#if ordered.length === 0}
          <p class="text-neutral-600 text-sm text-center py-8">Keine Tasks vorhanden.</p>
        {/if}
      </div>
    {:else}
      <!-- Task Log -->
      {#if logLoading}
        <p class="text-neutral-600 text-sm text-center py-8">Laden...</p>
      {:else if logByDate.length === 0}
        <p class="text-neutral-600 text-sm text-center py-8">Keine erledigten Einträge.</p>
      {:else}
        <div class="space-y-4">
          {#each logByDate as group}
            <div>
              <div class="text-xs text-neutral-500 font-medium px-1 pb-2 border-b border-neutral-800 mb-2">
                {formatLogDate(group.date)}
              </div>
              <div class="space-y-1.5">
                {#each group.entries as entry (entry.id)}
                  {#if editLogId === entry.id}
                    <!-- Inline edit -->
                    <div class="bg-neutral-900 rounded-xl p-3 space-y-2">
                      <div class="flex flex-wrap gap-1.5">
                        {#each $categories as cat}
                          <button
                            onclick={() => toggleLogCategory(cat.id)}
                            class="text-xs px-2 py-0.5 rounded transition-all {editLogCategoryIds.includes(cat.id) ? '' : 'opacity-30'} {isLightColor(cat.color) ? 'cat-light-color' : ''}"
                            style="background-color: {cat.color}22; color: {cat.color}; border: 1px solid {editLogCategoryIds.includes(cat.id) ? cat.color : 'transparent'}"
                          >{cat.name}</button>
                        {/each}
                      </div>
                      <input
                        bind:value={editLogDate}
                        type="date"
                        class="bg-neutral-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                      />
                      <div class="flex gap-2">
                        <button onclick={() => saveEditLog(entry.id)} class="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors">Speichern</button>
                        <button onclick={cancelEditLog} class="text-xs px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors">Abbrechen</button>
                      </div>
                    </div>
                  {:else}
                    <div class="bg-neutral-900 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
                      <div class="flex-1 min-w-0">
                        {#if entry.task_title}
                          <span class="text-sm font-medium truncate block">
                            {#if entry.task_type === 'recurring'}<span class="text-neutral-500 mr-1">🔁</span>{/if}{entry.task_title}
                          </span>
                        {:else}
                          <span class="text-sm text-neutral-600 italic">gelöscht</span>
                        {/if}
                        {#if entry.category_ids.length > 0}
                          <div class="flex flex-wrap gap-1 mt-1">
                            {#each entry.category_ids as catId}
                              {@const cat = $categories.find(c => c.id === catId)}
                              {#if cat}
                                <span class="text-xs px-1.5 py-0.5 rounded {isLightColor(cat.color) ? 'cat-light-color' : ''}" style="background-color: {cat.color}22; color: {cat.color}">{cat.name}</span>
                              {/if}
                            {/each}
                          </div>
                        {/if}
                      </div>
                      <div class="flex gap-2 shrink-0">
                        <button onclick={() => startEditLog(entry)} class="text-sm text-neutral-500 hover:text-yellow-400 transition-colors">✏</button>
                        <button onclick={() => handleDeleteLog(entry.id)} class="text-sm text-neutral-500 hover:text-red-400 transition-colors">🗑</button>
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
{/if}
