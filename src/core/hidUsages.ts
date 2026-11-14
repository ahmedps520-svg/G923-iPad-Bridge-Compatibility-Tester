/**
 * Names from the public USB-IF "HID Usage Tables" specification.
 * These are standard identifiers, not Logitech-specific protocol information.
 */

export const USAGE_PAGE = {
  GENERIC_DESKTOP: 0x01,
  SIMULATION: 0x02,
  BUTTON: 0x09,
  PID: 0x0f, // Physical Interface Device (standard force-feedback page)
} as const;

const PAGE_NAMES: Record<number, string> = {
  0x01: 'Generic Desktop',
  0x02: 'Simulation Controls',
  0x05: 'Game Controls',
  0x06: 'Generic Device Controls',
  0x07: 'Keyboard/Keypad',
  0x08: 'LED',
  0x09: 'Button',
  0x0c: 'Consumer',
  0x0f: 'Physical Interface Device (PID)',
};

const GENERIC_DESKTOP: Record<number, string> = {
  0x01: 'Pointer', 0x02: 'Mouse', 0x04: 'Joystick', 0x05: 'Gamepad', 0x08: 'Multi-axis Controller',
  0x30: 'X', 0x31: 'Y', 0x32: 'Z', 0x33: 'Rx', 0x34: 'Ry', 0x35: 'Rz',
  0x36: 'Slider', 0x37: 'Dial', 0x38: 'Wheel', 0x39: 'Hat Switch',
};

const SIMULATION: Record<number, string> = {
  0xb0: 'Aileron', 0xb8: 'Rudder', 0xba: 'Rudder', 0xbb: 'Throttle',
  0xc4: 'Accelerator', 0xc5: 'Brake', 0xc6: 'Clutch', 0xc7: 'Shifter', 0xc8: 'Steering',
};

export const GD_AXIS_USAGES = new Set([0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38]);
export const GD_HAT_SWITCH = 0x39;
export const SIM_STEERING = 0xc8;
export const SIM_ACCELERATOR = 0xc4;
export const SIM_BRAKE = 0xc5;
export const SIM_CLUTCH = 0xc6;

export function splitUsage(extended: number): { page: number; id: number } {
  return { page: (extended >>> 16) & 0xffff, id: extended & 0xffff };
}

export function isVendorPage(page: number): boolean {
  return page >= 0xff00;
}

export function usagePageName(page: number): string {
  if (isVendorPage(page)) return `Vendor-defined 0x${hex(page, 4)}`;
  return PAGE_NAMES[page] ?? `Page 0x${hex(page, 2)}`;
}

export function usageName(page: number, id: number): string {
  if (page === USAGE_PAGE.GENERIC_DESKTOP) return GENERIC_DESKTOP[id] ?? `Usage 0x${hex(id, 2)}`;
  if (page === USAGE_PAGE.SIMULATION) return SIMULATION[id] ?? `Usage 0x${hex(id, 2)}`;
  if (page === USAGE_PAGE.BUTTON) return id === 0 ? 'No button' : `Button ${id}`;
  return `Usage 0x${hex(id, 2)}`;
}

export function hex(n: number, width = 2): string {
  return n.toString(16).toUpperCase().padStart(width, '0');
}
