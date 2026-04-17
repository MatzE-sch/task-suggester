<script lang="ts">
  import type { Category, Task } from '$lib/types';
  import { categories } from '$lib/stores/categories';

  export let task: Partial<Task> = {};
  export let onSubmit: (data: {
    title: string;
    description?: string;
    deadline?: string;
    category_ids: number[];
    dependency_ids: number[];
  }) => void;
  export let onCancel: () => void;
  export let allTasks: Task[] = [];

  let title = task.title ?? '';
  let description = task.description ?? '';
  let deadline = task.deadline ? task.deadline.slice(0, 10) : '';
  let selectedCats: number[] = task.categories?.map((c) => c.id) ?? [];
  let selectedDeps: number[] = task.dependency_ids ?? [];

  function toggleCat(id: number) {
    selectedCats = selectedCats.includes(id) ? selectedCats.filter((c) => c !== id) : [...selectedCats, id];
  }

  function toggleDep(id: number) {
    selectedDeps = selectedDeps.includes(id) ? selectedDeps.filter((d) => d !== id) : [...selectedDeps, id];
  }

  function submit() {
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      deadline: deadline || undefined,
      category_ids: selectedCats,
      dependency_ids: selectedDeps,
    });
  }
</script>

<div class="space-y-4">
  <input
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
  <input
    bind:value={deadline}
    type="date"
    class="w-full bg-neutral-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
  />

  {#if $categories.length > 0}
    <div>
      <p class="text-xs text-neutral-500 mb-2">Kategorien</p>
      <div class="flex flex-wrap gap-2">
        {#each $categories as cat}
          <button
            type="button"
            onclick={() => toggleCat(cat.id)}
            class="text-xs px-2.5 py-1 rounded-full transition-all"
            style={selectedCats.includes(cat.id)
              ? `background-color: ${cat.color}; color: white`
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
      <p class="text-xs text-neutral-500 mb-2">Erst erledigen (Abhängigkeiten)</p>
      <div class="space-y-1 max-h-32 overflow-y-auto">
        {#each allTasks.filter((t) => t.id !== task.id && t.status !== 'done') as t}
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={selectedDeps.includes(t.id)} onchange={() => toggleDep(t.id)} class="accent-indigo-500" />
            <span class="text-sm text-neutral-300">{t.title}</span>
          </label>
        {/each}
      </div>
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
