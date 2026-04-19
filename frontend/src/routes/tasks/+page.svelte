<script lang="ts">
  import { onMount } from 'svelte';
  import { getTasks, createTask, deleteTask, updateTask, taskAction, downloadIcs } from '$lib/api';
  import { loadCategories } from '$lib/stores/categories';
  import type { Task, TaskStatus, TaskType } from '$lib/types';
  import TaskForm from '$lib/components/TaskForm.svelte';

  let tasks: Task[] = [];
  let showForm = false;
  let editTask: Task | null = null;
  let filter: TaskStatus | 'all' | 'recurring' = 'all';
  let loading = false;

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

  onMount(async () => {
    await loadCategories();
    await load();
  });

  async function load() {
    tasks = await getTasks();
  }

  async function handleCreate(data: Parameters<typeof createTask>[0]) {
    loading = true;
    try {
      await createTask(data);
      showForm = false;
      await load();
    } finally { loading = false; }
  }

  async function handleEdit(data: Parameters<typeof createTask>[0]) {
    if (!editTask) return;
    loading = true;
    try {
      await updateTask(editTask.id, data);
      editTask = null;
      await load();
    } finally { loading = false; }
  }

  async function handleDelete(id: number) {
    if (!confirm('Task wirklich löschen?')) return;
    await deleteTask(id);
    await load();
  }

  async function markDone(id: number) {
    await taskAction(id, 'done');
    await load();
  }

  async function reopen(id: number) {
    const { updateTask } = await import('$lib/api');
    await updateTask(id, {});
    // Reset via patch with status isn't in schema — re-fetch
    await load();
  }

  $: filtered = filter === 'all'
    ? tasks
    : filter === 'recurring'
      ? tasks.filter((t) => t.task_type === 'recurring')
      : tasks.filter((t) => t.status === filter);

  function recurringProgress(task: Task): number {
    if (!task.recurrence_days || !task.snoozed_until) return -1;
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
        onclick={() => { showForm = false; editTask = null; }}
        class="text-neutral-400 hover:text-white transition-colors text-lg leading-none"
        title="Zurück"
      >←</button>
      <h1 class="text-xl font-bold">{editTask ? 'Task bearbeiten' : 'Neuer Task'}</h1>
    </div>
    <div class="bg-neutral-900 rounded-2xl p-5">
      {#if editTask}
        <TaskForm task={editTask} allTasks={tasks} onSubmit={handleEdit} onCancel={() => (editTask = null)} />
      {:else}
        <TaskForm onSubmit={handleCreate} onCancel={() => (showForm = false)} allTasks={tasks} />
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
          onclick={() => { showForm = true; editTask = null; }}
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

    <!-- Task list -->
    <div class="space-y-2">
      {#each ordered as { task, depth } (task.id)}
        <div class="bg-neutral-900 rounded-xl p-4 flex items-start justify-between gap-3" style="margin-left: {depth * 1.5}rem; {depth > 0 ? 'border-left: 2px solid #404040;' : ''}">
          <div class="flex-1 min-w-0">
            <p class="font-medium truncate">{task.title}</p>
            <div class="flex items-center gap-3 mt-1 flex-wrap">
              <span class="text-xs {STATUS_COLORS[task.status]}">{STATUS_LABELS[task.status]}</span>
              {#each task.categories as cat}
                <span class="text-xs px-1.5 py-0.5 rounded" style="background-color: {cat.color}22; color: {cat.color}">{cat.name}</span>
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
            </div>
          </div>
          <div class="flex gap-2 shrink-0 items-center">
            {#if task.status !== 'done'}
              <button onclick={() => markDone(task.id)} class="text-sm text-neutral-500 hover:text-green-400 transition-colors font-bold" title="Als erledigt markieren">✓</button>
            {/if}
            <button onclick={() => (editTask = task)} class="text-xs text-neutral-500 hover:text-white transition-colors">✏️</button>
            <button onclick={() => handleDelete(task.id)} class="text-xs text-neutral-500 hover:text-red-400 transition-colors">🗑</button>
          </div>
        </div>
      {/each}

      {#if ordered.length === 0}
        <p class="text-neutral-600 text-sm text-center py-8">Keine Tasks vorhanden.</p>
      {/if}
    </div>
  </div>
{/if}
