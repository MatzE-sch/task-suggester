<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { getTasks, createTask, deleteTask, updateTask, taskAction, downloadIcs } from '$lib/api';
  import { getCachedTasks } from '$lib/cache';
  import { loadCategories } from '$lib/stores/categories';
  import { categories } from '$lib/stores/categories';
  import type { Task, TaskStatus, TaskType } from '$lib/types';
  import { isLightColor } from '$lib/utils';
  import TaskForm from '$lib/components/TaskForm.svelte';

  let tasks: Task[] = [];
  let showForm = false;
  let editTask: Task | null = null;
  let filter: TaskStatus | 'all' | 'recurring' = 'open';
  let loading = false;
  let search = '';
  let sortByPriority = false;
  let expandedTaskId: number | null = null;

  function toggleExpand(id: number) {
    expandedTaskId = expandedTaskId === id ? null : id;
  }

  const FILTER_KEY = 'tasks-filter';

  function setFilter(f: typeof filter) {
    filter = f;
    sessionStorage.setItem(FILTER_KEY, f);
  }

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

  let savedScrollPos = 0;

  function saveScroll() {
    const el = getMain();
    if (el) sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop));
  }

  async function restoreScroll() {
    await tick();
    const el = getMain();
    if (el) el.scrollTop = savedScrollPos;
  }

  onMount(() => {
    const savedFilter = sessionStorage.getItem(FILTER_KEY) as typeof filter;
    if (savedFilter && savedFilter !== 'done') filter = savedFilter;

    const cached = getCachedTasks();
    if (cached) tasks = cached;

    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved) savedScrollPos = parseInt(saved);

    Promise.all([loadCategories(), load()]).then(() => restoreScroll());

    const el = getMain();
    el?.addEventListener('scroll', saveScroll, { passive: true });
    return () => el?.removeEventListener('scroll', saveScroll);
  });

  async function load() {
    tasks = await getTasks();
  }

  function openNewForm() {
    savedScrollPos = getMain()?.scrollTop ?? 0;
    showForm = true;
    editTask = null;
    getMain()?.scrollTo({ top: 0 });
  }

  function openEditTask(task: Task) {
    savedScrollPos = getMain()?.scrollTop ?? 0;
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
    if (expandedTaskId === id) expandedTaskId = null;
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
    if (filter === 'recurring') {
      ordered = filtered
        .slice()
        .sort((a, b) => recurringProgress(b) - recurringProgress(a))
        .map((task) => ({ task, depth: 0 }));
    } else {
      const source = sortByPriority
        ? filtered.slice().sort((a, b) => b.priority - a.priority)
        : filtered;
      const taskMap = new Map(tasks.map((t) => [t.id, t]));
      const depOfFiltered = new Set(source.flatMap((t) => t.dependency_ids));
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
      const topLevel = source.filter((t) => !depOfFiltered.has(t.id));
      for (const task of topLevel) place(task.id, 0, new Set());
      for (const task of source) place(task.id, 0, new Set());
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
      {#each [['open', 'Offen'], ['recurring', '🔁 Wiederkehrend'], ['in_progress', 'In Arbeit'], ['waiting', 'Wartend'], ['all', 'Alle']] as [f, label]}
        <button
          onclick={() => setFilter(f as typeof filter)}
          class="text-xs px-3 py-1.5 rounded-full transition-colors {filter === f ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'}"
        >{label}</button>
      {/each}
      <button
        onclick={() => (sortByPriority = !sortByPriority)}
        class="text-xs px-3 py-1.5 rounded-full transition-colors {sortByPriority ? 'bg-indigo-700 text-white' : 'text-neutral-500 hover:text-white'}"
      >↑ Priorität</button>
    </div>

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
        <div
          class="bg-neutral-900 rounded-xl overflow-hidden cursor-pointer select-none"
          style="margin-left: {depth * 1.5}rem; {depth > 0 ? 'border-left: 2px solid #404040;' : ''}"
          onclick={() => toggleExpand(task.id)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && toggleExpand(task.id)}
        >
          <div class="p-4">
            <p class="font-medium">{task.title}</p>
            <div class="flex items-center gap-3 mt-1 flex-wrap">
              <span class="text-xs {STATUS_COLORS[task.status]}">{STATUS_LABELS[task.status]}</span>
              {#if task.priority && task.priority !== 3}
                <span class="text-xs {task.priority >= 4 ? 'text-red-400' : 'text-neutral-500'}">{task.priority >= 4 ? '▲'.repeat(task.priority - 3) : '▼'.repeat(3 - task.priority)} P{task.priority}</span>
              {/if}
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
          <div class="task-actions {expandedTaskId === task.id ? 'open' : ''}">
            <div>
              <div class="px-3 pb-3 pt-2 flex gap-2 border-t border-neutral-800" onclick={(e) => e.stopPropagation()}>
                {#if task.status !== 'done'}
                  <button onclick={() => markDone(task.id)} class="flex-1 py-2 rounded-xl bg-green-900/40 text-green-400 hover:bg-green-900/70 text-sm transition-colors font-medium">✓ Erledigt</button>
                {/if}
                <button onclick={() => openEditTask(task)} class="flex-1 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-yellow-400 text-sm transition-colors">✏ Bearbeiten</button>
                <button onclick={() => handleDelete(task.id)} class="flex-1 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-red-400 text-sm transition-colors">🗑 Löschen</button>
              </div>
            </div>
          </div>
        </div>
      {/each}

      {#if ordered.length === 0}
        <p class="text-neutral-600 text-sm text-center py-8">Keine Tasks vorhanden.</p>
      {/if}
    </div>
  </div>
{/if}

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
