/** Local persistence of per-device calibration profiles (localStorage, no backend). */
import { DEFAULT_SETTINGS, type DeviceProfile } from './types';

const KEY = 'g923bridge.profiles.v1';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storage(): KeyValueStorage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // private mode / blocked storage
  }
}

export function loadProfiles(store: KeyValueStorage | null = storage()): Record<string, DeviceProfile> {
  if (!store) return {};
  try {
    const parsed = JSON.parse(store.getItem(KEY) ?? '{}') as Record<string, DeviceProfile>;
    for (const p of Object.values(parsed)) p.settings = { ...DEFAULT_SETTINGS, ...p.settings };
    return parsed;
  } catch {
    return {};
  }
}

export function saveProfiles(profiles: Record<string, DeviceProfile>, store: KeyValueStorage | null = storage()): boolean {
  if (!store) return false;
  try {
    store.setItem(KEY, JSON.stringify(profiles));
    return true;
  } catch {
    return false;
  }
}

export function clearProfiles(store: KeyValueStorage | null = storage()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
