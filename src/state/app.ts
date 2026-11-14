/**
 * Application hub: owns the input sources, the active profile and the live
 * translated state. Hardware status is derived ONLY from real sources —
 * simulation never changes it.
 */
import { useEffect, useState } from 'react';
import { defaultProfile, translate } from '../core/translation';
import { loadProfiles, saveProfiles } from '../core/profileStore';
import { PHYSICAL_BUTTON_LABELS, type DeviceProfile, type RawFrame, type TranslatedState } from '../core/types';
import { detectCapabilities, type CapabilityReport } from '../platform/capabilities';
import { GamepadSource, describeGamepad, type GamepadInfo } from '../platform/gamepadSource';
import { HidSource, type HidDeviceInfo } from '../platform/hidSource';
import { SimulationSource } from '../platform/simulationSource';
import { inspectUsb, type UsbDeviceInfo } from '../platform/usbInspector';
import { buttonLog, errorMessage, log } from './logs';
import { createStore } from './store';

export type HardwareStatus = 'connected' | 'disconnected' | 'unsupported';

export interface AppState {
  caps: CapabilityReport;
  hidDevices: HidDeviceInfo[];
  activeHidKey: string | null;
  usbDevices: UsbDeviceInfo[];
  gamepads: GamepadInfo[];
  selectedGamepad: number | null;
  preferredSource: 'auto' | 'webhid' | 'gamepad';
  simulation: boolean;
  profiles: Record<string, DeviceProfile>;
  stats: { hardwareFrames: number; firstHardwareFrameAt: number | null; lastHardwareFrameAt: number | null; hz: number };
  /** Per device key: raw button ids ever seen pressed / axes ever seen moving. */
  seenButtons: Record<string, string[]>;
  movedAxes: Record<string, string[]>;
}

export const app = createStore<AppState>({
  caps: detectCapabilities(),
  hidDevices: [],
  activeHidKey: null,
  usbDevices: [],
  gamepads: [],
  selectedGamepad: null,
  preferredSource: 'auto',
  simulation: false,
  profiles: loadProfiles(),
  stats: { hardwareFrames: 0, firstHardwareFrameAt: null, lastHardwareFrameAt: null, hz: 0 },
  seenButtons: {},
  movedAxes: {},
});

/* ------------------------------------------------------------------ live bus */

interface Live {
  hwFrame: RawFrame | null;
  hwState: TranslatedState | null;
  simFrame: RawFrame | null;
  simState: TranslatedState | null;
  version: number;
}
const live: Live = { hwFrame: null, hwState: null, simFrame: null, simState: null, version: 0 };
const firstValues = new Map<string, Map<string, number>>();
const prevButtons = new Map<string, Map<string, boolean>>();
let frameCounter = 0;

export function ensureProfile(frame: RawFrame): DeviceProfile {
  const existing = app.get().profiles[frame.deviceKey];
  if (existing) return existing;
  const p = defaultProfile(frame);
  app.set((s) => ({ profiles: { ...s.profiles, [frame.deviceKey]: p } }));
  return p;
}

export function updateProfile(key: string, update: (p: DeviceProfile) => DeviceProfile) {
  const cur = app.get().profiles[key];
  if (!cur) return;
  const next = { ...app.get().profiles, [key]: update(cur) };
  app.set({ profiles: next });
  if (!saveProfiles(next)) log('warn', 'calibration', 'Could not save profile to local storage.');
}

export function resetProfile(key: string) {
  const frame = live.hwFrame?.deviceKey === key ? live.hwFrame : live.simFrame?.deviceKey === key ? live.simFrame : null;
  const next = { ...app.get().profiles };
  delete next[key];
  if (frame) next[key] = defaultProfile(frame);
  app.set({ profiles: next });
  saveProfiles(next);
  log('info', 'calibration', `Profile reset for ${key}.`);
}

function trackDiscovery(frame: RawFrame) {
  const key = frame.deviceKey;
  let first = firstValues.get(key);
  if (!first) {
    first = new Map(frame.axes.map((a) => [a.id, a.value]));
    firstValues.set(key, first);
  }
  const moved = new Set(app.get().movedAxes[key] ?? []);
  let changed = false;
  for (const a of frame.axes) {
    const f = first.get(a.id);
    if (f === undefined) first.set(a.id, a.value);
    else if (!moved.has(a.id) && Math.abs(a.value - f) / (Math.abs(a.max - a.min) || 1) > 0.05) {
      moved.add(a.id);
      changed = true;
    }
  }
  const seen = new Set(app.get().seenButtons[key] ?? []);
  for (const b of frame.buttons) {
    if (b.pressed && !seen.has(b.id)) {
      seen.add(b.id);
      changed = true;
    }
  }
  if (changed) {
    app.set((s) => ({
      movedAxes: { ...s.movedAxes, [key]: [...moved] },
      seenButtons: { ...s.seenButtons, [key]: [...seen] },
    }));
  }
}

