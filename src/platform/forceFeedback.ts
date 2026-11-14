/**
 * Force-feedback capability detection and a SAFE, documented-API-only test.
 *
 * Policy:
 *  - The only effect ever sent is the W3C Gamepad Extensions `playEffect()`
 *    ("dual-rumble" / "trigger-rumble"), clamped to MAX_MAGNITUDE / MAX_DURATION_MS.
 *  - No HID output or feature reports are ever sent. The G923's steering-motor
 *    protocol is not publicly documented by Logitech, and guessed bytes sent to
 *    a motorised wheel could cause sudden, uncontrolled torque.
 *  - Standard HID PID (usage page 0x0F) descriptors are only *reported* if found.
 */
import type { DescriptorSummary } from '../core/hidReportParser';
import { errorMessage, log } from '../state/logs';

export const MAX_MAGNITUDE = 0.25;
export const MAX_DURATION_MS = 400;

export interface FfbReport {
  gamepadRumble: { available: boolean; effects: string[]; detail: string };
  hidOutput: { outputReports: number; featureReports: number; pidPage: boolean; detail: string };
  steeringTorqueAccessible: boolean;
  verdict: string;
}

export function assessForceFeedback(gp: Gamepad | null, hidSummaries: DescriptorSummary[], hidSupported: boolean): FfbReport {
  const va = gp?.vibrationActuator as (GamepadHapticActuator & { effects?: string[] }) | null | undefined;
  const outputReports = hidSummaries.reduce((n, s) => n + s.outputReports.length, 0);
  const featureReports = hidSummaries.reduce((n, s) => n + s.featureReports.length, 0);
  const pidPage = hidSummaries.some((s) => s.hasPidPage);

  const rumble = {
    available: !!va,
    effects: va?.effects ?? (va ? ['dual-rumble (assumed default)'] : []),
    detail: !gp
      ? 'No gamepad selected — the Gamepad API cannot be assessed yet.'
      : va
        ? 'This gamepad exposes a vibration actuator. On a wheel this may or may not drive the motor; it is NOT steering-torque force feedback.'
        : 'The selected gamepad exposes no vibration actuator.',
  };

  let hidDetail: string;
  if (!hidSupported) hidDetail = 'WebHID unavailable — output reports cannot be inspected or sent from this browser.';
  else if (hidSummaries.length === 0) hidDetail = 'No HID device opened yet.';
  else if (pidPage) hidDetail = `Descriptor contains the standard HID PID (force-feedback) usage page. ${outputReports} output / ${featureReports} feature report(s). Sending is disabled in this build — PID effect upload needs a verified implementation and per-device testing.`;
  else hidDetail = `Descriptor declares ${outputReports} output and ${featureReports} feature report(s) but no standard PID page — force feedback uses a vendor protocol that is not publicly documented. Sending is disabled.`;

  return {
    gamepadRumble: rumble,
    hidOutput: { outputReports, featureReports, pidPage, detail: hidDetail },
    steeringTorqueAccessible: false,
    verdict:
      'Steering-torque force feedback is NOT accessible through any documented web API in this browser. ' +
      (rumble.available ? 'A low-strength rumble test is possible via the Gamepad API.' : 'No safe test API is available.'),
  };
}

let activeTimer: ReturnType<typeof setTimeout> | null = null;

export async function playSafeRumble(gp: Gamepad, strength: number, durationMs: number): Promise<string> {
  const va = gp.vibrationActuator;
  if (!va) throw new Error('No vibrationActuator on this gamepad.');
  const magnitude = Math.min(Math.max(strength, 0), MAX_MAGNITUDE);
  const duration = Math.min(Math.max(durationMs, 50), MAX_DURATION_MS);
  const effects = (va as GamepadHapticActuator & { effects?: string[] }).effects;
  const type = effects && !effects.includes('dual-rumble') && effects.includes('trigger-rumble') ? 'trigger-rumble' : 'dual-rumble';
  log('info', 'ffb', `playEffect("${type}", magnitude ${magnitude.toFixed(2)}, ${duration} ms)`);
  activeTimer = setTimeout(() => void emergencyStop('auto-timeout'), duration + 50);
  try {
    const params: Record<string, number> = { duration, startDelay: 0, strongMagnitude: magnitude, weakMagnitude: magnitude };
    if (type === 'trigger-rumble') Object.assign(params, { leftTrigger: magnitude, rightTrigger: magnitude });
    const res = await va.playEffect(type as GamepadHapticEffectType, params);
    log('success', 'ffb', `playEffect result: ${res}`);
    return String(res);
  } catch (e) {
    log('error', 'ffb', `playEffect failed: ${errorMessage(e)}`);
    throw e;
  }
}

/** Stops every actuator on every connected gamepad. Safe to call at any time. */
export async function emergencyStop(reason = 'user'): Promise<void> {
  if (activeTimer) clearTimeout(activeTimer);
  activeTimer = null;
  const pads = typeof navigator.getGamepads === 'function' ? [...(navigator.getGamepads() ?? [])] : [];
  let stopped = 0;
  for (const gp of pads) {
    const va = gp?.vibrationActuator;
    if (va && typeof va.reset === 'function') {
      try {
        await va.reset();
        stopped++;
      } catch (e) {
        log('error', 'ffb', `reset() failed on "${gp!.id}": ${errorMessage(e)}`);
      }
    }
  }
  if (reason === 'user') {
    log('warn', 'ffb', `EMERGENCY STOP: reset ${stopped} actuator(s). No HID output reports are ever sent by this app, so nothing else needs stopping.`);
  }
}
