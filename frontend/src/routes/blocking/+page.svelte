<script lang="ts">
  import { onMount } from 'svelte';
  import { getBlockSettings, putBlockSettings } from '$lib/api';
  import { getCachedBlockSettings } from '$lib/cache';
  import {
    isNative, getInstalledApps, setNativeBlockConfig,
    isAccessibilityEnabled, openAccessibilitySettings,
    type InstalledApp,
  } from '$lib/native';
  import type { BlockSettings, ScheduleWindow } from '$lib/types';

  let settings: BlockSettings = { enabled: false, blocked_packages: [], schedule_windows: [] };
  let installedApps: InstalledApp[] = [];
  let accessibilityOn = false;
  let search = '';
  let saveState: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let loaded = false;

  onMount(() => {
    settings = getCachedBlockSettings() ?? settings;
    loaded = true;
    if (isNative()) {
      getInstalledApps().then((apps) => (installedApps = apps.sort((a, b) => a.label.localeCompare(b.label))));
      refreshAccessibility();
      document.addEventListener('visibilitychange', refreshAccessibility);
    }
    getBlockSettings()
      .then(async (s) => {
        settings = s;
        await setNativeBlockConfig(s);
      })
      .catch(() => {});
    return () => document.removeEventListener('visibilitychange', refreshAccessibility);
  });

  async function refreshAccessibility() {
    if (document.visibilityState !== 'visible' && accessibilityOn) return;
    accessibilityOn = await isAccessibilityEnabled();
  }

  function scheduleSave() {
    saveState = 'saving';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 800);
  }

  async function save() {
    try {
      // Zuerst nativ (Blocken greift sofort, auch offline), dann Backend
      await setNativeBlockConfig(settings);
      await putBlockSettings(settings);
      saveState = 'saved';
    } catch {
      saveState = 'error';
    }
  }

  function isBlocked(pkg: string): boolean {
    return settings.blocked_packages.some((a) => a.package === pkg);
  }

  function toggleApp(app: InstalledApp) {
    settings.blocked_packages = isBlocked(app.package)
      ? settings.blocked_packages.filter((a) => a.package !== app.package)
      : [...settings.blocked_packages, { package: app.package, label: app.label }];
    scheduleSave();
  }

  function removeBlocked(pkg: string) {
    settings.blocked_packages = settings.blocked_packages.filter((a) => a.package !== pkg);
    scheduleSave();
  }

  function addWindow() {
    settings.schedule_windows = [...settings.schedule_windows, { start_minute: 180, end_minute: 660 }];
    scheduleSave();
  }

  function removeWindow(i: number) {
    settings.schedule_windows = settings.schedule_windows.filter((_, idx) => idx !== i);
    scheduleSave();
  }

  function minToTime(m: number): string {
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  function timeToMin(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function setWindow(i: number, field: keyof ScheduleWindow, value: string) {
    settings.schedule_windows = settings.schedule_windows.map((w, idx) =>
      idx === i ? { ...w, [field]: timeToMin(value) } : w
    );
    scheduleSave();
  }

  $: filteredApps = installedApps.filter(
    (a) => !search || a.label.toLowerCase().includes(search.toLowerCase()) || a.package.includes(search.toLowerCase())
  );
  // Nur aus gespeicherten Settings bekannte Apps, die auf diesem Gerät nicht
  // installiert/auffindbar sind (oder Web-Ansicht ohne App-Liste)
  $: unknownBlocked = settings.blocked_packages.filter(
    (b) => !installedApps.some((a) => a.package === b.package)
  );
</script>

<div class="py-6 space-y-6">
  <h1 class="text-lg font-semibold">App-Blocker</h1>

  {#if !isNative()}
    <div class="bg-neutral-900 rounded-2xl p-5 text-sm text-neutral-400 space-y-1">
      <p>Geblockt wird nur auf dem Handy (Android-App).</p>
      <p class="text-xs text-neutral-500">Zeitfenster und Blockliste kannst du auch hier bearbeiten — sie werden mit deinem Account synchronisiert.</p>
    </div>
  {:else if !accessibilityOn}
    <div class="bg-amber-950/60 border border-amber-800 rounded-2xl p-5 space-y-3 text-sm">
      <p class="font-medium text-amber-200">⚠ Bedienungshilfe nicht aktiv</p>
      <p class="text-amber-100/80">
        Damit geblockte Apps erkannt und geschlossen werden können, muss der Task Suggester
        als Bedienungshilfe (Accessibility) aktiviert werden. Es werden keine Bildschirminhalte gelesen.
      </p>
      <p class="text-xs text-amber-100/60">
        Ab Android 13: Falls der Schalter ausgegraut ist („Eingeschränkte Einstellung"), zuerst unter
        <b>App-Info → ⋮ → Eingeschränkte Einstellungen zulassen</b> freigeben. Bei Installation per
        <code>adb install</code> entfällt dieser Schritt.
      </p>
      <button
        onclick={openAccessibilitySettings}
        class="bg-amber-700 hover:bg-amber-600 rounded-xl px-4 py-2.5 font-medium transition-colors"
      >Einstellungen öffnen</button>
    </div>
  {:else}
    <div class="bg-green-950/50 border border-green-900 rounded-2xl px-5 py-3 text-sm text-green-300">
      ✓ Blocker-Dienst aktiv
    </div>
    <p class="text-xs text-neutral-600 px-1">
      Tipp: Falls das Blocken nach längerer Zeit aufhört, hat vermutlich die Akku-Optimierung
      den Dienst beendet — den Task Suggester in den Akku-Einstellungen auf „Nicht optimieren" stellen.
    </p>
  {/if}

  {#if loaded}
    <!-- Aktivieren -->
    <label class="bg-neutral-900 rounded-2xl p-5 flex items-center justify-between cursor-pointer">
      <div>
        <p class="font-medium text-sm">Blocken aktiv</p>
        <p class="text-xs text-neutral-500">Geblockte Apps werden in den Zeitfenstern geschlossen.</p>
      </div>
      <input
        type="checkbox"
        checked={settings.enabled}
        onchange={(e) => { settings.enabled = e.currentTarget.checked; scheduleSave(); }}
        class="w-5 h-5 accent-indigo-600"
      />
    </label>

    <!-- Zeitfenster -->
    <div class="bg-neutral-900 rounded-2xl p-5 space-y-3">
      <p class="font-medium text-sm">Zeitfenster</p>
      {#if settings.schedule_windows.length === 0}
        <p class="text-xs text-neutral-500">Keine Zeitfenster — es wird nichts geblockt.</p>
      {/if}
      {#each settings.schedule_windows as w, i}
        <div class="flex items-center gap-2 text-sm">
          <input
            type="time"
            value={minToTime(w.start_minute)}
            onchange={(e) => setWindow(i, 'start_minute', e.currentTarget.value)}
            class="bg-neutral-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span class="text-neutral-500">bis</span>
          <input
            type="time"
            value={minToTime(w.end_minute)}
            onchange={(e) => setWindow(i, 'end_minute', e.currentTarget.value)}
            class="bg-neutral-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {#if w.end_minute < w.start_minute}
            <span class="text-xs text-neutral-500" title="Fenster geht über Mitternacht">🌙+1</span>
          {/if}
          <button
            onclick={() => removeWindow(i)}
            class="ml-auto text-neutral-500 hover:text-red-400 transition-colors px-2"
            aria-label="Zeitfenster entfernen"
          >✕</button>
        </div>
      {/each}
      <button
        onclick={addWindow}
        class="text-sm text-indigo-400 hover:underline"
      >+ Zeitfenster hinzufügen</button>
    </div>

    <!-- Geblockte Apps -->
    <div class="bg-neutral-900 rounded-2xl p-5 space-y-3">
      <div class="flex items-center justify-between">
        <p class="font-medium text-sm">Geblockte Apps</p>
        <span class="text-xs text-neutral-500">{settings.blocked_packages.length} geblockt</span>
      </div>

      {#if unknownBlocked.length > 0}
        <div class="space-y-1">
          {#each unknownBlocked as b}
            <div class="flex items-center gap-3 py-1.5 text-sm">
              <span class="w-6 h-6 rounded bg-neutral-800 flex items-center justify-center text-xs">📱</span>
              <span class="flex-1 truncate">{b.label || b.package}</span>
              <button
                onclick={() => removeBlocked(b.package)}
                class="text-neutral-500 hover:text-red-400 transition-colors px-2"
                aria-label="Entfernen"
              >✕</button>
            </div>
          {/each}
        </div>
      {/if}

      {#if isNative()}
        <input
          bind:value={search}
          placeholder="App suchen …"
          class="w-full bg-neutral-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <div class="max-h-96 overflow-y-auto space-y-0.5 -mx-2">
          {#each filteredApps as app (app.package)}
            <button
              onclick={() => toggleApp(app)}
              class="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-sm text-left transition-colors
                {isBlocked(app.package) ? 'bg-red-950/50 text-red-200' : 'hover:bg-neutral-800'}"
            >
              {#if app.icon}
                <img src={app.icon} alt="" class="w-6 h-6 rounded" />
              {:else}
                <span class="w-6 h-6 rounded bg-neutral-800 flex items-center justify-center text-xs">📱</span>
              {/if}
              <span class="flex-1 truncate">{app.label}</span>
              <span class="text-lg leading-none">{isBlocked(app.package) ? '⛔' : ''}</span>
            </button>
          {/each}
          {#if installedApps.length === 0}
            <p class="text-xs text-neutral-500 px-2 py-2">Lade App-Liste …</p>
          {/if}
        </div>
      {/if}
    </div>

    <p class="text-xs text-center h-4 {saveState === 'error' ? 'text-red-400' : 'text-neutral-600'}">
      {#if saveState === 'saving'}Speichere …{:else if saveState === 'saved'}Gespeichert ✓{:else if saveState === 'error'}Fehler beim Speichern{/if}
    </p>
  {/if}
</div>