function logButtonEdges(frame: RawFrame, profile: DeviceProfile) {
  let prev = prevButtons.get(frame.deviceKey);
  if (!prev) {
    prev = new Map();
    prevButtons.set(frame.deviceKey, prev);
  }
  for (const b of frame.buttons) {
    const was = prev.get(b.id) ?? false;
    if (was !== b.pressed) {
      const phys = profile.buttonMap[b.id];
      buttonLog.push({
        t: Date.now(), buttonId: b.id, label: b.label, physical: phys ? PHYSICAL_BUTTON_LABELS[phys] : null,
        pressed: b.pressed, value: b.value, simulated: frame.simulated,
      });
    }
    prev.set(b.id, b.pressed);
  }
}

function onHardwareFrame(frame: RawFrame) {
  const s = app.get();
  // Respect source preference: ignore gamepad frames while a HID device is the active source.
  const hidActive = !!s.activeHidKey && hid.isOpen(s.activeHidKey);
  if (frame.source === 'gamepad' && (s.preferredSource === 'webhid' || (s.preferredSource === 'auto' && hidActive))) return;
  if (frame.source === 'webhid' && s.preferredSource === 'gamepad') return;

  const profile = ensureProfile(frame);
  const prevState = live.hwFrame?.deviceKey === frame.deviceKey ? live.hwState : null;
  live.hwFrame = frame;
  live.hwState = translate(frame, profile, prevState);
  live.version++;
  frameCounter++;
  logButtonEdges(frame, profile);
  trackDiscovery(frame);
  if (s.stats.firstHardwareFrameAt === null) {
    log('success', 'system', `First REAL input frame received via ${frame.source} from ${frame.deviceKey}.`);
    app.set((st) => ({ stats: { ...st.stats, firstHardwareFrameAt: Date.now() } }));
  }
}

function onSimFrame(frame: RawFrame) {
  const profile = ensureProfile(frame);
  live.simState = translate(frame, profile, live.simState);
  live.simFrame = frame;
  live.version++;
  logButtonEdges(frame, profile);
}

/* ------------------------------------------------------------------ sources */

function refreshDevices() {
  app.set({
    hidDevices: hid.devices(),
    activeHidKey: hid.activeKey,
    gamepads: gamepad.list(),
    selectedGamepad: gamepad.selectedIndex,
  });
}

export const hid = new HidSource(onHardwareFrame, refreshDevices);
export const gamepad = new GamepadSource(onHardwareFrame, refreshDevices);
export const simulation = new SimulationSource(onSimFrame);

let initialized = false;
export async function initialize() {
  if (initialized) return;
  initialized = true;
  const caps = app.get().caps;
  log('info', 'system', `Environment: ${caps.env.browser} · ${caps.env.engine} · ${caps.env.osVersion} · secure context: ${caps.env.secureContext}`);
  for (const c of caps.caps) log(c.status === 'available' ? 'success' : c.status === 'unknown' ? 'info' : 'warn', 'system', `${c.name}: ${c.status.toUpperCase()} — ${c.detail}`);
  gamepad.init();
  await hid.init();
  refreshDevices();
  setInterval(() => {
    const st = app.get().stats;
    app.set({
      stats: { ...st, hardwareFrames: st.hardwareFrames + frameCounter, hz: frameCounter, lastHardwareFrameAt: frameCounter ? Date.now() : st.lastHardwareFrameAt },
      gamepads: gamepad.list(),
      caps: detectCapabilities(),
    });
    frameCounter = 0;
  }, 1000);
}

export async function connectHid(anyDevice = false) {
  try {
    await hid.request(anyDevice);
  } catch (e) {
    log('error', 'hid', errorMessage(e));
  }
  refreshDevices();
}

export async function connectUsb(anyDevice = false) {
  try {
    const info = await inspectUsb(anyDevice);
    if (info) app.set((s) => ({ usbDevices: [...s.usbDevices.filter((d) => !(d.vendorId === info.vendorId && d.productId === info.productId)), info] }));
  } catch (e) {
    log('error', 'usb', errorMessage(e));
  }
}

