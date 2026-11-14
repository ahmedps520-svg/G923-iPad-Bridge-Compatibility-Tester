/**
 * Platform-agnostic input model.
 *
 * Everything in `src/core` is deliberately free of DOM / browser API
 * dependencies so it can be reused (or ported line-for-line to Swift) by a
 * native iPadOS app, a DriverKit companion, or an external hardware bridge.
 */

export type SourceKind = 'webhid' | 'gamepad' | 'simulation';

/** A single analog value exactly as reported by the device (not normalized). */
export interface RawAxis {
  /** Stable identifier, unique within a device. */
  id: string;
  /** Human-readable label derived from the descriptor (e.g. "Generic Desktop / X"). */
  label: string;
  value: number;
  /** Logical range reported by the device descriptor / API. */
  min: number;
  max: number;
}

export interface RawButton {
  id: string;
  /** 1-based button number from the HID Button usage page, or 0-based Gamepad index. */
  index: number;
  label: string;
  pressed: boolean;
  /** 0..1 (analog buttons via Gamepad API may be fractional). */
  value: number;
}

export interface RawHat {
  id: string;
  label: string;
  value: number;
  /** Degrees clockwise from "up", or null when centred / null-state. */
  angle: number | null;
}

/** One complete snapshot of everything a device is currently reporting. */
export interface RawFrame {
  source: SourceKind;
  /** Identifies the physical device so calibration can be stored per device. */
  deviceKey: string;
  timestamp: number;
  axes: RawAxis[];
  buttons: RawButton[];
  hats: RawHat[];
  /** True ONLY for the clearly-labelled demonstration source. */
  simulated: boolean;
}

/** Logical controls on the G923 PlayStation edition (physical layout, not HID indices). */
export const PHYSICAL_BUTTONS = [
  'dpad_up', 'dpad_down', 'dpad_left', 'dpad_right',
  'cross', 'circle', 'square', 'triangle',
  'r2', 'l2', 'r3', 'l3',
  'share', 'options', 'ps',
  'plus', 'minus', 'dial_cw', 'dial_ccw', 'dial_enter',
  'paddle_right', 'paddle_left',
] as const;
export type PhysicalButtonId = (typeof PHYSICAL_BUTTONS)[number];

export const PHYSICAL_BUTTON_LABELS: Record<PhysicalButtonId, string> = {
  dpad_up: 'D-pad Up', dpad_down: 'D-pad Down', dpad_left: 'D-pad Left', dpad_right: 'D-pad Right',
  cross: 'Cross ✕', circle: 'Circle ○', square: 'Square □', triangle: 'Triangle △',
  r2: 'R2', l2: 'L2', r3: 'R3', l3: 'L3',
  share: 'Share', options: 'Options', ps: 'PS',
  plus: 'Plus +', minus: 'Minus −', dial_cw: 'Dial ↻', dial_ccw: 'Dial ↺', dial_enter: 'Dial Enter',
  paddle_right: 'Right Paddle', paddle_left: 'Left Paddle',
};

export interface SteeringCalibration {
  axisId: string;
  left: number;
  center: number;
  right: number;
}

export interface PedalCalibration {
  axisId: string;
  released: number;
  pressed: number;
}

export interface ProcessingSettings {
  /** Fraction of half-travel around centre treated as zero (0..0.3). */
  steeringDeadzone: number;
  /** Fraction of travel ignored at the released end of each pedal (0..0.3). */
  pedalDeadzone: number;
  /** Fraction of travel at the pressed end that saturates to 100% (0..0.3). */
  pedalSaturation: number;
  /** Exponential smoothing factor, 0 = none, 0.9 = heavy. */
  smoothing: number;
  invertSteering: boolean;
  /** Only used for drawing the wheel graphic. */
  rotationDegrees: number;
}

export interface DeviceProfile {
  deviceKey: string;
  steering?: SteeringCalibration;
  throttle?: PedalCalibration;
  brake?: PedalCalibration;
  clutch?: PedalCalibration;
  /** raw button id -> physical control, learned by the user. */
  buttonMap: Record<string, PhysicalButtonId>;
  settings: ProcessingSettings;
  /** False while mappings are heuristic guesses that have not been calibrated. */
  confirmed: boolean;
  calibratedAt?: string;
}

export interface TranslatedState {
  /** -1 (full left) .. +1 (full right), or null when no axis is assigned. */
  steering: number | null;
  throttle: number | null;
  brake: number | null;
  clutch: number | null;
  buttons: Partial<Record<PhysicalButtonId, boolean>>;
  /** Raw ids of pressed buttons that have no physical mapping yet. */
  unmappedPressed: string[];
  timestamp: number;
  simulated: boolean;
}

export const DEFAULT_SETTINGS: ProcessingSettings = {
  steeringDeadzone: 0.0,
  pedalDeadzone: 0.02,
  pedalSaturation: 0.02,
  smoothing: 0,
  invertSteering: false,
  rotationDegrees: 900,
};
