import { useState } from 'react';
import { Card, Notice } from '../components/ui';
import { summarizeDescriptor } from '../core/hidReportParser';
import { MAX_DURATION_MS, MAX_MAGNITUDE, assessForceFeedback, emergencyStop, playSafeRumble } from '../platform/forceFeedback';
import { app, gamepad, hid } from '../state/app';
import { errorMessage } from '../state/logs';
import { useStore } from '../state/store';

export function ForceFeedback() {
  const s = useStore(app, (x) => x);
  const [strength, setStrength] = useState(0.1);
  const [duration, setDuration] = useState(250);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const gp = gamepad.selected();
  const hidSummaries = s.activeHidKey ? hid.rawDevices(s.activeHidKey).map((d) => summarizeDescriptor(d.collections)) : [];
  const report = assessForceFeedback(gp, hidSummaries, s.caps.hid);

  const test = async () => {
    if (!gp) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(`Effect completed: ${await playSafeRumble(gp, strength, duration)}`);
    } catch (e) {
      setResult(`Failed: ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid g2">
      <Card title="Emergency stop" className="span2">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <p className="muted" style={{ maxWidth: 720 }}>
            Immediately calls <code>vibrationActuator.reset()</code> on every connected gamepad and cancels pending effects. This app
            never sends HID output reports, so there is no other motor command to cancel. If the wheel ever moves unexpectedly,
            also <b>unplug the wheel's power adapter</b>.
          </p>
          <button className="estop big" onClick={() => void emergencyStop('user')}>■ STOP</button>
        </div>
      </Card>

      <Card title="Force feedback availability">
        <div className="verdict" style={{ color: report.steeringTorqueAccessible ? 'var(--green)' : 'var(--red)' }}>
          Steering torque: {report.steeringTorqueAccessible ? 'accessible' : 'NOT accessible'}
        </div>
        <p className="muted">{report.verdict}</p>
        <h3>Gamepad API rumble</h3>
        <p>
          <span className={`tag ${report.gamepadRumble.available ? 'ok' : 'no'}`}>{report.gamepadRumble.available ? 'available' : 'unavailable'}</span>{' '}
          <span className="small">{report.gamepadRumble.detail}</span>
        </p>
        {report.gamepadRumble.effects.length > 0 && <p className="small mono">Effects: {report.gamepadRumble.effects.join(', ')}</p>}
        <h3>WebHID output / PID</h3>
        <p>
          <span className={`tag ${report.hidOutput.pidPage ? 'warn' : 'no'}`}>{report.hidOutput.pidPage ? 'PID page found' : 'no standard FFB'}</span>{' '}
          <span className="small">{report.hidOutput.detail}</span>
        </p>
      </Card>

      <Card title="Safe low-strength test">
        {!report.gamepadRumble.available ? (
          <Notice kind="warn" title="No appropriate API">
            No documented force-feedback API is exposed for the connected device, so no test can be sent. This is the expected result
            on iPadOS Safari (no WebHID; the G923 is not exposed through the Gamepad API).
          </Notice>
        ) : (
          <div className="stack">
            <label className="field">
              Strength: {(strength * 100).toFixed(0)}% (hard limit {MAX_MAGNITUDE * 100}%)
              <input type="range" min={0.02} max={MAX_MAGNITUDE} step={0.01} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
            </label>
            <label className="field">
              Duration: {duration} ms (hard limit {MAX_DURATION_MS} ms)
              <input type="range" min={50} max={MAX_DURATION_MS} step={10} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </label>
            <div className="row">
              <button className="btn primary" disabled={busy} onClick={() => void test()}>Play rumble test</button>
              <button className="estop" onClick={() => void emergencyStop('user')}>STOP</button>
            </div>
            {result && <p className="mono small">{result}</p>}
            <p className="small dim">Uses only the W3C Gamepad <code>playEffect()</code> API. Rumble is not the same as steering-motor force feedback.</p>
          </div>
        )}
      </Card>

      <Card title="Safety policy" className="span2">
        <ul className="small">
          <li>No undocumented or reverse-engineered Logitech force-feedback commands are included or sent.</li>
          <li>No WebHID <code>sendReport()</code> / <code>sendFeatureReport()</code> calls exist in this codebase.</li>
          <li>Rumble magnitude is clamped to {MAX_MAGNITUDE * 100}% and duration to {MAX_DURATION_MS} ms in code, regardless of UI input, and is auto-reset after each test.</li>
          <li>The global STOP button in the header is always available.</li>
        </ul>
      </Card>
    </div>
  );
}
