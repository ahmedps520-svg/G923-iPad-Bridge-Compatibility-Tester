import { useEffect, useRef, useState } from 'react';
import { WheelDiagram } from '../components/WheelDiagram';
import { Card, Notice, SimTag } from '../components/ui';
import { PHYSICAL_BUTTON_LABELS, type PhysicalButtonId } from '../core/types';
import { app, updateProfile, useLive } from '../state/app';
import { buttonLog, log, useRing } from '../state/logs';
import { useStore } from '../state/store';

const EMPTY: string[] = [];

export function Buttons() {
  const { frame, state, profile, simulated } = useLive();
  const seen = useStore(app, (s) => (frame ? s.seenButtons[frame.deviceKey] ?? EMPTY : EMPTY));
  const events = useRing(buttonLog, 15);
  const [learning, setLearning] = useState<PhysicalButtonId | null>(null);
  const baseline = useRef<Set<string>>(new Set());

  // Learn mode: the first raw button that becomes pressed after selecting a control is mapped to it.
  useEffect(() => {
    if (!learning || !frame || !profile) return;
    const newly = frame.buttons.find((b) => b.pressed && !baseline.current.has(b.id));
    if (newly) {
      updateProfile(frame.deviceKey, (p) => {
        const buttonMap = Object.fromEntries(Object.entries(p.buttonMap).filter(([, v]) => v !== learning));
        buttonMap[newly.id] = learning;
        return { ...p, buttonMap };
      });
      log('success', 'button', `Mapped ${newly.id} → ${PHYSICAL_BUTTON_LABELS[learning]}`);
      setLearning(null);
    }
    for (const b of frame.buttons) if (!b.pressed) baseline.current.delete(b.id);
  });

  const startLearning = (id: PhysicalButtonId) => {
    if (!frame) return;
    baseline.current = new Set(frame.buttons.filter((b) => b.pressed).map((b) => b.id));
    setLearning((cur) => (cur === id ? null : id));
  };

  const mapped = new Set(Object.values(profile?.buttonMap ?? {}));
  const reverse: Record<string, PhysicalButtonId> = profile?.buttonMap ?? {};

  return (
    <div className="grid g2">
      <Card title="G923 button diagram" className="span2" right={simulated ? <SimTag /> : null}>
        {!frame && <Notice kind="info">No device is reporting buttons. Connect the wheel first.</Notice>}
        <WheelDiagram pressed={state?.buttons ?? {}} mapped={mapped} learning={learning} onSelect={startLearning} />
        <p className="small muted" style={{ textAlign: 'center' }}>
          {learning
            ? <><b style={{ color: 'var(--amber)' }}>Learning {PHYSICAL_BUTTON_LABELS[learning]}:</b> press that button on the wheel now (tap the control again to cancel).</>
            : 'Tap a control on the diagram, then press the same button on the wheel to teach the mapping. Highlighted green outline = mapped. Positions are schematic. The first hat switch is shown on the D-pad (standard HID convention) — confirm it by pressing the D-pad.'}
        </p>
      </Card>

      <Card title="Raw buttons reported by the device" right={simulated ? <SimTag /> : null}>
        {frame && frame.buttons.length === 0 && <p className="muted">This source reports no buttons.</p>}
        <div className="btn-grid">
          {frame?.buttons.map((b) => (
            <div key={b.id} className={`rbtn ${b.pressed ? 'on' : ''} ${seen.includes(b.id) ? 'seen' : ''}`} title={b.id}>
              {b.label}
              {b.value > 0 && b.value < 1 && <> ({b.value.toFixed(2)})</>}
              <span className="phys">{reverse[b.id] ? PHYSICAL_BUTTON_LABELS[reverse[b.id]] : 'unmapped'}</span>
            </div>
          ))}
        </div>
        <p className="small dim">Green outline = pressed at least once during this session. Identifiers come from the device descriptor / browser, not from assumptions.</p>
        {profile && Object.keys(profile.buttonMap).length > 0 && (
          <button className="btn sm" onClick={() => updateProfile(profile.deviceKey, (p) => ({ ...p, buttonMap: {} }))}>Clear all button mappings</button>
        )}
      </Card>

      <Card title="Input event log" right={<button className="btn sm ghost" onClick={() => buttonLog.clear()}>Clear</button>}>
        <div className="scroll">
          <table className="table">
            <thead>
              <tr><th>Time</th><th>Identifier</th><th>Control</th><th>State</th></tr>
            </thead>
            <tbody>
              {[...events].reverse().slice(0, 200).map((e, i) => (
                <tr key={i}>
                  <td className="mono">{new Date(e.t).toLocaleTimeString()}.{String(e.t % 1000).padStart(3, '0')}</td>
                  <td className="mono">{e.buttonId}{e.simulated && <> <SimTag /></>}</td>
                  <td>{e.physical ?? <span className="dim">unmapped</span>}</td>
                  <td>{e.pressed ? <span className="tag ok">pressed</span> : <span className="tag info">released</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {events.length === 0 && <p className="muted small" style={{ padding: 10 }}>No button events yet.</p>}
        </div>
      </Card>
    </div>
  );
}
