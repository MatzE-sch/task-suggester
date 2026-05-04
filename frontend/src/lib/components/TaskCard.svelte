<script lang="ts">
  import type { Task } from '$lib/types';
  import { longpress } from '$lib/actions/longpress';
  import { isLightColor } from '$lib/utils';

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

  function recurringProgress(t: Task): number {
    if (!t.recurrence_days) return -1;
    if (t.status === 'waiting' && t.last_completed_at && t.snoozed_until) {
      return (new Date(t.snoozed_until).getTime() - new Date(t.last_completed_at).getTime()) / (t.recurrence_days * 86400000) * 100;
    }
    if (t.last_completed_at) {
      return (Date.now() - new Date(t.last_completed_at).getTime()) / (t.recurrence_days * 86400000) * 100;
    }
    if (!t.snoozed_until) return -1;
    const due = new Date(t.snoozed_until).getTime();
    return (Date.now() - (due - t.recurrence_days * 86400000)) / (t.recurrence_days * 86400000) * 100;
  }

  function progressColor(pct: number): string {
    if (pct < 70) return 'text-green-500';
    if (pct < 100) return 'text-yellow-400';
    if (pct < 150) return 'text-orange-400';
    return 'text-red-400';
  }
</script>

<div class="bg-neutral-900 rounded-2xl p-6 space-y-3">
  <h2 class="text-xl font-semibold leading-tight" use:longpress>{task.title}</h2>

  {#if task.description}
    <p class="text-neutral-400 text-sm leading-relaxed" use:longpress>{task.description}</p>
  {/if}

  <div class="flex flex-wrap gap-2 pt-1">
    {#each task.categories as cat}
      <span
        class="text-xs px-2.5 py-1 rounded-full font-medium {isLightColor(cat.color) ? 'cat-light-color' : ''}"
        style="background-color: {cat.color}22; color: {cat.color}; border: 1px solid {cat.color}44"
      >
        {#if cat.icon}{cat.icon} {/if}{cat.name}
      </span>
    {/each}
  </div>

  {#if task.task_type === 'recurring' && task.recurrence_days}
    {@const d = task.recurrence_days}
    {@const pct = recurringProgress(task)}
    <p class="text-sm text-neutral-500">
      🔁 alle {d % 30 === 0 ? `${d / 30} Monat${d / 30 !== 1 ? 'e' : ''}` : d % 7 === 0 ? `${d / 7} Woche${d / 7 !== 1 ? 'n' : ''}` : `${d} Tag${d !== 1 ? 'e' : ''}`}
      {#if pct >= 0}<span class="font-medium {progressColor(pct)}">{Math.round(pct)}%</span>{/if}
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
