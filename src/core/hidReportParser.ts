/**
 * Generic HID input-report decoder.
 *
 * The layout is built ONLY from the report descriptor information the
 * browser (or OS) exposes for the connected device. Nothing here assumes a
 * particular product ID or a Logitech-specific report format. If the decoded
 * layout does not match the size of real reports, the mismatch is surfaced so
 * the raw-byte developer console can be used instead.
 *
 * The descriptor structures are modelled with minimal local interfaces that
 * match the WebHID `HIDCollectionInfo` shape, so the same code can be fed
 * from any other descriptor source (e.g. a native parser).
 */
import {
  GD_AXIS_USAGES, GD_HAT_SWITCH, USAGE_PAGE, isVendorPage, splitUsage, usageName, usagePageName,
} from './hidUsages';
import type { RawAxis, RawButton, RawHat } from './types';

export interface DescriptorReportItem {
  isConstant?: boolean;
  isArray?: boolean;
  isRange?: boolean;
  isAbsolute?: boolean;
  hasNull?: boolean;
  usages?: number[];
  usageMinimum?: number;
  usageMaximum?: number;
  reportSize?: number;
  reportCount?: number;
  logicalMinimum?: number;
  logicalMaximum?: number;
}
export interface DescriptorReport {
  reportId?: number;
  items?: DescriptorReportItem[];
}
export interface DescriptorCollection {
  usagePage?: number;
  usage?: number;
  type?: number;
  children?: DescriptorCollection[];
  inputReports?: DescriptorReport[];
  outputReports?: DescriptorReport[];
  featureReports?: DescriptorReport[];
}

export type FieldKind = 'axis' | 'button' | 'hat' | 'vendor' | 'padding' | 'array' | 'other';

export interface HidField {
  reportId: number;
  bitOffset: number;
  bitSize: number;
  /** Extended usage (page << 16 | id) per value slot. */
  usage: number;
  usagePage: number;
  usageId: number;
  logicalMin: number;
  logicalMax: number;
  signed: boolean;
  hasNull: boolean;
  kind: FieldKind;
  label: string;
}

export interface HidReportLayout {
  reportId: number;
  totalBits: number;
  fields: HidField[];
  /** Array-type items (e.g. keyboard-style) are listed but not decoded per usage. */
  notes: string[];
}

export interface DescriptorSummary {
  topLevelUsage: string;
  inputReports: { reportId: number; bytes: number; fieldCount: number }[];
  outputReports: { reportId: number; bytes: number }[];
  featureReports: { reportId: number; bytes: number }[];
  axisCount: number;
  buttonCount: number;
  hatCount: number;
  vendorFieldCount: number;
  hasPidPage: boolean;
  usagePages: string[];
}

function itemBits(item: DescriptorReportItem): number {
  return (item.reportSize ?? 0) * (item.reportCount ?? 0);
}

function reportBits(report: DescriptorReport): number {
  return (report.items ?? []).reduce((acc, it) => acc + itemBits(it), 0);
}

function classify(page: number, id: number, bitSize: number, isConstant: boolean): FieldKind {
  if (isConstant) return 'padding';
  if (page === USAGE_PAGE.BUTTON) return 'button';
  if (page === USAGE_PAGE.GENERIC_DESKTOP && id === GD_HAT_SWITCH) return 'hat';
  if (page === USAGE_PAGE.GENERIC_DESKTOP && GD_AXIS_USAGES.has(id) && bitSize > 1) return 'axis';
  if (page === USAGE_PAGE.SIMULATION && bitSize > 1) return 'axis';
  if (isVendorPage(page)) return 'vendor';
  return 'other';
}

/** Usage for the n-th value slot of a (non-array) item. */
function slotUsage(item: DescriptorReportItem, n: number): number {
  if (item.isRange && item.usageMinimum !== undefined) {
    const u = item.usageMinimum + n;
    return item.usageMaximum !== undefined ? Math.min(u, item.usageMaximum) : u;
  }
  const usages = item.usages ?? [];
  if (usages.length === 0) return 0;
  return usages[Math.min(n, usages.length - 1)];
}