export function selectGamepad(index: number) {
  gamepad.selectedIndex = index;
  refreshDevices();
}

export function setPreferredSource(p: AppState['preferredSource']) {
  app.set({ preferredSource: p });
}

export function setSimulation(on: boolean) {
  if (on) simulation.start();
  else {
    simulation.stop();
    live.simFrame = null;
    live.simState = null;
  }
  app.set({ simulation: on });
  log('info', 'system', on ? 'SIMULATION demo started (synthetic data, not hardware).' : 'Simulation stopped.');
}

/* ------------------------------------------------------------------ status */

export interface StatusSummary {
  status: HardwareStatus;
  deviceName: string | null;
  vendorId: string | null;
  productId: string | null;
  method: string;
  reason: string;
}

export function hardwareStatus(s: AppState): StatusSummary {
  if (s.activeHidKey && hid.isOpen(s.activeHidKey) && s.preferredSource !== 'gamepad') {
    const d = s.hidDevices.find((x) => x.key === s.activeHidKey);
    return {
      status: 'connected',
      deviceName: d?.productName ?? null,
      vendorId: d ? `0x${d.vendorId.toString(16).toUpperCase().padStart(4, '0')}` : null,
      productId: d ? `0x${d.productId.toString(16).toUpperCase().padStart(4, '0')}` : null,
      method: 'USB → WebHID (raw HID input reports)',
      reason: d?.isLogitech ? 'Logitech device opened via WebHID.' : 'Non-Logitech HID device opened (investigation mode).',
    };
  }
  const gp = s.gamepads.find((g) => g.index === s.selectedGamepad && g.connected);
  if (gp && s.preferredSource !== 'webhid') {
    return {
      status: 'connected',
      deviceName: gp.id,
      vendorId: gp.vendorId,
      productId: gp.productId,
      method: `Gamepad API (mapping: ${gp.mapping})`,
      reason: gp.looksLikeWheel ? 'Browser reports a wheel-like gamepad.' : 'A gamepad is connected — verify it is the G923.',
    };
  }
  if (s.activeHidKey && !hid.isOpen(s.activeHidKey)) {
    return { status: 'disconnected', deviceName: null, vendorId: null, productId: null, method: 'WebHID', reason: `Previously used device ${s.activeHidKey} is disconnected — waiting for it to reconnect.` };
  }
  if (!s.caps.rawDeviceAccessPossible && s.gamepads.length === 0) {
    const missing = [
      !s.caps.hid && 'WebHID',
      !s.caps.usb && 'WebUSB',
    ].filter(Boolean).join(' and ');
    return {
      status: 'unsupported',
      deviceName: null, vendorId: null, productId: null,
      method: s.caps.gamepad ? 'Gamepad API only' : 'none',
      reason: `${missing} ${missing.includes('and') ? 'are' : 'is'} not available in this browser, so the G923 cannot be opened as a USB/HID device. ${s.caps.gamepad ? 'The Gamepad API is present but reports no controller (press a wheel button to be sure).' : 'The Gamepad API is also unavailable.'}`,
    };
  }
  return {
    status: 'disconnected',
    deviceName: null, vendorId: null, productId: null,
    method: s.caps.hid ? 'WebHID available' : s.caps.gamepad ? 'Gamepad API' : 'none',
    reason: s.caps.hid ? 'No HID device opened. Tap "Connect via WebHID" and choose the wheel.' : 'No gamepad reported. Press a wheel button.',
  };
}

/* ------------------------------------------------------------------ hooks */

export interface LiveView {
  frame: RawFrame | null;
  state: TranslatedState | null;
  profile: DeviceProfile | null;
  simulated: boolean;
}

export function getLive(): LiveView {
  const sim = app.get().simulation && live.simFrame;
  const frame = sim ? live.simFrame : live.hwFrame;
  const state = sim ? live.simState : live.hwState;
  return { frame, state, profile: frame ? app.get().profiles[frame.deviceKey] ?? null : null, simulated: !!sim };
}

export function getHardwareLive(): LiveView {
  return { frame: live.hwFrame, state: live.hwState, profile: live.hwFrame ? app.get().profiles[live.hwFrame.deviceKey] ?? null : null, simulated: false };
}

/** Re-render on animation frames while live data changes. */
export function useLive(hardwareOnly = false): LiveView {
  const [, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    let seen = -1;
    const loop = () => {
      if (live.version !== seen) {
        seen = live.version;
        setV(seen);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return hardwareOnly ? getHardwareLive() : getLive();
}

export { describeGamepad };
