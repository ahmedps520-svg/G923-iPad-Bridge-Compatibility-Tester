/**
 * Diagnostic report + per-stage verdicts, computed from what actually
 * happened in this browser session.
 */
import { summarizeDescriptor } from '../core/hidReportParser';
import { assessForceFeedback } from '../platform/forceFeedback';
import { app, gamepad, getHardwareLive, hardwareStatus, hid } from './app';
import { eventLog } from './logs';

export type StageResult = 'pass' | 'fail' | 'partial' | 'pending' | 'n/a';

export interface Stage {
  n: number;
  title: string;
  result: StageResult;
  detail: string;
}

export function computeStages(): Stage[] {
  const s = app.get();
  const caps = s.caps;
  const hw = getHardwareLive();
  const logiHid = s.hidDevices.find((d) => d.isLogitech);
  const wheelPad = s.gamepads.find((g) => g.looksLikeWheel);
  const anyDevice = !!logiHid || s.gamepads.length > 0 || s.usbDevices.length > 0;
  const frames = s.stats.hardwareFrames + s.stats.hz;
  const profile = hw.frame ? s.profiles[hw.frame.deviceKey] : undefined;

  const stages: Stage[] = [
    {
      n: 1,
      title: 'Investigate browser / iPadOS API support',
      result: 'pass',
      detail: `${caps.env.browser} on ${caps.env.osVersion} (${caps.env.engine}). WebHID: ${caps.hid ? 'yes' : 'NO'} · WebUSB: ${caps.usb ? 'yes' : 'NO'} · Gamepad API: ${caps.gamepad ? 'yes' : 'NO'} · secure context: ${caps.env.secureContext ? 'yes' : 'NO'}.`,
    },
    {
      n: 2,
      title: 'USB / HID / Gamepad feature detection',
      result: caps.rawDeviceAccessPossible ? 'pass' : caps.gamepad ? 'partial' : 'fail',
      detail: caps.rawDeviceAccessPossible
        ? 'At least one raw-device API (WebHID/WebUSB) is exposed.'
        : `No raw USB/HID API is exposed${caps.env.isIOSFamily ? ' (WebKit on iPadOS implements neither WebHID nor WebUSB)' : ''}. ${caps.gamepad ? 'Only the Gamepad API can be tried.' : ''}`,
    },
    {
      n: 3,
      title: 'Real G923 device discovery',
      result: logiHid || wheelPad ? 'pass' : anyDevice ? 'partial' : caps.rawDeviceAccessPossible || caps.gamepad ? 'pending' : 'fail',
      detail: logiHid
        ? `Logitech HID device found: "${logiHid.productName}" VID 0x${logiHid.vendorId.toString(16)} PID 0x${logiHid.productId.toString(16)}.`
        : wheelPad
          ? `Wheel-like gamepad reported: "${wheelPad.id}".`
          : anyDevice
            ? 'A device was found but it is not identified as the Logitech wheel.'
            : caps.rawDeviceAccessPossible
              ? 'Not yet attempted — use "Connect via WebHID".'
              : caps.gamepad
                ? 'No gamepad has been reported. Press wheel buttons; if nothing appears, iPadOS does not expose the G923 to web content.'
                : 'Impossible in this browser.',
    },
    {
      n: 4,
      title: 'Read and decode real inputs',
      result: frames > 0 ? (profile?.confirmed ? 'pass' : 'partial') : anyDevice || caps.rawDeviceAccessPossible || caps.gamepad ? 'pending' : 'fail',
      detail: frames > 0
        ? `${frames} real input frames received via ${hw.frame?.source}. ${hw.frame?.axes.length ?? 0} axes, ${hw.frame?.buttons.length ?? 0} buttons, ${hw.frame?.hats.length ?? 0} hats decoded.${profile?.confirmed ? '' : ' Axis roles not yet confirmed by calibration.'}`
        : 'No real input data has been received.',
    },
    {
      n: 5,
      title: 'Live monitoring dashboard',
      result: frames > 0 ? 'pass' : 'pending',
      detail: frames > 0 ? 'Dashboard is driven by real data.' : 'Dashboard is ready but has no real data to show.',
    },
    {
      n: 6,
      title: 'Calibration & diagnostics',
      result: profile?.confirmed ? 'pass' : frames > 0 ? 'pending' : 'n/a',
      detail: profile?.confirmed ? `Calibrated ${profile.calibratedAt}.` : frames > 0 ? 'Run the calibration wizard.' : 'Requires real input.',
    },
    {
      n: 7,
      title: 'Make inputs available to iPad games',
      result: 'fail',
      detail:
        'Not possible from a web page: browsers cannot create a system-level virtual game controller on iPadOS. See Bridge Options for native (DriverKit), hardware-bridge and streaming approaches.',
    },
  ];
  return stages;
}

