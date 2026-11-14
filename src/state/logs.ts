import { useEffect, useState } from 'react';

export type LogLevel = 'info' | 'warn' | 'error' | 'success';
export type LogCategory = 'connection' | 'button' | 'ffb' | 'calibration' | 'system' | 'usb' | 'hid' | 'gamepad';

export interface LogEntry {
  t: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: unknown;
}

export interface RawReportEntry {
  t: number;
  device: string;
  reportId: number;
  bytes: Uint8Array;
}

/** Fixed-capacity ring buffer with change notification. */
class Ring<T> {
  private items: T[] = [];
  private subs = new Set<() => void>();
  private version = 0;
  constructor(private capacity: number) {}
  push(item: T) {
    this.items.push(item);
    if (this.items.length > this.capacity) this.items.splice(0, this.items.length - this.capacity);
    this.version++;
    this.subs.forEach((f) => f());
  }
  clear() {
    this.items = [];
    this.version++;
    this.subs.forEach((f) => f());
  }
  all(): readonly T[] {
    return this.items;
  }
  getVersion() {
    return this.version;
  }
  subscribe(fn: () => void) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }
}

export const eventLog = new Ring<LogEntry>(1000);
export const rawReportLog = new Ring<RawReportEntry>(2000);

export function log(level: LogLevel, category: LogCategory, message: string, data?: unknown) {
  eventLog.push({ t: Date.now(), level, category, message, data });
  if (level === 'error') console.error(`[${category}]`, message, data ?? '');
  else if (level === 'warn') console.warn(`[${category}]`, message, data ?? '');
}

export function errorMessage(e: unknown): string {
  if (e instanceof DOMException) return `${e.name}: ${e.message}`;
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}

/** Re-render at most `fps` times per second when the ring changes. */
export function useRing<T>(ring: { all(): readonly T[]; getVersion(): number; subscribe(f: () => void): () => void }, fps = 10) {
  const [, setV] = useState(0);
  useEffect(() => {
    let dirty = false;
    const unsub = ring.subscribe(() => {
      dirty = true;
    });
    const id = setInterval(() => {
      if (dirty) {
        dirty = false;
        setV(ring.getVersion());
      }
    }, 1000 / fps);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, [ring, fps]);
  return ring.all();
}

export interface ButtonEvent {
  t: number;
  buttonId: string;
  label: string;
  physical: string | null;
  pressed: boolean;
  value: number;
  simulated: boolean;
}
export const buttonLog = new Ring<ButtonEvent>(500);
