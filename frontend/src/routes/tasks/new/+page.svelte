<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { createTask, getTasks } from '$lib/api';
  import { loadCategories } from '$lib/stores/categories';
  import { getCachedTasks } from '$lib/cache';
  import type { Task } from '$lib/types';
  import TaskForm from '$lib/components/TaskForm.svelte';

  let allTasks: Task[] = [];
  let loading = false;
  let error = '';

  onMount(async () => {
    allTasks = getCachedTasks() ?? [];
    await Promise.all([loadCategories(), getTasks().then((t) => (allTasks = t)).catch(() => {})]);
  });

  async function doCreate(data: Parameters<typeof createTask>[0]) {
    loading = true;
    error = '';
    try {
      await createTask(data);
      goto('/tasks');
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'Fehler beim Speichern';
      loading = false;
    }
  }
</script>

<div class="py-6 space-y-4">
  <h1 class="font-semibold text-lg">Neuen Task anlegen</h1>

  {#if loading}
    <div class="bg-neutral-900 rounded-2xl p-6 animate-pulse h-32"></div>
  {:else}
    <div class="bg-neutral-900 rounded-2xl p-5">
      <TaskForm
        {allTasks}
        onSubmit={doCreate}
        onCancel={() => goto('/tasks')}
      />
    </div>
  {/if}

  {#if error}
    <p class="text-red-400 text-sm text-center">{error}</p>
  {/if}
</div>
