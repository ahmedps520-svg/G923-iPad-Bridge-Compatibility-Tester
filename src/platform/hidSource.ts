/**
 * WebHID input source. Read-only: this module never calls sendReport(),
 * sendFeatureReport() or receiveFeatureReport().
 */
import {
  buildInputLayouts, decodeReport, summarizeDescriptor, validateReportLength,
  type DecodedReport, type DescriptorSummary, type HidReportLayout,
} from '../core/hidReportParser';
import { hex } from '../core/hidUsages';
import type { RawFrame } from '../core/types';
import { errorMessage, log, rawReportLog } from '../state/logs';

export const LOGITECH_VENDOR_ID = 0x046d;

export interface HidInterfaceInfo {
  prefix: string;
  opened: boolean;
  summary: DescriptorSummary;
  reportsReceived: number;
  lengthChecks: Record<number, { ok: boolean; message: string }>;
}

export interface HidDeviceInfo {
  key: string;
  vendorId: number;
  productId: number;
  productName: string;
  isLogitech: boolean;
  connected: boolean;
  interfaces: HidInterfaceInfo[];
}

interface OpenInterface {
  device: HIDDevice;
  prefix: string;
  layouts: Map<number, HidReportLayout>;
  decoded: Map<number, DecodedReport>;
  info: HidInterfaceInfo;
  handler: (e: HIDInputReportEvent) => void;
}

export function hidDeviceKey(d: { vendorId: number; productId: number }): string {
  return `hid:${hex(d.vendorId, 4)}:${hex(d.productId, 4)}`;
}

function interfacePrefix(d: HIDDevice, taken: Set<string>): string {
  const top = d.collections[0];
  let base = top ? `hid-${hex(top.usagePage ?? 0, 2)}-${hex(top.usage ?? 0, 2)}` : 'hid';
  let p = base;
  for (let i = 2; taken.has(p); i++) p = `${base}-${i}`;
  taken.add(p);
  return p;
}

export class HidSource {
  private open = new Map<string, OpenInterface[]>();
  private granted: HIDDevice[] = [];
  activeKey: string | null = null;

  constructor(
    private onFrame: (f: RawFrame) => void,
    private onChange: () => void,
  ) {}

  get supported(): boolean {
    return typeof navigator !== 'undefined' && 'hid' in navigator && !!navigator.hid;
  }

  async init(): Promise<void> {
    if (!this.supported) return;
    navigator.hid.addEventListener('connect', (e) => void this.handleConnect(e.device));
    navigator.hid.addEventListener('disconnect', (e) => this.handleDisconnect(e.device));
    try {
      this.granted = await navigator.hid.getDevices();
      log('info', 'hid', `WebHID: ${this.granted.length} previously-permitted device interface(s).`);
      const logi = this.granted.find((d) => d.vendorId === LOGITECH_VENDOR_ID) ?? this.granted[0];
      if (logi) await this.openDevice(hidDeviceKey(logi));
    } catch (e) {
      log('error', 'hid', `navigator.hid.getDevices() failed: ${errorMessage(e)}`);
    }
    this.onChange();
  }

  /** Must be called from a user gesture. */
  async request(anyDevice: boolean): Promise<void> {
    if (!this.supported) throw new Error('WebHID is not available in this browser.');
    const filters = anyDevice ? [] : [{ vendorId: LOGITECH_VENDOR_ID }];
    log('info', 'hid', `Requesting HID device (${anyDevice ? 'any vendor' : 'Logitech vendor ID 0x046D'})…`);
    let picked: HIDDevice[] = [];
    try {
      picked = await navigator.hid.requestDevice({ filters });
    } catch (e) {
      log('error', 'hid', `requestDevice failed: ${errorMessage(e)}`);
      throw e;
    }
    if (picked.length === 0) {
      log('warn', 'hid', 'No device was selected in the browser chooser.');
      return;
    }
    this.granted = await navigator.hid.getDevices();
    for (const d of picked) {
      log('success', 'hid', `Permission granted: "${d.productName}" VID 0x${hex(d.vendorId, 4)} PID 0x${hex(d.productId, 4)} (${d.collections.length} top-level collection(s)).`);
    }
    await this.openDevice(hidDeviceKey(picked[0]));
  }

  devices(): HidDeviceInfo[] {
    const groups = new Map<string, HIDDevice[]>();
    for (const d of this.granted) {
      const k = hidDeviceKey(d);
      groups.set(k, [...(groups.get(k) ?? []), d]);
    }
    return [...groups.entries()].map(([key, list]) => {
      const opened = this.open.get(key);
      return {
        key,
        vendorId: list[0].vendorId,
        productId: list[0].productId,
        productName: list[0].productName || '(no product name reported)',
        isLogitech: list[0].vendorId === LOGITECH_VENDOR_ID,
        connected: true,
        interfaces: opened
          ? opened.map((o) => o.info)
          : list.map((d, i) => ({
              prefix: `hid-${i}`, opened: false, summary: summarizeDescriptor(d.collections),
              reportsReceived: 0, lengthChecks: {},
            })),
      };
    });
  }

