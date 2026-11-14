/**
 * Runtime feature detection. Every result here is measured in the running
 * browser — nothing is assumed from the user agent except where explicitly
 * labelled "inferred".
 */

export type CapStatus = 'available' | 'unavailable' | 'blocked' | 'unknown';

export interface Capability {
  id: string;
  name: string;
  status: CapStatus;
  detail: string;
}

export interface EnvironmentInfo {
  userAgent: string;
  platform: string;
  vendor: string;
  maxTouchPoints: number;
  isIPad: boolean;
  isIOSFamily: boolean;
  iPadDetection: string;
  browser: string;
  engine: string;
  safariVersion: string | null;
  osVersion: string;
  osVersionSource: string;
  deviceModel: string;
  gpuRenderer: string | null;
  screen: string;
  devicePixelRatio: number;
  hardwareConcurrency: number | null;
  secureContext: boolean;
  inIframe: boolean;
  standalone: boolean;
  language: string;
}

export interface CapabilityReport {
  env: EnvironmentInfo;
  caps: Capability[];
  hid: boolean;
  usb: boolean;
  gamepad: boolean;
  /** Is there ANY API in this browser that could read raw USB/HID data? */
  rawDeviceAccessPossible: boolean;
}

function permissionsPolicyAllows(feature: string): boolean | null {
  const d = document as Document & {
    permissionsPolicy?: { allowsFeature(f: string): boolean };
    featurePolicy?: { allowsFeature(f: string): boolean };
  };
  const pol = d.permissionsPolicy ?? d.featurePolicy;
  if (!pol) return null;
  try {
    return pol.allowsFeature(feature);
  } catch {
    return null;
  }
}

let cachedGpu: string | null | undefined;
function gpuRenderer(): string | null {
  if (cachedGpu !== undefined) return cachedGpu;
  cachedGpu = probeGpu();
  return cachedGpu;
}

function probeGpu(): string | null {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return typeof r === 'string' ? r : null;
  } catch {
    return null;
  }
}

