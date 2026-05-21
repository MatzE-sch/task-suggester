<script lang="ts">
  import { onMount } from 'svelte';
  import type { Category, Task, TaskStatus, TaskType } from '$lib/types';
  import { categories } from '$lib/stores/categories';
  import { isLightColor } from '$lib/utils';

  export let task: Partial<Task> = {};
  export let onSubmit: (data: {
    title: string;
    description?: string;
    task_type: TaskType;
    deadline?: string;
    recurrence_days?: number | null;
    status?: TaskStatus;
    snoozed_until?: string;
    priority: number;
    category_ids: number[];
    dependency_ids: number[];
  }) => void;
  export let onCancel: () => void;
  export let allTasks: Task[] = [];

  const isEdit = !!task.id;

  let titleInput: HTMLInputElement;
  onMount(() => { if (!isEdit) titleInput?.focus(); });

  let title = task.title ?? '';
  let description = task.description ?? '';
  let taskType: TaskType = task.task_type ?? 'normal';
  let deadline = task.deadline ? task.deadline.slice(0, 10) : '';
  let selectedStatus: TaskStatus = task.status ?? 'open';
  let waitingUntil: string = (task.status === 'waiting' && task.snoozed_until) ? task.snoozed_until.slice(0, 10) : '';
  let selectedCats: number[] = task.categories?.map((c) => c.id) ?? [];
  let priority: number = task.priority ?? 3;
  let selectedDeps: number[] = task.dependency_ids ?? [];
  let depsOpen = false;

  // Recurrence: decompose stored days back into value+unit for display
  function initRecurrence(days: number | null | undefined): { value: number; unit: 'days' | 'weeks' | 'months' } {
    if (!days) return { value: 1, unit: 'weeks' };
    if (days % 30 === 0) return { value: days / 30, unit: 'months' };
    if (days % 7 === 0) return { value: days / 7, unit: 'weeks' };
    return { value: days, unit: 'days' };
  }
  const initRec = initRecurrence(task.recurrence_days);
  let recurrenceValue: number = initRec.value;
  let recurrenceUnit: 'days' | 'weeks' | 'months' = initRec.unit;

  $: recurrenceDays = recurrenceUnit === 'months' ? recurrenceValue * 30
    : recurrenceUnit === 'weeks' ? recurrenceValue * 7
    : recurrenceValue;

  const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
    { value: 'open', label: 'Offen' },
    { value: 'in_progress', label: 'In Arbeit' },
    { value: 'waiting', label: 'Wartend' },
    { value: 'done', label: 'Erledigt' },
    { value: 'skipped', label: 'Übersprungen' },
  ];

  const TYPE_OPTIONS: { value: TaskType; label: string }[] = [
    { value: 'normal', label: 'Einfach' },
    { value: 'deadline', label: 'Mit Deadline' },
    { value: 'recurring', label: 'Wiederkehrend' },
  ];

  function toggleCat(id: number) {
    selectedCats = selectedCats.includes(id) ? selectedCats.filter((c) => c !== id) : [...selectedCats, id];
  }

  function toggleDep(id: number) {
    if (!selectedDeps.includes(id) && wouldCreateCycle(id)) return;
    selectedDeps = selectedDeps.includes(id) ? selectedDeps.filter((d) => d !== id) : [...selectedDeps, id];
  }

  function wouldCreateCycle(candidateId: number): boolean {
    const thisId = task.id;
    if (!thisId) return false;
    const taskMap = new Map(allTasks.map((t) => [t.id, t]));
    function reaches(fromId: number, targetId: number, visited = new Set<number>()): boolean {
      if (fromId === targetId) return true;
      if (visited.has(fromId)) return false;
      visited.add(fromId);
      const t = taskMap.get(fromId);
      return !!t && t.dependency_ids.some((d) => reaches(d, targetId, visited));
    }
    return reaches(candidateId, thisId);
  }

  $: circularIds = new Set(allTasks.filter((t) => t.id !== task.id && wouldCreateCycle(t.id)).map((t) => t.id));

  function submit() {
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      task_type: taskType,
      deadline: taskType === 'deadline' ? (deadline || undefined) : undefined,
      recurrence_days: taskType === 'recurring' ? recurrenceDays : null,
      ...(isEdit ? { status: selectedStatus } : {}),
      ...(isEdit && selectedStatus === 'waiting' && waitingUntil ? { snoozed_until: waitingUntil + 'T00:00:00Z' } : {}),
      priority,
      category_ids: selectedCats,
      dependency_ids: selectedDeps,
    });
  }
</script>