/** Collect every report with the given kind across a collection tree, in tree order. */
function collectReports(
  collections: DescriptorCollection[],
  key: 'inputReports' | 'outputReports' | 'featureReports',
): DescriptorReport[] {
  const out: DescriptorReport[] = [];
  const walk = (c: DescriptorCollection) => {
    for (const r of c[key] ?? []) out.push(r);
    for (const child of c.children ?? []) walk(child);
  };
  collections.forEach(walk);
  return out;
}

/**
 * Build bit-level layouts for every input report ID.
 * If the same report ID appears in several (nested) collections, the items are
 * concatenated in tree order. This matches common descriptors; if a device
 * interleaves items across collections, `validateReportLength` will flag it.
 */
export function buildInputLayouts(collections: DescriptorCollection[]): Map<number, HidReportLayout> {
  const layouts = new Map<number, HidReportLayout>();
  for (const report of collectReports(collections, 'inputReports')) {
    const reportId = report.reportId ?? 0;
    let layout = layouts.get(reportId);
    if (!layout) {
      layout = { reportId, totalBits: 0, fields: [], notes: [] };
      layouts.set(reportId, layout);
    }
    for (const item of report.items ?? []) {
      const size = item.reportSize ?? 0;
      const count = item.reportCount ?? 0;
      const lmin = item.logicalMinimum ?? 0;
      const lmax = item.logicalMaximum ?? 0;
      if (item.isArray && !item.isConstant) {
        layout.notes.push(
          `Array item at bit ${layout.totalBits} (${count}×${size} bits) — values are usage indices, shown raw.`,
        );
      }
      for (let n = 0; n < count; n++) {
        const usage = item.isArray ? (item.usageMinimum ?? slotUsage(item, 0)) : slotUsage(item, n);
        const { page, id } = splitUsage(usage);
        const kind: FieldKind = item.isArray && !item.isConstant ? 'array' : classify(page, id, size, !!item.isConstant);
        layout.fields.push({
          reportId,
          bitOffset: layout.totalBits + n * size,
          bitSize: size,
          usage,
          usagePage: page,
          usageId: id,
          logicalMin: lmin,
          logicalMax: lmax,
          signed: lmin < 0,
          hasNull: !!item.hasNull,
          kind,
          label: kind === 'padding' ? 'Padding' : `${usagePageName(page)} / ${usageName(page, id)}`,
        });
      }
      layout.totalBits += size * count;
    }
  }
  return layouts;
}

/** Extract an unsigned little-endian bit field (HID bit order). Returns NaN if out of range. */
export function readBits(bytes: Uint8Array, bitOffset: number, bitSize: number): number {
  let value = 0;
  for (let i = 0; i < bitSize; i++) {
    const bit = bitOffset + i;
    const byte = bytes[bit >> 3];
    if (byte === undefined) return NaN;
    if ((byte >> (bit & 7)) & 1) value += 2 ** i;
  }
  return value;
}

export function readField(bytes: Uint8Array, field: HidField): number {
  let v = readBits(bytes, field.bitOffset, field.bitSize);
  if (Number.isNaN(v)) return v;
  if (field.signed && field.bitSize > 0 && v >= 2 ** (field.bitSize - 1)) v -= 2 ** field.bitSize;
  return v;
}

export interface ValidationResult {
  ok: boolean;
  expectedBytes: number;
  actualBytes: number;
  message: string;
}

/** `actualBytes` excludes the report-ID byte (as WebHID delivers it). */
export function validateReportLength(layout: HidReportLayout | undefined, actualBytes: number): ValidationResult {
  if (!layout) {
    return { ok: false, expectedBytes: 0, actualBytes, message: 'No descriptor layout for this report ID.' };
  }
  const expectedBytes = Math.ceil(layout.totalBits / 8);
  const ok = expectedBytes === actualBytes;
  return {
    ok,
    expectedBytes,
    actualBytes,
    message: ok
      ? 'Report length matches the descriptor layout.'
      : `Descriptor layout predicts ${expectedBytes} bytes, device sent ${actualBytes}. Decoded values may be misaligned — use the raw byte view.`,
  };
}

