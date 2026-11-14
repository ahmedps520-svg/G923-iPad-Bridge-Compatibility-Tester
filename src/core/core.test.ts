/**
 * Unit tests for the platform-agnostic core.
 *
 * NOTE: the descriptor below is a GENERIC, hand-written test fixture built
 * from standard HID usages. It is NOT the G923's real descriptor and is not
 * used anywhere in the app — the app always reads the descriptor from the
 * connected device.
 */
import { describe, expect, it } from 'vitest';
import { CALIBRATION_STEPS, applyCalibration, snapshot, solveCalibration } from './calibration';
import { buildInputLayouts, decodeReport, readBits, readField, summarizeDescriptor, validateReportLength, type DescriptorCollection } from './hidReportParser';
import { defaultProfile, hatPressed, normalizePedal, normalizeSteering, toVirtualGamepad, translate } from './translation';
import { DEFAULT_SETTINGS, type RawFrame } from './types';

const GD = (u: number) => (0x01 << 16) | u;
const BTN = (u: number) => (0x09 << 16) | u;

// Report 1: 16-bit X (steering), 8-bit Y, 8-bit Z, 4-bit hat + 4-bit padding, 12 buttons + 4-bit padding.
const fixture: DescriptorCollection[] = [
  {
    usagePage: 0x01,
    usage: 0x04,
    type: 1,
    children: [],
    inputReports: [
      {
        reportId: 1,
        items: [
          { usages: [GD(0x30)], reportSize: 16, reportCount: 1, logicalMinimum: 0, logicalMaximum: 65535, isAbsolute: true },
          { usages: [GD(0x31), GD(0x32)], reportSize: 8, reportCount: 2, logicalMinimum: 0, logicalMaximum: 255, isAbsolute: true },
          { usages: [GD(0x39)], reportSize: 4, reportCount: 1, logicalMinimum: 0, logicalMaximum: 7, hasNull: true },
          { isConstant: true, reportSize: 4, reportCount: 1 },
          { isRange: true, usageMinimum: BTN(1), usageMaximum: BTN(12), reportSize: 1, reportCount: 12, logicalMinimum: 0, logicalMaximum: 1 },
          { isConstant: true, reportSize: 4, reportCount: 1 },
        ],
      },
    ],
    outputReports: [{ reportId: 3, items: [{ usages: [(0xff00 << 16) | 1], reportSize: 8, reportCount: 7 }] }],
    featureReports: [],
  },
];

describe('bit reading', () => {
  it('reads little-endian bit fields', () => {
    const b = new Uint8Array([0b1010_1100, 0xff]);
    expect(readBits(b, 2, 3)).toBe(0b011);
    expect(readBits(b, 0, 16)).toBe(0xffac);
    expect(readBits(b, 12, 8)).toBeNaN();
  });
  it('sign-extends when logical minimum is negative', () => {
    const f = { bitOffset: 0, bitSize: 8, signed: true } as Parameters<typeof readField>[1];
    expect(readField(new Uint8Array([0xff]), f)).toBe(-1);
    expect(readField(new Uint8Array([0x7f]), f)).toBe(127);
  });
});

describe('descriptor layout', () => {
  const layouts = buildInputLayouts(fixture);
  const l = layouts.get(1)!;
  it('computes offsets including padding', () => {
    expect(l.totalBits).toBe(16 + 16 + 8 + 16);
    const btn1 = l.fields.find((f) => f.kind === 'button' && f.usageId === 1)!;
    expect(btn1.bitOffset).toBe(40);
    expect(l.fields.find((f) => f.kind === 'hat')!.bitOffset).toBe(32);
  });
  it('validates report length', () => {
    expect(validateReportLength(l, 7).ok).toBe(true);
    expect(validateReportLength(l, 8).ok).toBe(false);
    expect(validateReportLength(undefined, 8).ok).toBe(false);
  });
  it('summarizes the descriptor', () => {
    const s = summarizeDescriptor(fixture);
    expect(s.axisCount).toBe(3);
    expect(s.buttonCount).toBe(12);
    expect(s.hatCount).toBe(1);
    expect(s.outputReports).toEqual([{ reportId: 3, bytes: 7 }]);
    expect(s.hasPidPage).toBe(false);
  });
  it('decodes a report', () => {
    // X = 0x8000, Y = 10, Z = 250, hat = 2 (right), buttons 1 and 12 pressed.
    const bytes = new Uint8Array([0x00, 0x80, 10, 250, 0x02, 0b0000_0001, 0b0000_1000]);
    const d = decodeReport(l, bytes, 'dev');
    expect(d.axes.map((a) => a.value)).toEqual([0x8000, 10, 250]);
    expect(d.hats[0].angle).toBe(90);
    expect(d.buttons.filter((b) => b.pressed).map((b) => b.index)).toEqual([1, 12]);
  });
  it('treats out-of-range hat as centred', () => {
    const d = decodeReport(l, new Uint8Array([0, 0, 0, 0, 0x0f, 0, 0]), 'dev');
    expect(d.hats[0].angle).toBeNull();
  });
});

