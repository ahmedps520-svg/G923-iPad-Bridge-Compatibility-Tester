import { AxisList, Pedal, SteeringWheel } from '../components/live';
import { Card, CapTag, Notice, SimTag, StatusPill } from '../components/ui';
import { PHYSICAL_BUTTON_LABELS, type PhysicalButtonId } from '../core/types';
import {
  app, connectHid, connectUsb, hardwareStatus, hid, selectGamepad, setPreferredSource, useLive,
} from '../state/app';
import { useStore } from '../state/store';

const EMPTY: string[] = [];

export function ConnectionCard() {
  const s = useStore(app, (x) => x);
  const st = hardwareStatus(s);
  const { caps } = s;
  return (
    <Card title="Connection status" className="span2" right={<StatusPill status={st.status} />}>
      <dl className="kv">
        <dt>Hardware status</dt>
        <dd><b>{st.status.toUpperCase()}</b> — {st.reason}</dd>
        <dt>Detected device</dt>
        <dd>{st.deviceName ?? <span className="dim">none</span>}</dd>
        <dt>USB vendor ID</dt>
        <dd className="mono">{st.vendorId ?? <span className="dim">not exposed</span>}{st.vendorId === '0x046D' && <span className="tag ok" style={{ marginLeft: 8 }}>Logitech</span>}</dd>
        <dt>USB product ID</dt>
        <dd className="mono">{st.productId ?? <span className="dim">not exposed</span>}</dd>
        <dt>Connection method</dt>
        <dd>{st.method}</dd>
        <dt>Browser</dt>
        <dd>{caps.env.browser} · {caps.env.engine}</dd>
        <dt>Operating system</dt>
        <dd>{caps.env.osVersion}</dd>
        <dt>Report rate</dt>
        <dd className="mono">{s.stats.hz} frames/s · {s.stats.hardwareFrames} real frames total</dd>
      </dl>

      <h3>Connect</h3>
      <div className="row">
        <button className="btn primary" disabled={!caps.hid} onClick={() => void connectHid(false)}>Connect via WebHID (Logitech 0x046D)</button>
        <button className="btn" disabled={!caps.hid} onClick={() => void connectHid(true)}>WebHID: any device</button>
        <button className="btn" disabled={!caps.usb} onClick={() => void connectUsb(false)}>Inspect via WebUSB</button>
      </div>
      {!caps.hid && !caps.usb && (
        <div style={{ marginTop: 12 }}>
          <Notice kind="err" title="Direct USB/HID access is not possible in this browser">
            <code>navigator.hid</code> and <code>navigator.usb</code> are both undefined
            {caps.env.isIOSFamily ? ' — WebKit on iPadOS does not implement WebHID or WebUSB.' : '.'} Only the Gamepad API can
            be tried: press any button on the wheel. If no gamepad appears, iPadOS is not exposing the G923 as a game controller.
            See <b>Bridge Options</b> for approaches that can work.
          </Notice>
        </div>
      )}

      {(s.gamepads.length > 0 || s.hidDevices.length > 0) && (
        <>
          <h3>Input source</h3>
          <div className="row">
            <select value={s.preferredSource} onChange={(e) => setPreferredSource(e.target.value as 'auto')}>
              <option value="auto">Auto (WebHID preferred)</option>
              <option value="webhid">WebHID only</option>
              <option value="gamepad">Gamepad API only</option>
            </select>
            {s.gamepads.length > 0 && (
              <select value={s.selectedGamepad ?? ''} onChange={(e) => selectGamepad(Number(e.target.value))}>
                {s.gamepads.map((g) => (
                  <option key={g.index} value={g.index}>
                    #{g.index} {g.id.slice(0, 60)}
                  </option>
                ))}
              </select>
            )}
            {s.hidDevices.map((d) => (
              <button key={d.key} className="btn sm" onClick={() => void (hid.isOpen(d.key) ? hid.closeDevice(d.key) : hid.openDevice(d.key))}>
                {hid.isOpen(d.key) ? 'Close' : 'Open'} {d.productName}
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

export function CapabilitiesCard({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const caps = useStore(app, (x) => x.caps);
  return (
    <Card title="Browser & OS capabilities" className={className}>
      <ul className="caplist">
        {caps.caps.map((c) => (
          <li key={c.id}>
            <CapTag status={c.status} />
            <div>
              <b>{c.name}</b>
              {!compact && <span className="d">{c.detail}</span>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Dashboard() {
  const { frame, state, profile, simulated } = useLive();
  const moved = useStore(app, (s) => (frame ? s.movedAxes[frame.deviceKey] ?? EMPTY : EMPTY));
  const rawOf = (id?: string) => (id && frame ? frame.axes.find((a) => a.id === id)?.value ?? null : null);
  const assigned: Record<string, string> = {};
  if (profile?.steering) assigned[profile.steering.axisId] = 'steering';
  if (profile?.throttle) assigned[profile.throttle.axisId] = 'accelerator';
  if (profile?.brake) assigned[profile.brake.axisId] = 'brake';
  if (profile?.clutch) assigned[profile.clutch.axisId] = 'clutch';
  const pressed = state ? (Object.entries(state.buttons).filter(([, v]) => v).map(([k]) => k) as PhysicalButtonId[]) : [];

  return (
    <div className="grid g3">
      <ConnectionCard />
      <CapabilitiesCard compact className="md-full" />

      {!frame && (
        <div className="span-all">
          <Notice kind="info" title="No live input">
            Nothing is being received from any real device. Values below stay empty until real input reports arrive — they are
            never filled with placeholder data. (Use the clearly-labelled Simulation toggle in the header for a UI demo.)
          </Notice>
        </div>
      )}
      {profile && !profile.confirmed && frame && (
        <div className="span-all">
          <Notice kind="warn" title={simulated ? 'Simulated data' : 'Axis assignment not yet confirmed'}>
            {simulated
              ? 'These values come from the demonstration generator, not from hardware.'
              : 'Steering/pedal assignment is a best guess from standard HID usages. Run the Calibration page to confirm which axis is which on your wheel.'}
          </Notice>
        </div>
      )}

      <Card title="Steering" right={simulated ? <SimTag /> : null}>
        <SteeringWheel value={state?.steering ?? null} rotationDegrees={profile?.settings.rotationDegrees ?? 900} simulated={simulated} />
        <p className="small dim">Raw: <span className="mono">{rawOf(profile?.steering?.axisId) ?? '—'}</span></p>
      </Card>

      <Card title="Pedals" right={simulated ? <SimTag /> : null}>
        <div className="pedals">
          <Pedal name="Clutch" value={state?.clutch ?? null} raw={rawOf(profile?.clutch?.axisId)} cal={profile?.clutch} />
          <Pedal name="Brake" value={state?.brake ?? null} raw={rawOf(profile?.brake?.axisId)} cal={profile?.brake} />
          <Pedal name="Accelerator" value={state?.throttle ?? null} raw={rawOf(profile?.throttle?.axisId)} cal={profile?.throttle} />
        </div>
      </Card>

      <Card title="Buttons (live)" className="md-full" right={simulated ? <SimTag /> : null}>
        <div className="stack">
          <div className="small muted">Mapped controls pressed:</div>
          <div className="row">
            {pressed.length ? pressed.map((p) => <span key={p} className="tag ok">{PHYSICAL_BUTTON_LABELS[p]}</span>) : <span className="dim small">none</span>}
          </div>
          <div className="small muted">Unmapped raw buttons pressed:</div>
          <div className="row">
            {state?.unmappedPressed.length ? state.unmappedPressed.map((b) => <span key={b} className="tag warn mono">{b}</span>) : <span className="dim small">none</span>}
          </div>
          <div className="small muted">Hat switches:</div>
          <div className="row mono small">
            {frame?.hats.length ? frame.hats.map((h) => <span key={h.id}>{h.label}: {h.angle === null ? 'centre' : `${h.angle}°`} (raw {h.value})</span>) : <span className="dim">none reported</span>}
          </div>
          <div className="small dim">{frame ? `${frame.buttons.length} buttons and ${frame.axes.length} axes reported by the ${frame.source} source.` : ''}</div>
        </div>
      </Card>

      <Card title="All discovered axes (raw)" className="span-all" right={simulated ? <SimTag /> : null}>
        <AxisList frame={frame} assigned={assigned} moved={moved} />
      </Card>
    </div>
  );
}
