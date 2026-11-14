/**
 * Input translation layer: raw device values -> normalized racing controls.
 *
 * Pure functions only. A native Swift app or a microcontroller bridge can
 * implement the same maths; see docs/ARCHITECTURE.md.
 */
import { SIM_ACCELERATOR, SIM_BRAKE, SIM_CLUTCH, SIM_STEERING, USAGE_PAGE } from './hidUsages';
import {
  DEFAULT_SETTINGS, type DeviceProfile, type PedalCalibration, type PhysicalButtonId, type ProcessingSettings,
  type RawAxis, type RawFrame, type SteeringCalibration, type TranslatedState,
} from './types';

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Map a steering value to -1..+1 using a 3-point calibration (asymmetric safe). */
export function normalizeSteering(value: number, cal: SteeringCalibration, s: ProcessingSettings): number {
  const { left, center, right } = cal;
  const d = value - center;
  const rightDir = Math.sign(right - center) || 1;
  // Works whether "left" is numerically below or above centre; asymmetric spans allowed.
  let n: number;
  if (d * rightDir >= 0) n = right === center ? 0 : d / (right - center);
  else n = left === center ? 0 : -(d / (left - center));
  n = clamp(n, -1, 1);
  const dz = clamp(s.steeringDeadzone, 0, 0.5);
  if (dz > 0) {
    const a = Math.abs(n);
    n = a <= dz ? 0 : Math.sign(n) * ((a - dz) / (1 - dz));
  }
  return s.invertSteering ? -n : n;
}

/** Map a pedal value to 0..1. Handles inverted pedals (released = max). */
export function normalizePedal(value: number, cal: PedalCalibration, s: ProcessingSettings): number {
  const span = cal.pressed - cal.released;
  if (span === 0) return 0;
  let n = clamp((value - cal.released) / span, 0, 1);
  const dz = clamp(s.pedalDeadzone, 0, 0.5);
  const sat = clamp(s.pedalSaturation, 0, 0.5);
  const usable = 1 - dz - sat;
  n = usable <= 0 ? (n > dz ? 1 : 0) : clamp((n - dz) / usable, 0, 1);
  return n;
}

export function smooth(prev: number | null, next: number | null, alpha: number): number | null {
  if (next === null) return null;
  if (prev === null || alpha <= 0) return next;
  const a = clamp(alpha, 0, 0.98);
  return prev * a + next * (1 - a);
}

/**
 * Best-effort initial mapping from descriptor usages. Marked `confirmed: false`
 * so the UI shows it as a guess until the user runs calibration.
 * - HID Simulation Controls usages (Steering/Accelerator/Brake/Clutch) are standard and used if present.
 * - Otherwise steering defaults to Generic Desktop X; pedals stay unassigned.
 */
export function defaultProfile(frame: RawFrame): DeviceProfile {
  const byUsage = (page: number, id: number) =>
    frame.axes.find((a) => a.id.includes(`:${page.toString(16)}:${id.toString(16)}`));
  const range = (a: RawAxis): SteeringCalibration => ({
    axisId: a.id, left: a.min, right: a.max, center: (a.min + a.max) / 2,
  });
  const pedal = (a: RawAxis | undefined): PedalCalibration | undefined =>
    a ? { axisId: a.id, released: a.min, pressed: a.max } : undefined;

  let steerAxis = byUsage(USAGE_PAGE.SIMULATION, SIM_STEERING) ?? byUsage(USAGE_PAGE.GENERIC_DESKTOP, 0x30);
  if (!steerAxis && frame.source === 'gamepad') steerAxis = frame.axes[0];
  if (!steerAxis && frame.source === 'simulation') steerAxis = frame.axes[0];

  const profile: DeviceProfile = {
    deviceKey: frame.deviceKey,
    steering: steerAxis ? range(steerAxis) : undefined,
    throttle: pedal(byUsage(USAGE_PAGE.SIMULATION, SIM_ACCELERATOR)),
    brake: pedal(byUsage(USAGE_PAGE.SIMULATION, SIM_BRAKE)),
    clutch: pedal(byUsage(USAGE_PAGE.SIMULATION, SIM_CLUTCH)),
    buttonMap: {},
    settings: { ...DEFAULT_SETTINGS },
    confirmed: false,
  };
  if (frame.simulated) {
    // The demo source declares its own semantic axes.
    const sim = (name: string) => frame.axes.find((a) => a.id === `sim:${name}`);
    profile.throttle = pedal(sim('throttle'));
    profile.brake = pedal(sim('brake'));
    profile.clutch = pedal(sim('clutch'));
  }
  return profile;
}

