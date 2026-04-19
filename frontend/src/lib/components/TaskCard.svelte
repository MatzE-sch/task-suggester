<script lang="ts">
  import type { Task } from '$lib/types';

  export let task: Task;

  function formatDeadline(deadline: string | null): string | null {
    if (!deadline) return null;
    return new Date(deadline).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function deadlineClass(deadline: string | null): string {
    if (!deadline) return 'text-neutral-500';
    const days = (new Date(deadline).getTime() - Date.now()) / 86400000;
    if (days < 1) return 'text-red-400';
    if (days < 3) return 'text-orange-400';
    if (days < 7) return 'text-yellow-400';
    return 'text-neutral-400';
  }
</script>

<div class="bg-neutral-900 rounded-2xl p-6 space-y-3">
  <h2 class="text-xl font-semibold leading-tight">{task.title}</h2>

  {#if task.description}
    <p class="text-neutral-400 text-sm leading-relaxed">{task.description}</p>
  {/if}

  <div class="flex flex-wrap gap-2 pt-1">
    {#each task.categories as cat}
      <span
        class="text-xs px-2.5 py-1 rounded-full font-medium"
        style="background-color: {cat.color}22; color: {cat.color}; border: 1px solid {cat.color}44"
      >
        {#if cat.icon}{cat.icon} {/if}{cat.name}
      </span>
    {/each}
  </div>

  {#if task.task_type === 'recurring' && task.recurrence_days}
    {@const d = task.recurrence_days}
    <p class="text-sm text-neutral-500">
      🔁 alle {d % 30 === 0 ? `${d / 30} Monat${d / 30 !== 1 ? 'e' : ''}` : d % 7 === 0 ? `${d / 7} Woche${d / 7 !== 1 ? 'n' : ''}` : `${d} Tag${d !== 1 ? 'e' : ''}`}
    </p>
  {/if}

  {#if task.deadline}
    <p class="text-sm {deadlineClass(task.deadline)}">
      📅 {formatDeadline(task.deadline)}
    </p>
  {/if}

  {#if task.dependency_ids.length > 0}
    <p class="text-xs text-neutral-600">{task.dependency_ids.length} Abhängigkeit(en)</p>
  {/if}
</div>
