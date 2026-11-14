import type { ReactNode } from 'react';
import type { CapStatus } from '../platform/capabilities';
import type { HardwareStatus } from '../state/app';

export function Card({ title, children, className = '', right }: { title: string; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      <h2>
        <span className="accent" />
        <span style={{ flex: 1 }}>{title}</span>
        {right}
      </h2>
      {children}
    </section>
  );
}

const STATUS_LABEL: Record<HardwareStatus, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  unsupported: 'Unsupported',
};

export function StatusPill({ status }: { status: HardwareStatus }) {
  return (
    <span className={`pill ${status}`} role="status">
      <span className="dot" /> {STATUS_LABEL[status]}
    </span>
  );
}

export function CapTag({ status }: { status: CapStatus }) {
  const cls = status === 'available' ? 'ok' : status === 'unknown' ? 'info' : status === 'blocked' ? 'warn' : 'no';
  return <span className={`tag ${cls}`}>{status}</span>;
}

export function Notice({ kind, title, children }: { kind: 'err' | 'warn' | 'info' | 'ok'; title?: string; children: ReactNode }) {
  return (
    <div className={`notice ${kind}`}>
      {title && <b>{title}</b>}
      {children}
    </div>
  );
}

export function SimTag() {
  return <span className="tag sim">Simulated</span>;
}

export const pct = (v: number | null, signed = false) =>
  v === null ? '—' : `${signed && v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
