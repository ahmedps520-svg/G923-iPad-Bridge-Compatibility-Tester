/**
 * Calibration wizard logic (pure). Each step captures a snapshot of every raw
 * axis. Axis *assignment* is learned from which axis moved the most between
 * two snapshots — so no product-specific axis numbering is assumed.
 */
import type { DeviceProfile, PedalCalibration, RawFrame, SteeringCalibration } from './types';

export type CalibrationStepId =
  | 'center' | 'left' | 'right'
  | 'throttle_released' | 'throttle_pressed'
  | 'brake_released' | 'brake_pressed'
  | 'clutch_released' | 'clutch_pressed';

export interface CalibrationStep {
  id: CalibrationStepId;
  title: string;
  instruction: string;
  optional?: boolean;
}

export const CALIBRATION_STEPS: CalibrationStep[] = [
  { id: 'center', title: 'Centre the wheel', instruction: 'Hold the wheel straight at its centre position and keep all pedals released.' },
  { id: 'left', title: 'Turn fully left', instruction: 'Turn the wheel all the way to the left stop and hold it there.' },
  { id: 'right', title: 'Turn fully right', instruction: 'Turn the wheel all the way to the right stop and hold it there.' },
  { id: 'throttle_released', title: 'Release accelerator', instruction: 'Take your foot completely off the accelerator (right pedal).' },
  { id: 'throttle_pressed', title: 'Press accelerator fully', instruction: 'Press the accelerator all the way down and hold it.' },
  { id: 'brake_released', title: 'Release brake', instruction: 'Take your foot completely off the brake (middle pedal).' },
  { id: 'brake_pressed', title: 'Press brake fully', instruction: 'Press the brake all the way down and hold it.' },
  { id: 'clutch_released', title: 'Release clutch (optional)', instruction: 'Take your foot off the clutch (left pedal).', optional: true },
  { id: 'clutch_pressed', title: 'Press clutch fully (optional)', instruction: 'Press the clutch all the way down and hold it.', optional: true },
];

export type Snapshot = Record<string, number>;

export function snapshot(frame: RawFrame): Snapshot {
  const s: Snapshot = {};
  for (const a of frame.axes) s[a.id] = a.value;
  return s;
}

export interface AxisMovement {
  axisId: string;
  delta: number;
  /** delta as a fraction of the axis' logical range */
  relative: number;
}

/** Rank axes by how far they moved between two snapshots (relative to logical range). */
export function rankMovement(a: Snapshot, b: Snapshot, frame: RawFrame, exclude: string[] = []): AxisMovement[] {
  return frame.axes
    .filter((ax) => !exclude.includes(ax.id) && ax.id in a && ax.id in b)
    .map((ax) => {
      const delta = b[ax.id] - a[ax.id];
      const range = Math.abs(ax.max - ax.min) || 1;
      return { axisId: ax.id, delta, relative: Math.abs(delta) / range };
    })
    .sort((x, y) => y.relative - x.relative);
}

/** Minimum movement (fraction of range) for an axis to count as "detected". */
export const MIN_MOVEMENT = 0.15;

export interface CalibrationResult {
  steering?: SteeringCalibration;
  throttle?: PedalCalibration;
  brake?: PedalCalibration;
  clutch?: PedalCalibration;
  warnings: string[];
}

export function solveCalibration(snaps: Partial<Record<CalibrationStepId, Snapshot>>, frame: RawFrame): CalibrationResult {
  const warnings: string[] = [];
  const result: CalibrationResult = { warnings };
  const used: string[] = [];

  const { center, left, right } = snaps;
  if (center && left && right) {
    const l = rankMovement(center, left, frame);
    const r = rankMovement(center, right, frame);
    const best = l[0];
    if (!best || best.relative < MIN_MOVEMENT) {
      warnings.push('Steering: no axis moved enough between centre and full-left.');
    } else {
      const rMove = r.find((m) => m.axisId === best.axisId);
      if (!rMove || rMove.relative < MIN_MOVEMENT) warnings.push('Steering: the axis that moved left did not move right.');
      else if (Math.sign(rMove.delta) === Math.sign(best.delta)) warnings.push('Steering: left and right moved in the same direction — check the steps.');
      result.steering = { axisId: best.axisId, center: center[best.axisId], left: left[best.axisId], right: right[best.axisId] };
      used.push(best.axisId);
    }
  }

  const pedal = (name: 'throttle' | 'brake' | 'clutch', rel?: Snapshot, prs?: Snapshot) => {
    if (!rel || !prs) return;
    const ranked = rankMovement(rel, prs, frame, used);
    const best = ranked[0];
    if (!best || best.relative < MIN_MOVEMENT) {
      warnings.push(`${name}: no unassigned axis moved enough when pressed.`);
      return;
    }
    result[name] = { axisId: best.axisId, released: rel[best.axisId], pressed: prs[best.axisId] };
    used.push(best.axisId);
  };
  pedal('throttle', snaps.throttle_released, snaps.throttle_pressed);
  pedal('brake', snaps.brake_released, snaps.brake_pressed);
  pedal('clutch', snaps.clutch_released, snaps.clutch_pressed);
  return result;
}

export function applyCalibration(profile: DeviceProfile, r: CalibrationResult): DeviceProfile {
  return {
    ...profile,
    steering: r.steering ?? profile.steering,
    throttle: r.throttle ?? profile.throttle,
    brake: r.brake ?? profile.brake,
    clutch: r.clutch ?? profile.clutch,
    confirmed: !!(r.steering && r.throttle && r.brake),
    calibratedAt: new Date().toISOString(),
  };
}