<div class="space-y-4" onkeydown={(e) => { if (e.ctrlKey && e.key === 'Enter') submit(); else if (e.key === 'Escape') onCancel?.(); }}>
  <input
    bind:this={titleInput}
    bind:value={title}
    type="text"
    placeholder="Task-Titel *"
    class="w-full bg-neutral-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
  />
  <textarea
    bind:value={description}
    placeholder="Beschreibung (optional)"
    rows="3"
    class="w-full bg-neutral-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
  ></textarea>

  <!-- Task-Typ Auswahl -->
  <div class="flex gap-2">
    {#each TYPE_OPTIONS as opt}
      <button
        type="button"
        onclick={() => (taskType = opt.value)}
        class="flex-1 text-xs py-2 rounded-xl transition-colors {taskType === opt.value ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'}"
      >{opt.label}</button>
    {/each}
  </div>

  {#if taskType === 'deadline'}
    <input
      bind:value={deadline}
      type="date"
      class="w-full bg-neutral-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  {/if}

  {#if taskType === 'recurring'}
    <div class="flex gap-2">
      <input
        bind:value={recurrenceValue}
        type="number"
        min="1"
        class="w-24 bg-neutral-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <select
        bind:value={recurrenceUnit}
        class="flex-1 bg-neutral-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="days">Tage</option>
        <option value="weeks">Wochen</option>
        <option value="months">Monate</option>
      </select>
    </div>
  {/if}

  {#if isEdit}
    <div>
      <p class="text-xs text-neutral-500 mb-2">Status</p>
      <select
        bind:value={selectedStatus}
        class="w-full bg-neutral-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {#each STATUS_OPTIONS as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>
    {#if selectedStatus === 'waiting'}
      <input
        bind:value={waitingUntil}
        type="date"
        placeholder="Warte bis (optional)"
        class="w-full bg-neutral-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    {/if}
  {/if}

  <!-- Priorität -->
  <div>
    <div class="flex items-center justify-between mb-1">
      <p class="text-xs text-neutral-500">Priorität</p>
      <span class="text-xs font-medium {priority >= 4 ? 'text-red-400' : priority >= 3 ? 'text-yellow-400' : 'text-neutral-400'}">{['', 'Niedrig', 'Gering', 'Normal', 'Hoch', 'Kritisch'][priority]}</span>
    </div>
    <input
      bind:value={priority}
      type="range"
      min="1"
      max="5"
      step="1"
      class="w-full accent-indigo-500 h-1.5"
    />
    <div class="flex justify-between text-xs text-neutral-600 mt-0.5 px-0.5">
      <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
    </div>
  </div>

  {#if $categories.length > 0}
    <div>
      <p class="text-xs text-neutral-500 mb-2">Kategorien</p>
      <div class="flex flex-wrap gap-2">
        {#each $categories as cat}
          <button
            type="button"
            onclick={() => toggleCat(cat.id)}
            class="text-xs px-2.5 py-1 rounded-full transition-all {!selectedCats.includes(cat.id) && isLightColor(cat.color) ? 'cat-light-color' : ''}"
            style={selectedCats.includes(cat.id)
              ? `background-color: ${cat.color}; color: ${isLightColor(cat.color) ? '#111827' : 'white'}`
              : `background-color: ${cat.color}22; color: ${cat.color}; border: 1px solid ${cat.color}44`}
          >
            {#if cat.icon}{cat.icon} {/if}{cat.name}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if allTasks.filter((t) => t.id !== task.id && t.status !== 'done').length > 0}
    <div>
      <button
        type="button"
        onclick={() => (depsOpen = !depsOpen)}
        class="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        <span class="transition-transform" style="display:inline-block;transform:rotate({depsOpen ? 90 : 0}deg)">▶</span>
        Erst erledigen (Abhängigkeiten){selectedDeps.length > 0 ? ` · ${selectedDeps.length} gewählt` : ''}
      </button>
      {#if depsOpen}
        <div class="mt-2 space-y-1 max-h-32 overflow-y-auto">
          {#each allTasks.filter((t) => t.id !== task.id && t.status !== 'done') as t}
            <label class="flex items-center gap-2 {circularIds.has(t.id) ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}">
              <input type="checkbox" checked={selectedDeps.includes(t.id)} onchange={() => toggleDep(t.id)} disabled={circularIds.has(t.id)} class="accent-indigo-500" />
              <span class="text-sm text-neutral-300">{t.title}{circularIds.has(t.id) ? ' (zirkulär)' : ''}</span>
            </label>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <div class="flex gap-3">
    <button
      onclick={submit}
      disabled={!title.trim()}
      class="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl py-2.5 text-sm font-medium transition-colors"
    >Speichern</button>
    <button
      onclick={onCancel}
      class="px-4 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-sm transition-colors"
    >Abbrechen</button>
  </div>
</div>