export function translate(frame: RawFrame, profile: DeviceProfile, prev: TranslatedState | null): TranslatedState {
  const s = profile.settings;
  const axis = (id?: string) => (id ? frame.axes.find((a) => a.id === id) : undefined);
  const st = profile.steering && axis(profile.steering.axisId);
  const th = profile.throttle && axis(profile.throttle.axisId);
  const br = profile.brake && axis(profile.brake.axisId);
  const cl = profile.clutch && axis(profile.clutch.axisId);

  const buttons: Partial<Record<PhysicalButtonId, boolean>> = {};
  const unmappedPressed: string[] = [];
  for (const b of frame.buttons) {
    const phys = profile.buttonMap[b.id];
    if (phys) buttons[phys] = (buttons[phys] ?? false) || b.pressed;
    else if (b.pressed) unmappedPressed.push(b.id);
  }
  // The first hat switch drives the D-pad (standard HID convention for a hat);
  // the Button Tester shows this so the user can confirm it on real hardware.
  const hat = frame.hats[0];
  if (hat) {
    for (const [dir, phys] of HAT_DIRECTIONS) {
      if (hatPressed(hat.angle, dir)) buttons[phys] = true;
    }
  }

  return {
    steering: smooth(prev?.steering ?? null, st && profile.steering ? normalizeSteering(st.value, profile.steering, s) : null, s.smoothing),
    throttle: smooth(prev?.throttle ?? null, th && profile.throttle ? normalizePedal(th.value, profile.throttle, s) : null, s.smoothing),
    brake: smooth(prev?.brake ?? null, br && profile.brake ? normalizePedal(br.value, profile.brake, s) : null, s.smoothing),
    clutch: smooth(prev?.clutch ?? null, cl && profile.clutch ? normalizePedal(cl.value, profile.clutch, s) : null, s.smoothing),
    buttons,
    unmappedPressed,
    timestamp: frame.timestamp,
    simulated: frame.simulated,
  };
}

const HAT_DIRECTIONS: [string, PhysicalButtonId][] = [
  ['up', 'dpad_up'], ['right', 'dpad_right'], ['down', 'dpad_down'], ['left', 'dpad_left'],
];
const HAT_CENTERS: Record<string, number> = { up: 0, right: 90, down: 180, left: 270 };

/** A hat direction is "pressed" if the hat angle is within 67.5° (covers diagonals). */
export function hatPressed(angle: number | null, dir: string): boolean {
  if (angle === null) return false;
  const c = HAT_CENTERS[dir];
  const d = Math.abs((((angle - c) % 360) + 540) % 360 - 180);
  return d < 67.5;
}

/**
 * Translate into the W3C "standard gamepad" layout — the shape an external
 * bridge would need to present to iPadOS as a supported controller
 * (steering -> left stick X, throttle -> right trigger, brake -> left trigger).
 * This is a data format only; a web page cannot register a virtual controller.
 */
export interface VirtualGamepadReport {
  leftStickX: number;
  leftStickY: number;
  rightStickX: number;
  rightStickY: number;
  leftTrigger: number;
  rightTrigger: number;
  /** Indexed like https://w3c.github.io/gamepad/#remapping */
  buttons: boolean[];
}

const STANDARD_INDEX: Partial<Record<PhysicalButtonId, number>> = {
  cross: 0, circle: 1, square: 2, triangle: 3,
  paddle_left: 4, paddle_right: 5, // shoulder buttons
  share: 8, options: 9, l3: 10, r3: 11,
  dpad_up: 12, dpad_down: 13, dpad_left: 14, dpad_right: 15, ps: 16,
};

export function toVirtualGamepad(state: TranslatedState): VirtualGamepadReport {
  const buttons = new Array<boolean>(17).fill(false);
  for (const [phys, idx] of Object.entries(STANDARD_INDEX)) {
    if (state.buttons[phys as PhysicalButtonId]) buttons[idx!] = true;
  }
  // Clutch has no standard-gamepad equivalent; exposed on right stick Y as a convention.
  return {
    leftStickX: state.steering ?? 0,
    leftStickY: 0,
    rightStickX: 0,
    rightStickY: state.clutch ?? 0,
    leftTrigger: state.brake ?? 0,
    rightTrigger: state.throttle ?? 0,
    buttons,
  };
}