describe('normalization', () => {
  const s = { ...DEFAULT_SETTINGS, pedalDeadzone: 0, pedalSaturation: 0 };
  it('normalizes steering asymmetrically and with inverted ranges', () => {
    const cal = { axisId: 'x', left: 0, center: 100, right: 300 };
    expect(normalizeSteering(0, cal, s)).toBe(-1);
    expect(normalizeSteering(50, cal, s)).toBe(-0.5);
    expect(normalizeSteering(200, cal, s)).toBe(0.5);
    expect(normalizeSteering(999, cal, s)).toBe(1);
    const inv = { axisId: 'x', left: 1000, center: 500, right: 0 };
    expect(normalizeSteering(250, inv, s)).toBe(0.5);
    expect(normalizeSteering(750, inv, s)).toBe(-0.5);
  });
  it('applies steering dead-zone and inversion', () => {
    const cal = { axisId: 'x', left: -100, center: 0, right: 100 };
    expect(normalizeSteering(5, cal, { ...s, steeringDeadzone: 0.1 })).toBe(0);
    expect(normalizeSteering(55, cal, { ...s, steeringDeadzone: 0.1 })).toBeCloseTo(0.5);
    expect(normalizeSteering(50, cal, { ...s, invertSteering: true })).toBe(-0.5);
  });
  it('normalizes pedals including inverted pedals', () => {
    expect(normalizePedal(255, { axisId: 'p', released: 255, pressed: 0 }, s)).toBe(0);
    expect(normalizePedal(0, { axisId: 'p', released: 255, pressed: 0 }, s)).toBe(1);
    expect(normalizePedal(51, { axisId: 'p', released: 0, pressed: 255 }, s)).toBeCloseTo(0.2);
    const dz = { ...s, pedalDeadzone: 0.1, pedalSaturation: 0.1 };
    expect(normalizePedal(20, { axisId: 'p', released: 0, pressed: 255 }, dz)).toBe(0);
    expect(normalizePedal(240, { axisId: 'p', released: 0, pressed: 255 }, dz)).toBe(1);
  });
  it('maps hat angles including diagonals', () => {
    expect(hatPressed(45, 'up')).toBe(true);
    expect(hatPressed(45, 'right')).toBe(true);
    expect(hatPressed(45, 'down')).toBe(false);
    expect(hatPressed(315, 'up')).toBe(true);
    expect(hatPressed(null, 'up')).toBe(false);
  });
});

function frame(values: Record<string, number>): RawFrame {
  return {
    source: 'webhid',
    deviceKey: 'test',
    timestamp: 0,
    simulated: false,
    axes: Object.entries(values).map(([id, value]) => ({ id, label: id, value, min: 0, max: 1000 })),
    buttons: [{ id: 'b1', index: 1, label: 'Button 1', pressed: true, value: 1 }],
    hats: [],
  };
}

describe('calibration', () => {
  it('learns axis assignment from movement', () => {
    const rest = { a: 500, b: 1000, c: 1000, d: 0 };
    const snaps = {
      center: snapshot(frame(rest)),
      left: snapshot(frame({ ...rest, a: 0 })),
      right: snapshot(frame({ ...rest, a: 1000 })),
      throttle_released: snapshot(frame(rest)),
      throttle_pressed: snapshot(frame({ ...rest, c: 0 })),
      brake_released: snapshot(frame(rest)),
      brake_pressed: snapshot(frame({ ...rest, b: 100 })),
    };
    const r = solveCalibration(snaps, frame(rest));
    expect(r.warnings).toEqual([]);
    expect(r.steering).toEqual({ axisId: 'a', center: 500, left: 0, right: 1000 });
    expect(r.throttle).toEqual({ axisId: 'c', released: 1000, pressed: 0 });
    expect(r.brake).toEqual({ axisId: 'b', released: 1000, pressed: 100 });
    expect(r.clutch).toBeUndefined();

    const p = applyCalibration(defaultProfile(frame(rest)), r);
    expect(p.confirmed).toBe(true);
    const t = translate(frame({ a: 250, b: 550, c: 500, d: 0 }), { ...p, buttonMap: { b1: 'cross' } }, null);
    expect(t.steering).toBeCloseTo(-0.5);
    expect(t.throttle).toBeGreaterThan(0.45);
    expect(t.buttons.cross).toBe(true);
    const vg = toVirtualGamepad(t);
    expect(vg.leftStickX).toBeCloseTo(-0.5);
    expect(vg.buttons[0]).toBe(true);
  });
  it('warns when nothing moves', () => {
    const rest = { a: 500 };
    const r = solveCalibration({ center: snapshot(frame(rest)), left: snapshot(frame(rest)), right: snapshot(frame(rest)) }, frame(rest));
    expect(r.steering).toBeUndefined();
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('has the required step order', () => {
    expect(CALIBRATION_STEPS.slice(0, 7).map((s) => s.id)).toEqual([
      'center', 'left', 'right', 'throttle_released', 'throttle_pressed', 'brake_released', 'brake_pressed',
    ]);
  });
});
