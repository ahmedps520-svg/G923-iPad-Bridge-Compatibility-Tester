/** Gamepad API input source (polling). Reports only what the browser exposes. */
import type { RawFrame } from '../core/types';
import { log } from '../state/logs';

export interface GamepadInfo {
  index: number;
  id: string;
  mapping: string;
  axes: number;
  buttons: number;
  connected: boolean;
  vendorId: string | null;
  productId: string | null;
  looksLikeWheel: boolean;
  hasVibration: boolean;
  vibrationEffects: string[];
  hapticActuators: number;
}

/** Chromium/Firefox embed "Vendor: 046d Product: xxxx" or "046d-xxxx-" in the id; WebKit does not. */
export function parseGamepadIds(id: string): { vendorId: string | null; productId: string | null } {
  const m = id.match(/Vendor:\s*([0-9a-f]{4})\s*Product:\s*([0-9a-f]{4})/i) ?? id.match(/^([0-9a-f]{4})-([0-9a-f]{4})-/i);
  return m ? { vendorId: `0x${m[1].toUpperCase()}`, productId: `0x${m[2].toUpperCase()}` } : { vendorId: null, productId: null };
}

export function gamepadDeviceKey(gp: { id: string }): string {
  return `gamepad:${gp.id}`;
}

export function describeGamepad(gp: Gamepad): GamepadInfo {
  const ids = parseGamepadIds(gp.id);
  const va = gp.vibrationActuator as (GamepadHapticActuator & { effects?: string[] }) | null | undefined;
  const haptics = (gp as Gamepad & { hapticActuators?: unknown[] }).hapticActuators;
  return {
    index: gp.index,
    id: gp.id,
    mapping: gp.mapping || '(none — non-standard layout)',
    axes: gp.axes.length,
    buttons: gp.buttons.length,
    connected: gp.connected,
    ...ids,
    looksLikeWheel: /wheel|g923|g29|g920|racing|driving/i.test(gp.id) || ids.vendorId === '0x046D',
    hasVibration: !!va,
    vibrationEffects: va?.effects ?? (va ? ['(effect list not exposed)'] : []),
    hapticActuators: Array.isArray(haptics) ? haptics.length : 0,
  };
}

export class GamepadSource {
  selectedIndex: number | null = null;
  private raf = 0;
  private lastTimestamp = new Map<number, number>();

  constructor(
    private onFrame: (f: RawFrame) => void,
    private onChange: () => void,
  ) {}

  get supported() {
    return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
  }

  init() {
    if (!this.supported) return;
    window.addEventListener('gamepadconnected', (e) => {
      const gp = (e as GamepadEvent).gamepad;
      log('success', 'gamepad', `gamepadconnected: "${gp.id}" (index ${gp.index}, mapping "${gp.mapping || 'none'}", ${gp.axes.length} axes, ${gp.buttons.length} buttons).`);
      if (this.selectedIndex === null) {
        const wheel = this.list().find((g) => g.looksLikeWheel);
        this.selectedIndex = wheel?.index ?? gp.index;
      }
      this.onChange();
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      const gp = (e as GamepadEvent).gamepad;
      log('warn', 'gamepad', `gamepaddisconnected: "${gp.id}" (index ${gp.index}).`);
      this.onChange();
    });
    const loop = () => {
      this.poll();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  pads(): Gamepad[] {
    if (!this.supported) return [];
    return [...(navigator.getGamepads() ?? [])].filter((g): g is Gamepad => !!g);
  }

  list(): GamepadInfo[] {
    return this.pads().map(describeGamepad);
  }

  selected(): Gamepad | null {
    return this.pads().find((g) => g.index === this.selectedIndex) ?? null;
  }

  private poll() {
    const gp = this.selected();
    if (!gp) return;
    if (this.lastTimestamp.get(gp.index) === gp.timestamp) return;
    this.lastTimestamp.set(gp.index, gp.timestamp);
    this.onFrame({
      source: 'gamepad',
      deviceKey: gamepadDeviceKey(gp),
      timestamp: performance.now(),
      axes: gp.axes.map((v, i) => ({ id: `gp:axis:${i}`, label: `Axis ${i}`, value: v, min: -1, max: 1 })),
      buttons: gp.buttons.map((b, i) => ({ id: `gp:btn:${i}`, index: i, label: `Button ${i}`, pressed: b.pressed, value: b.value })),
      hats: [],
      simulated: false,
    });
  }
}
