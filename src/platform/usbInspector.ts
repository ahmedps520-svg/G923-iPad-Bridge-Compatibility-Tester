/**
 * WebUSB descriptor inspection — strictly read-only.
 * Never calls claimInterface(), controlTransferOut(), transferOut(), etc.
 * (Chromium also blocks claiming HID-class interfaces from WebUSB.)
 */
import { hex } from '../core/hidUsages';
import { errorMessage, log } from '../state/logs';
import { LOGITECH_VENDOR_ID } from './hidSource';

const CLASS_NAMES: Record<number, string> = {
  0x00: 'Defined per interface', 0x01: 'Audio', 0x02: 'CDC', 0x03: 'HID', 0x08: 'Mass Storage',
  0x09: 'Hub', 0x0a: 'CDC-Data', 0x0e: 'Video', 0xe0: 'Wireless', 0xef: 'Miscellaneous', 0xfe: 'Application Specific', 0xff: 'Vendor Specific',
};

export const usbClassName = (c: number) => `${CLASS_NAMES[c] ?? 'Unknown'} (0x${hex(c, 2)})`;

export interface UsbEndpointInfo { number: number; direction: string; type: string; packetSize: number }
export interface UsbInterfaceInfo {
  number: number;
  claimed: boolean;
  alternates: { alt: number; cls: string; subclass: number; protocol: number; name: string | null; endpoints: UsbEndpointInfo[] }[];
}
export interface UsbDeviceInfo {
  vendorId: string;
  productId: string;
  productName: string | null;
  manufacturerName: string | null;
  /** Masked for privacy in exported reports. */
  serialPresent: boolean;
  usbVersion: string;
  deviceVersion: string;
  deviceClass: string;
  configurations: { value: number; name: string | null; interfaces: UsbInterfaceInfo[] }[];
  notes: string[];
}

function describe(d: USBDevice): UsbDeviceInfo {
  const notes: string[] = [];
  const configurations = (d.configurations ?? []).map((c) => ({
    value: c.configurationValue,
    name: c.configurationName ?? null,
    interfaces: c.interfaces.map((i) => ({
      number: i.interfaceNumber,
      claimed: i.claimed,
      alternates: i.alternates.map((a) => ({
        alt: a.alternateSetting,
        cls: usbClassName(a.interfaceClass),
        subclass: a.interfaceSubclass,
        protocol: a.interfaceProtocol,
        name: a.interfaceName ?? null,
        endpoints: a.endpoints.map((e) => ({ number: e.endpointNumber, direction: e.direction, type: e.type, packetSize: e.packetSize })),
      })),
    })),
  }));
  const hasHid = configurations.some((c) => c.interfaces.some((i) => i.alternates.some((a) => a.cls.startsWith('HID'))));
  if (hasHid) notes.push('Device exposes a HID-class interface. Browsers block WebUSB access to HID interfaces; use WebHID to read inputs.');
  if (configurations.length === 0) notes.push('No configuration descriptors were exposed.');
  return {
    vendorId: `0x${hex(d.vendorId, 4)}`,
    productId: `0x${hex(d.productId, 4)}`,
    productName: d.productName ?? null,
    manufacturerName: d.manufacturerName ?? null,
    serialPresent: !!d.serialNumber,
    usbVersion: `${d.usbVersionMajor}.${d.usbVersionMinor}.${d.usbVersionSubminor}`,
    deviceVersion: `${d.deviceVersionMajor}.${d.deviceVersionMinor}.${d.deviceVersionSubminor}`,
    deviceClass: usbClassName(d.deviceClass),
    configurations,
    notes,
  };
}

export async function inspectUsb(anyDevice: boolean): Promise<UsbDeviceInfo | null> {
  if (!('usb' in navigator) || !navigator.usb) throw new Error('WebUSB is not available in this browser.');
  let device: USBDevice;
  try {
    device = await navigator.usb.requestDevice({ filters: anyDevice ? [] : [{ vendorId: LOGITECH_VENDOR_ID }] });
  } catch (e) {
    log('warn', 'usb', `WebUSB requestDevice: ${errorMessage(e)}`);
    return null;
  }
  const info = describe(device);
  log('success', 'usb', `WebUSB descriptor read: ${info.productName ?? 'unnamed'} VID ${info.vendorId} PID ${info.productId}, ${info.configurations.length} configuration(s).`, info);
  return info;
}

export async function listGrantedUsb(): Promise<UsbDeviceInfo[]> {
  if (!('usb' in navigator) || !navigator.usb) return [];
  try {
    return (await navigator.usb.getDevices()).map(describe);
  } catch {
    return [];
  }
}
