import { useState } from 'react';
import { Card, downloadJson } from '../components/ui';
import { buildInputLayouts } from '../core/hidReportParser';
import { hex } from '../core/hidUsages';
import { app, hid } from '../state/app';
import { eventLog, rawReportLog, useRing, type LogCategory } from '../state/logs';
import { useStore } from '../state/store';

const toHex = (b: Uint8Array) => Array.from(b, (x) => hex(x)).join(' ');

/** Shows the latest bytes for each report and highlights bytes that changed recently. */
function ByteView() {
  const reports = useRing(rawReportLog, 20);
  const latest = new Map<string, { bytes: Uint8Array; changed: Set<number> }>();
  const cutoff = performance.now() - 600;
  for (const r of reports) {
    const k = `${r.device} · report ${r.reportId}`;
    const prev = latest.get(k);
    const changed = prev?.changed ?? new Set<number>();
    if (prev && r.t >= cutoff) r.bytes.forEach((b, i) => { if (prev.bytes[i] !== b) changed.add(i); });
    latest.set(k, { bytes: r.bytes, changed });
  }
  if (latest.size === 0) return <p className="muted small">No raw input reports received yet (WebHID only).</p>;
  return (
    <div className="stack">
      {[...latest.entries()].map(([k, v]) => (
        <div key={k}>
          <div className="small mono muted">{k} · {v.bytes.length} bytes</div>
          <div className="hexbytes">
            {Array.from(v.bytes).map((b, i) => (
              <span key={i} className={v.changed.has(i) ? 'chg' : ''}>
                {hex(b)}
                <i>{i}</i>
              </span>
            ))}
          </div>
        </div>
      ))}
      <p className="small dim">Highlighted bytes changed in the last 0.6 s — move one control at a time to locate it in the report.</p>
    </div>
  );
}

function DescriptorView() {
  const key = useStore(app, (s) => s.activeHidKey);
  if (!key) return <p className="muted small">No HID device open.</p>;
  const devices = hid.rawDevices(key);
  return (
    <div className="stack">
      {devices.map((d, i) => {
        const layouts = buildInputLayouts(d.collections);
        return (
          <div key={i}>
            <div className="small"><b>Interface {i}</b> · {d.collections.length} top-level collection(s)</div>
            {[...layouts.values()].map((l) => (
              <div key={l.reportId} className="scroll" style={{ marginTop: 6 }}>
                <table className="table">
                  <thead>
                    <tr><th colSpan={5}>Input report {l.reportId} · {l.totalBits} bits ({Math.ceil(l.totalBits / 8)} bytes)</th></tr>
                    <tr><th>Bit</th><th>Size</th><th>Kind</th><th>Usage</th><th>Logical range</th></tr>
                  </thead>
                  <tbody>
                    {l.fields.map((f, j) => (
                      <tr key={j} className={f.kind === 'padding' ? 'dim' : ''}>
                        <td className="mono">{f.bitOffset}</td>
                        <td className="mono">{f.bitSize}</td>
                        <td>{f.kind}</td>
                        <td>{f.label}</td>
                        <td className="mono">{f.logicalMin}…{f.logicalMax}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {l.notes.map((n) => <p key={n} className="small dim">{n}</p>)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function DevConsole() {
  const events = useRing(eventLog, 8);
  const reports = useRing(rawReportLog, 8);
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState<typeof reports>([]);
  const [filter, setFilter] = useState<LogCategory | 'all'>('all');
  const shownReports = paused ? frozen : reports;

  return (
    <div className="grid g2">
      <Card title="Live byte view (WebHID input reports)" className="span2">
        <ByteView />
      </Card>

      <Card
        title="Raw input report log"
        right={
          <div className="row">
            <button className="btn sm" onClick={() => { setFrozen([...reports]); setPaused(!paused); }}>{paused ? 'Resume' : 'Pause'}</button>
            <button className="btn sm" onClick={() => downloadJson(`g923-raw-reports-${Date.now()}.json`, reports.map((r) => ({ t: r.t, device: r.device, reportId: r.reportId, hex: toHex(r.bytes) })))}>Export</button>
            <button className="btn sm ghost" onClick={() => rawReportLog.clear()}>Clear</button>
          </div>
        }
      >
        <div className="console">
          {shownReports.length === 0 && <div className="l-info">No raw reports. On iPadOS Safari this stays empty because WebHID is unavailable.</div>}
          {shownReports.slice(-300).map((r, i) => (
            <div key={i} className="l-info">
              {r.t.toFixed(1).padStart(10)} ms  id={r.reportId}  [{r.bytes.length}]  {toHex(r.bytes)}
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Event log"
        right={
          <div className="row">
            <select value={filter} onChange={(e) => setFilter(e.target.value as LogCategory | 'all')}>
              {['all', 'system', 'connection', 'hid', 'usb', 'gamepad', 'button', 'ffb', 'calibration'].map((c) => <option key={c}>{c}</option>)}
            </select>
            <button className="btn sm ghost" onClick={() => eventLog.clear()}>Clear</button>
          </div>
        }
      >
        <div className="console">
          {events.filter((e) => filter === 'all' || e.category === filter).slice(-400).map((e, i) => (
            <div key={i} className={`l-${e.level}`}>
              {new Date(e.t).toLocaleTimeString()} [{e.category}] {e.message}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Decoded HID descriptor layout" className="span2">
        <DescriptorView />
      </Card>
    </div>
  );
}
