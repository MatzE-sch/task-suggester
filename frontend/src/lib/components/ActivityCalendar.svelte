<script lang="ts">
  import type { ActivityStats, Category } from '$lib/types';

  export let stats: ActivityStats;
  export let categories: Category[];

  const WEEKS = 26;

  type Day = { date: string; count: number; categories: number[] };

  $: weeks = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: Day[] = [];
    for (let i = WEEKS * 7 - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, count: stats[key]?.count ?? 0, categories: stats[key]?.category_ids ?? [] });
    }
    const firstDow = new Date(days[0].date).getDay();
    const pad = firstDow === 0 ? 6 : firstDow - 1;
    const paddedDays = [...Array(pad).fill(null), ...days];
    const result: (Day | null)[][] = [];
    for (let i = 0; i < paddedDays.length; i += 7) {
      result.push(paddedDays.slice(i, i + 7));
    }
    return result;
  })();

  function cellColor(count: number): string {
    if (count === 0) return '#1a1a1a';
    if (count === 1) return '#312e81';
    if (count === 2) return '#4338ca';
    if (count <= 4) return '#6366f1';
    return '#818cf8';
  }

  function formatDate(d: string): string {
    return new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  }

  const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
</script>

<div class="space-y-3">
  <div class="flex gap-1 overflow-x-auto pb-2">
    <!-- Day labels -->
    <div class="flex flex-col gap-1 mr-1 shrink-0">
      {#each DOW as d}
        <div class="h-3 w-5 text-[9px] text-neutral-600 flex items-center">{d}</div>
      {/each}
    </div>
    <!-- Weeks -->
    {#each weeks as week}
      <div class="flex flex-col gap-1 shrink-0">
        {#each week as day}
          {#if day}
            <div
              class="w-3 h-3 rounded-sm cursor-pointer"
              style="background-color: {cellColor(day.count)}"
              title="{formatDate(day.date)}: {day.count} erledigt"
            ></div>
          {:else}
            <div class="w-3 h-3"></div>
          {/if}
        {/each}
      </div>
    {/each}
  </div>

  <!-- Legend -->
  <div class="flex items-center gap-2 text-xs text-neutral-500">
    <span>Weniger</span>
    {#each [0, 1, 2, 3, 5] as n}
      <div class="w-3 h-3 rounded-sm" style="background-color: {cellColor(n)}"></div>
    {/each}
    <span>Mehr</span>
  </div>
</div>
