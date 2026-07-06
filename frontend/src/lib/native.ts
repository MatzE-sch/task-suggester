import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { BlockSettings } from './types';

export interface InstalledApp {
  package: string;
  label: string;
  icon: string; // data-URI (PNG) oder ''
}

interface AppBlockerPlugin {
  getInstalledApps(): Promise<{ apps: InstalledApp[] }>;
  getBlockConfig(): Promise<BlockSettings>;
  setBlockConfig(config: BlockSettings): Promise<void>;
  isAccessibilityServiceEnabled(): Promise<{ enabled: boolean }>;
  openAccessibilitySettings(): Promise<void>;
  addListener(
    eventName: 'blockedAppOpened',
    listener: (data: { package: string; label: string }) => void
  ): Promise<PluginListenerHandle>;
}

const AppBlocker = registerPlugin<AppBlockerPlugin>('AppBlocker');

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export async function getInstalledApps(): Promise<InstalledApp[]> {
  if (!isNative()) return [];
  return (await AppBlocker.getInstalledApps()).apps;
}

/** Schreibt die Block-Konfiguration in den nativen Speicher (SharedPreferences),
 *  den der AccessibilityService offline liest. */
export async function setNativeBlockConfig(config: BlockSettings): Promise<void> {
  if (!isNative()) return;
  await AppBlocker.setBlockConfig(config);
}

export async function getNativeBlockConfig(): Promise<BlockSettings | null> {
  if (!isNative()) return null;
  return AppBlocker.getBlockConfig();
}

export async function isAccessibilityEnabled(): Promise<boolean> {
  if (!isNative()) return false;
  return (await AppBlocker.isAccessibilityServiceEnabled()).enabled;
}

export async function openAccessibilitySettings(): Promise<void> {
  if (!isNative()) return;
  await AppBlocker.openAccessibilitySettings();
}

export async function onBlockedAppOpened(
  handler: (data: { package: string; label: string }) => void
): Promise<PluginListenerHandle | null> {
  if (!isNative()) return null;
  return AppBlocker.addListener('blockedAppOpened', handler);
}