export function buildDiagnosticReport() {
  const s = app.get();
  const hw = getHardwareLive();
  const gp = gamepad.selected();
  const hidSummaries = s.activeHidKey ? hid.rawDevices(s.activeHidKey).map((d) => summarizeDescriptor(d.collections)) : [];
  const ffb = assessForceFeedback(gp, hidSummaries, s.caps.hid);
  const status = hardwareStatus(s);
  const key = hw.frame?.deviceKey;
  const errors = eventLog.all().filter((e) => e.level === 'error' || e.level === 'warn');

  return {
    generatedAt: new Date().toISOString(),
    app: { name: 'G923 iPad Bridge & Compatibility Tester', version: '1.0.0' },
    note: 'All values below were measured in this browser session. Nothing is simulated in this report.',
    device: {
      model: s.caps.env.deviceModel,
      iPadDetected: s.caps.env.isIPad,
      iPadDetection: s.caps.env.iPadDetection,
      osVersion: s.caps.env.osVersion,
      osVersionSource: s.caps.env.osVersionSource,
      gpu: s.caps.env.gpuRenderer,
      screen: s.caps.env.screen,
      devicePixelRatio: s.caps.env.devicePixelRatio,
      cpuCores: s.caps.env.hardwareConcurrency,
    },
    browser: {
      name: s.caps.env.browser,
      engine: s.caps.env.engine,
      userAgent: s.caps.env.userAgent,
      secureContext: s.caps.env.secureContext,
      inIframe: s.caps.env.inIframe,
      standalone: s.caps.env.standalone,
    },
    apis: Object.fromEntries(s.caps.caps.map((c) => [c.id, { status: c.status, detail: c.detail }])),
    detection: {
      hardwareStatus: status,
      hidDevices: s.hidDevices,
      usbDevices: s.usbDevices,
      gamepads: s.gamepads,
      realFramesReceived: s.stats.hardwareFrames + s.stats.hz,
      firstRealFrameAt: s.stats.firstHardwareFrameAt ? new Date(s.stats.firstHardwareFrameAt).toISOString() : null,
    },
    inputs: hw.frame
      ? {
          source: hw.frame.source,
          deviceKey: hw.frame.deviceKey,
          axes: hw.frame.axes.map((a) => ({ ...a, movedDuringSession: (s.movedAxes[key!] ?? []).includes(a.id) })),
          buttons: hw.frame.buttons.map((b) => ({ id: b.id, label: b.label, pressedDuringSession: (s.seenButtons[key!] ?? []).includes(b.id) })),
          hats: hw.frame.hats,
          profile: s.profiles[hw.frame.deviceKey] ?? null,
        }
      : null,
    forceFeedback: ffb,
    stages: computeStages(),
    errorsAndUnsupported: [
      ...s.caps.caps.filter((c) => c.status !== 'available').map((c) => ({ type: 'unsupported', feature: c.name, detail: c.detail })),
      ...errors.map((e) => ({ type: e.level, category: e.category, at: new Date(e.t).toISOString(), message: e.message })),
    ],
  };
}