  /** Raw HIDDevice objects (for force-feedback capability inspection only). */
  rawDevices(key: string): HIDDevice[] {
    return this.granted.filter((d) => hidDeviceKey(d) === key);
  }

  async openDevice(key: string): Promise<void> {
    await this.closeDevice(key, false);
    const list = this.granted.filter((d) => hidDeviceKey(d) === key);
    const taken = new Set<string>();
    const opened: OpenInterface[] = [];
    for (const device of list) {
      const prefix = interfacePrefix(device, taken);
      try {
        if (!device.opened) await device.open();
      } catch (e) {
        log('error', 'hid', `device.open() failed for ${prefix}: ${errorMessage(e)}`);
        continue;
      }
      const layouts = buildInputLayouts(device.collections);
      const iface: OpenInterface = {
        device, prefix, layouts, decoded: new Map(),
        info: { prefix, opened: true, summary: summarizeDescriptor(device.collections), reportsReceived: 0, lengthChecks: {} },
        handler: (e) => this.handleReport(key, iface, e),
      };
      device.addEventListener('inputreport', iface.handler);
      opened.push(iface);
      log('success', 'hid', `Opened ${prefix}: input report IDs [${[...layouts.keys()].join(', ')}], ${iface.info.summary.axisCount} axes, ${iface.info.summary.buttonCount} buttons, ${iface.info.summary.hatCount} hats in descriptor.`);
    }
    if (opened.length) {
      this.open.set(key, opened);
      this.activeKey = key;
    }
    this.onChange();
  }

  async closeDevice(key: string, notify = true): Promise<void> {
    const list = this.open.get(key);
    if (!list) return;
    for (const o of list) {
      o.device.removeEventListener('inputreport', o.handler);
      try {
        if (o.device.opened) await o.device.close();
      } catch {
        /* ignore */
      }
    }
    this.open.delete(key);
    if (this.activeKey === key) this.activeKey = null;
    if (notify) this.onChange();
  }

  async forget(key: string): Promise<void> {
    await this.closeDevice(key);
    for (const d of this.granted.filter((x) => hidDeviceKey(x) === key)) {
      try {
        await d.forget?.();
      } catch {
        /* older browsers */
      }
    }
    this.granted = this.supported ? await navigator.hid.getDevices() : [];
    this.onChange();
  }

  isOpen(key: string): boolean {
    return this.open.has(key);
  }

  private handleReport(key: string, iface: OpenInterface, e: HIDInputReportEvent) {
    const bytes = new Uint8Array(e.data.buffer.slice(e.data.byteOffset, e.data.byteOffset + e.data.byteLength));
    rawReportLog.push({ t: performance.now(), device: `${key}/${iface.prefix}`, reportId: e.reportId, bytes });
    iface.info.reportsReceived++;
    const layout = iface.layouts.get(e.reportId);
    if (!(e.reportId in iface.info.lengthChecks)) {
      const v = validateReportLength(layout, bytes.length);
      iface.info.lengthChecks[e.reportId] = { ok: v.ok, message: v.message };
      log(v.ok ? 'success' : 'warn', 'hid', `First input report ${e.reportId} on ${iface.prefix} (${bytes.length} bytes): ${v.message}`);
      this.onChange();
    }
    if (layout) iface.decoded.set(e.reportId, decodeReport(layout, bytes, iface.prefix));
    if (key === this.activeKey) this.emit(key);
  }

  private emit(key: string) {
    const list = this.open.get(key);
    if (!list) return;
    const frame: RawFrame = { source: 'webhid', deviceKey: key, timestamp: performance.now(), axes: [], buttons: [], hats: [], simulated: false };
    for (const iface of list) {
      for (const d of iface.decoded.values()) {
        frame.axes.push(...d.axes);
        frame.buttons.push(...d.buttons);
        frame.hats.push(...d.hats);
      }
    }
    this.onFrame(frame);
  }

  private async handleConnect(device: HIDDevice) {
    const key = hidDeviceKey(device);
    log('info', 'connection', `HID connect event: "${device.productName}" (${key}).`);
    this.granted = await navigator.hid.getDevices();
    // Reconnection: re-open automatically if this was the active (or no) device.
    if (this.activeKey === null || this.activeKey === key) {
      await this.openDevice(key);
      log('success', 'connection', `Reconnected to ${key}.`);
    }
    this.onChange();
  }

  private handleDisconnect(device: HIDDevice) {
    const key = hidDeviceKey(device);
    log('warn', 'connection', `HID disconnect event: "${device.productName}" (${key}).`);
    const list = this.open.get(key);
    if (list) {
      for (const o of list) o.device.removeEventListener('inputreport', o.handler);
      this.open.delete(key);
      // keep activeKey so the device is re-opened automatically on reconnect
    }
    this.granted = this.granted.filter((d) => d !== device);
    this.onChange();
  }
}