export function detectEnvironment(): EnvironmentInfo {
  const ua = navigator.userAgent;
  const touch = navigator.maxTouchPoints ?? 0;
  const iPadUA = /iPad/.test(ua);
  // iPadOS Safari defaults to a desktop ("Macintosh") UA; touch support tells them apart.
  const desktopClassIPad = /Macintosh/.test(ua) && touch > 1;
  const isIPad = iPadUA || desktopClassIPad;
  const isIOSFamily = isIPad || /iPhone|iPod/.test(ua);

  const safariVersion = ua.match(/Version\/(\d+(?:\.\d+)*)/)?.[1] ?? null;
  let browser = 'Unknown';
  if (/CriOS\//.test(ua)) browser = `Chrome for iOS ${ua.match(/CriOS\/([\d.]+)/)?.[1] ?? ''}`;
  else if (/FxiOS\//.test(ua)) browser = `Firefox for iOS ${ua.match(/FxiOS\/([\d.]+)/)?.[1] ?? ''}`;
  else if (/EdgiOS\//.test(ua)) browser = `Edge for iOS ${ua.match(/EdgiOS\/([\d.]+)/)?.[1] ?? ''}`;
  else if (/Edg\//.test(ua)) browser = `Microsoft Edge ${ua.match(/Edg\/([\d.]+)/)?.[1] ?? ''}`;
  else if (/OPR\//.test(ua)) browser = `Opera ${ua.match(/OPR\/([\d.]+)/)?.[1] ?? ''}`;
  else if (/Chrome\//.test(ua)) browser = `Chrome ${ua.match(/Chrome\/([\d.]+)/)?.[1] ?? ''}`;
  else if (/Firefox\//.test(ua)) browser = `Firefox ${ua.match(/Firefox\/([\d.]+)/)?.[1] ?? ''}`;
  else if (/Safari\//.test(ua) && safariVersion) browser = `Safari ${safariVersion}`;

  const nav = navigator as Navigator & { userAgentData?: unknown; standalone?: boolean };
  let engine = 'Unknown';
  if (nav.userAgentData) engine = 'Blink (Chromium)';
  else if (/Gecko\/\d/.test(ua) && /Firefox/.test(ua)) engine = 'Gecko';
  else if (/AppleWebKit/.test(ua)) engine = 'WebKit';
  if (isIOSFamily && engine === 'WebKit') engine = 'WebKit (all iOS/iPadOS browsers use WebKit outside the EU alternative-engine programme)';

  let osVersion = 'Not exposed';
  let osVersionSource = 'n/a';
  const iosUA = ua.match(/OS (\d+)_(\d+)(?:_(\d+))? like Mac OS X/);
  if (iosUA && iPadUA) {
    osVersion = `iPadOS ${iosUA[1]}.${iosUA[2]}${iosUA[3] ? '.' + iosUA[3] : ''}`;
    osVersionSource = 'User-agent OS token (mobile UA)';
  } else if (desktopClassIPad && safariVersion) {
    osVersion = `iPadOS ≈ ${safariVersion.split('.')[0]} (inferred)`;
    osVersionSource =
      'Inferred from Safari version — the desktop-class UA freezes the OS token at "Mac OS X 10_15_7", and Safari major versions track the OS release.';
  } else if (desktopClassIPad) {
    osVersion = 'iPadOS (version not exposed by this browser)';
    osVersionSource = 'Desktop-class UA hides the OS version';
  } else {
    const mac = ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, '.');
    const win = ua.match(/Windows NT ([\d.]+)/)?.[1];
    const android = ua.match(/Android ([\d.]+)/)?.[1];
    if (android) osVersion = `Android ${android}`;
    else if (win) osVersion = `Windows NT ${win}`;
    else if (mac) osVersion = `macOS (UA token ${mac}; frozen by most browsers)`;
    else if (/Linux/.test(ua)) osVersion = 'Linux';
    osVersionSource = 'User-agent';
  }

  return {
    userAgent: ua,
    platform: navigator.platform ?? '',
    vendor: navigator.vendor ?? '',
    maxTouchPoints: touch,
    isIPad,
    isIOSFamily,
    iPadDetection: iPadUA ? 'iPad in user-agent' : desktopClassIPad ? 'Macintosh UA + multi-touch ⇒ iPad (desktop-class browsing)' : 'Not an iPad',
    browser: browser.trim(),
    engine,
    safariVersion,
    osVersion,
    osVersionSource,
    deviceModel: isIPad
      ? 'iPad (exact model and chip — e.g. "iPad Pro M5" — are not exposed to web pages)'
      : 'Not exposed to web pages',
    gpuRenderer: gpuRenderer(),
    screen: `${screen.width}×${screen.height} CSS px`,
    devicePixelRatio: window.devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    secureContext: window.isSecureContext,
    inIframe: window.self !== window.top,
    standalone: !!nav.standalone || window.matchMedia?.('(display-mode: standalone)').matches,
    language: navigator.language,
  };
}

export function detectCapabilities(): CapabilityReport {
  const env = detectEnvironment();
  const caps: Capability[] = [];
  const secure = window.isSecureContext;

  caps.push({
    id: 'secure',
    name: 'Secure context (HTTPS / localhost)',
    status: secure ? 'available' : 'blocked',
    detail: secure
      ? 'Page is a secure context.'
      : 'Not a secure context. WebHID, WebUSB and (in most engines) the Gamepad API are only exposed over HTTPS or localhost. Use `npm run dev:https` or the GitHub Pages build.',
  });

  const hasHid = 'hid' in navigator && !!navigator.hid;
  const hidPolicy = permissionsPolicyAllows('hid');
  caps.push({
    id: 'webhid',
    name: 'WebHID API (navigator.hid)',
    status: hasHid ? (hidPolicy === false ? 'blocked' : 'available') : 'unavailable',
    detail: hasHid
      ? hidPolicy === false
        ? 'navigator.hid exists but the Permissions-Policy "hid" feature is disabled for this frame.'
        : 'navigator.hid is exposed. A device can be requested after a user tap.'
      : env.isIOSFamily
        ? 'navigator.hid is not defined. WebKit on iOS/iPadOS does not implement WebHID, so no web page can open the G923 as a HID device.'
        : secure
          ? 'navigator.hid is not defined in this browser.'
          : 'navigator.hid is not defined (may be hidden because the page is not a secure context).',
  });

  const hasUsb = 'usb' in navigator && !!navigator.usb;
  const usbPolicy = permissionsPolicyAllows('usb');
  caps.push({
    id: 'webusb',
    name: 'WebUSB API (navigator.usb)',
    status: hasUsb ? (usbPolicy === false ? 'blocked' : 'available') : 'unavailable',
    detail: hasUsb
      ? 'navigator.usb is exposed. Note: Chromium blocks claiming HID-class interfaces, so WebUSB can only read descriptors of a HID wheel, not its input data.'
      : env.isIOSFamily
        ? 'navigator.usb is not defined. WebKit on iOS/iPadOS does not implement WebUSB.'
        : 'navigator.usb is not defined in this browser.',
  });

  const hasGamepad = typeof navigator.getGamepads === 'function';
  caps.push({
    id: 'gamepad',
    name: 'Gamepad API (navigator.getGamepads)',
    status: hasGamepad ? 'available' : 'unavailable',
    detail: hasGamepad
      ? env.isIOSFamily
        ? 'Available. On iPadOS, WebKit only reports controllers that the system GameController framework recognises (e.g. Xbox, DualShock/DualSense, MFi). Press a wheel button to trigger detection.'
        : 'Available. Only devices the OS/browser recognises as gamepads appear, and only after a button press.'
      : 'navigator.getGamepads is not defined.',
  });

  const sampleGp = hasGamepad ? (navigator.getGamepads?.() ?? []).find(Boolean) : null;
  caps.push({
    id: 'haptics',
    name: 'Gamepad vibrationActuator (rumble)',
    status: sampleGp ? (sampleGp.vibrationActuator ? 'available' : 'unavailable') : 'unknown',
    detail: sampleGp
      ? sampleGp.vibrationActuator
        ? 'The connected gamepad exposes a vibration actuator (rumble — not steering torque).'
        : 'The connected gamepad exposes no vibration actuator.'
      : 'Unknown until a gamepad is connected.',
  });

  const hasSerial = 'serial' in navigator;
  caps.push({
    id: 'webserial',
    name: 'Web Serial API (for a hardware bridge)',
    status: hasSerial ? 'available' : 'unavailable',
    detail: hasSerial ? 'navigator.serial is exposed.' : 'navigator.serial is not defined.',
  });

  const hasBt = 'bluetooth' in navigator;
  caps.push({
    id: 'webbluetooth',
    name: 'Web Bluetooth API',
    status: hasBt ? 'available' : 'unavailable',
    detail: hasBt ? 'navigator.bluetooth is exposed.' : 'navigator.bluetooth is not defined.',
  });

  let storageOk = false;
  try {
    localStorage.setItem('__probe', '1');
    localStorage.removeItem('__probe');
    storageOk = true;
  } catch {
    storageOk = false;
  }
  caps.push({
    id: 'storage',
    name: 'Local storage (calibration persistence)',
    status: storageOk ? 'available' : 'blocked',
    detail: storageOk ? 'Calibration can be saved on this device.' : 'localStorage is blocked (private mode?) — calibration will not persist.',
  });

  if (env.inIframe) {
    caps.push({
      id: 'iframe',
      name: 'Top-level browsing context',
      status: 'blocked',
      detail: 'This page is running inside an iframe; device APIs may be blocked by the embedding page. Open it directly.',
    });
  }

  return {
    env,
    caps,
    hid: hasHid && hidPolicy !== false,
    usb: hasUsb && usbPolicy !== false,
    gamepad: hasGamepad,
    rawDeviceAccessPossible: (hasHid && hidPolicy !== false) || (hasUsb && usbPolicy !== false),
  };
}
