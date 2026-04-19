<script lang="ts">
  import { onMount } from 'svelte';
  import type { ActivityStats, Category } from '$lib/types';

  export let stats: ActivityStats;
  export let categories: Category[];

  let scrollContainer: HTMLDivElement;

  const WEEKS = 26;

  type Day = { date: string; count: number; categories: number[]; categoryCounts: Record<string, number> };

  $: weeks = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: Day[] = [];
    for (let i = WEEKS * 7 - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({ date: key, count: stats[key]?.count ?? 0, categories: stats[key]?.category_ids ?? [], categoryCounts: stats[key]?.category_counts ?? {} });
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

  function cellStyle(day: Day): string {
    if (day.count === 0) return `background-color: var(--calendar-empty)`;
    const opacity = day.count === 1 ? 0.55 : day.count === 2 ? 0.7 : day.count <= 4 ? 0.85 : 1;
    const entries = Object.entries(day.categoryCounts)
      .map(([id, cnt]) => ({ color: categories.find(c => Number(c.id) === Number(id))?.color, cnt }))
      .filter((e): e is { color: string; cnt: number } => !!e.color);
    if (entries.length === 0) return `background-color: #6366f1; opacity: ${opacity}`;
    if (entries.length === 1) return `background-color: ${entries[0].color}; opacity: ${opacity}`;
    const total = entries.reduce((s, e) => s + e.cnt, 0);
    let pos = 0;
    const stops = entries.flatMap(({ color, cnt }) => {
      const end = pos + (cnt / total) * 100;
      const s = [`${color} ${pos.toFixed(1)}%`, `${color} ${end.toFixed(1)}%`];
      pos = end;
      return s;
    });
    return `background: linear-gradient(to bottom, ${stops.join(', ')}); opacity: ${opacity}`;
  }

  function cellTitle(day: Day): string {
    const names = day.categories
      .map(id => categories.find(c => Number(c.id) === Number(id))?.name)
      .filter(Boolean).join(', ');
    const base = `${formatDate(day.date)}: ${day.count} erledigt`;
    return names ? `${base} (${names})` : base;
  }

  function formatDate(d: string): string {
    return new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  }

  const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  onMount(() => {
    if (scrollContainer) scrollContainer.scrollLeft = scrollContainer.scrollWidth;
  });
</script>

<div class="space-y-3">
  <div bind:this={scrollContainer} class="flex gap-1 overflow-x-auto pb-2">
    <!-- Weeks -->
    {#each weeks as week}
      <div class="flex flex-col gap-1 shrink-0">
        {#each week as day}
          {#if day}
            <div
              class="w-5 h-5 rounded-sm cursor-pointer"
              style={cellStyle(day)}
              title={cellTitle(day)}
            ></div>
          {:else}
            <div class="w-5 h-5"></div>
          {/if}
        {/each}
      </div>
    {/each}
    <!-- Day labels -->
    <div class="flex flex-col gap-1 ml-1 shrink-0">
      {#each DOW as d}
        <div class="h-5 w-5 text-[9px] text-neutral-600 flex items-center">{d}</div>
      {/each}
    </div>
  </div>

</div>