export interface DecodedReport {
  axes: RawAxis[];
  buttons: RawButton[];
  hats: RawHat[];
  vendor: { id: string; label: string; value: number }[];
}

/** Decode one input report. `prefix` makes ids unique when several HID interfaces are open. */
export function decodeReport(layout: HidReportLayout, bytes: Uint8Array, prefix = 'hid'): DecodedReport {
  const out: DecodedReport = { axes: [], buttons: [], hats: [], vendor: [] };
  const seen = new Map<string, number>();
  for (const f of layout.fields) {
    if (f.kind === 'padding') continue;
    const value = readField(bytes, f);
    if (Number.isNaN(value)) continue;
    const baseId = `${prefix}:r${f.reportId}:${f.usagePage.toString(16)}:${f.usageId.toString(16)}`;
    const dup = seen.get(baseId) ?? 0;
    seen.set(baseId, dup + 1);
    const id = dup === 0 ? baseId : `${baseId}#${dup}`;
    switch (f.kind) {
      case 'axis':
        out.axes.push({ id, label: dup ? `${f.label} #${dup + 1}` : f.label, value, min: f.logicalMin, max: f.logicalMax });
        break;
      case 'button':
        if (f.usageId === 0) break;
        out.buttons.push({
          id: `${prefix}:btn:${f.usageId}`, index: f.usageId, label: `Button ${f.usageId}`,
          pressed: value !== 0, value: value !== 0 ? 1 : 0,
        });
        break;
      case 'hat': {
        const range = f.logicalMax - f.logicalMin + 1;
        const inRange = value >= f.logicalMin && value <= f.logicalMax;
        const angle = inRange && range > 0 ? ((value - f.logicalMin) * 360) / range : null;
        out.hats.push({ id, label: f.label, value, angle });
        break;
      }
      default:
        out.vendor.push({ id, label: f.label, value });
    }
  }
  return out;
}

export function summarizeDescriptor(collections: DescriptorCollection[]): DescriptorSummary {
  const layouts = buildInputLayouts(collections);
  const pages = new Set<number>();
  let axisCount = 0, buttonCount = 0, hatCount = 0, vendorFieldCount = 0;
  for (const l of layouts.values()) {
    for (const f of l.fields) {
      if (f.kind !== 'padding') pages.add(f.usagePage);
      if (f.kind === 'axis') axisCount++;
      else if (f.kind === 'button') buttonCount++;
      else if (f.kind === 'hat') hatCount++;
      else if (f.kind === 'vendor') vendorFieldCount++;
    }
  }
  const sized = (k: 'outputReports' | 'featureReports') =>
    collectReports(collections, k).map((r) => {
      for (const it of r.items ?? []) for (const u of it.usages ?? []) pages.add(splitUsage(u).page);
      return { reportId: r.reportId ?? 0, bytes: Math.ceil(reportBits(r) / 8) };
    });
  const outputReports = sized('outputReports');
  const featureReports = sized('featureReports');
  const top = collections[0];
  const walkPages = (c: DescriptorCollection) => {
    if (c.usagePage !== undefined) pages.add(c.usagePage);
    (c.children ?? []).forEach(walkPages);
  };
  collections.forEach(walkPages);
  return {
    topLevelUsage: top ? `${usagePageName(top.usagePage ?? 0)} / ${usageName(top.usagePage ?? 0, top.usage ?? 0)}` : 'none',
    inputReports: [...layouts.values()].map((l) => ({
      reportId: l.reportId, bytes: Math.ceil(l.totalBits / 8), fieldCount: l.fields.filter((f) => f.kind !== 'padding').length,
    })),
    outputReports,
    featureReports,
    axisCount, buttonCount, hatCount, vendorFieldCount,
    hasPidPage: pages.has(USAGE_PAGE.PID),
    usagePages: [...pages].sort((a, b) => a - b).map(usagePageName),
  };
}
