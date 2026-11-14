import { useState } from 'react';
import { Card, Notice, SimTag, pct } from '../components/ui';
import {
  CALIBRATION_STEPS, applyCalibration, rankMovement, snapshot, solveCalibration,
  type CalibrationResult, type CalibrationStepId, type Snapshot,
} from '../core/calibration';
import type { ProcessingSettings } from '../core/types';
import { resetProfile, updateProfile, useLive } from '../state/app';
import { log } from '../state/logs';

const f = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(4));

export function Calibration() {
  const { frame, state, profile, simulated } = useLive();
  const [stepIdx, setStepIdx] = useState(0);
  const [snaps, setSnaps] = useState<Partial<Record<CalibrationStepId, Snapshot>>>({});
  const [result, setResult] = useState<CalibrationResult | null>(null);

  const step = CALIBRATION_STEPS[stepIdx];
  const done = stepIdx >= CALIBRATION_STEPS.length;

  const capture = () => {
    if (!frame || !step) return;
    const next = { ...snaps, [step.id]: snapshot(frame) };
    setSnaps(next);
    setStepIdx(stepIdx + 1);
    if (stepIdx + 1 >= CALIBRATION_STEPS.length) finish(next);
  };
  const skip = () => {
    if (stepIdx + 1 >= CALIBRATION_STEPS.length) finish(snaps);
    setStepIdx(stepIdx + 1);
  };
  const finish = (all: Partial<Record<CalibrationStepId, Snapshot>>) => {
    if (!frame || !profile) return;
    const r = solveCalibration(all, frame);
    setResult(r);
    updateProfile(frame.deviceKey, (p) => applyCalibration(p, r));
    log(r.warnings.length ? 'warn' : 'success', 'calibration', `Calibration saved for ${frame.deviceKey}${r.warnings.length ? ` with warnings: ${r.warnings.join(' ')}` : ''}`, r);
  };
  const restart = () => {
    setSnaps({});
    setStepIdx(0);
    setResult(null);
  };

  // Live hint: which axis is moving most relative to the previous captured step.
  const prevSnap = stepIdx > 0 ? snaps[CALIBRATION_STEPS[stepIdx - 1].id] : undefined;
  const hint = frame && prevSnap ? rankMovement(prevSnap, snapshot(frame), frame)[0] : undefined;

  const setSetting = <K extends keyof ProcessingSettings>(k: K, v: ProcessingSettings[K]) => {
    if (profile) updateProfile(profile.deviceKey, (p) => ({ ...p, settings: { ...p.settings, [k]: v } }));
  };

  return (
    <div className="grid g2">
      <Card title="Calibration wizard" right={simulated ? <SimTag /> : null}>
        {!frame ? (
          <Notice kind="info" title="No device">Connect the wheel (or start the labelled simulation) before calibrating.</Notice>
        ) : (
          <>
            <p className="small muted">
              Device: <span className="mono">{frame.deviceKey}</span>. Each step records every axis; the axis that moves the most is
              assigned automatically — no axis numbering is assumed.
            </p>
            <ol className="steps">
              {CALIBRATION_STEPS.map((st, i) => (
                <li key={st.id} className={i < stepIdx ? 'done' : i === stepIdx ? 'current' : ''}>
                  <span className="n">{i < stepIdx ? '✓' : i + 1}</span>
                  <span style={{ flex: 1 }}>
                    <b>{st.title}</b>
                    {i === stepIdx && <div className="small muted">{st.instruction}</div>}
                  </span>
                  {snaps[st.id] === undefined && i < stepIdx && <span className="tag info">skipped</span>}
                </li>
              ))}
            </ol>
            {!done && (
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn primary" onClick={capture}>Capture “{step.title}”</button>
                {(step.optional || stepIdx > 2) && <button className="btn" onClick={skip}>Skip</button>}
                <button className="btn ghost" onClick={restart}>Restart</button>
              </div>
            )}
            {hint && !done && (
              <p className="small mono dim">Most-moved axis since last step: {hint.axisId} ({(hint.relative * 100).toFixed(0)}% of range)</p>
            )}
            {done && (
              <div className="stack" style={{ marginTop: 12 }}>
                {result && result.warnings.length > 0 ? (
                  <Notice kind="warn" title="Calibration saved with warnings">
                    <ul>{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                  </Notice>
                ) : (
                  <Notice kind="ok" title="Calibration saved locally">Stored in this browser's local storage for {frame.deviceKey}.</Notice>
                )}
                <button className="btn" onClick={restart}>Calibrate again</button>
              </div>
            )}
          </>
        )}
      </Card>

      <Card title="Current calibration & processing">
        {!profile ? (
          <p className="muted">No profile yet.</p>
        ) : (
          <div className="stack">
            <p>
              Status: {profile.confirmed ? <span className="tag ok">calibrated</span> : <span className="tag warn">unconfirmed defaults</span>}
              {profile.calibratedAt && <span className="small dim"> · {new Date(profile.calibratedAt).toLocaleString()}</span>}
            </p>
            <dl className="kv small">
              <dt>Steering</dt>
              <dd className="mono">{profile.steering ? `${profile.steering.axisId}  L ${f(profile.steering.left)} · C ${f(profile.steering.center)} · R ${f(profile.steering.right)}` : '—'}</dd>
              <dt>Accelerator</dt>
              <dd className="mono">{profile.throttle ? `${profile.throttle.axisId}  ${f(profile.throttle.released)} → ${f(profile.throttle.pressed)}` : '—'}</dd>
              <dt>Brake</dt>
              <dd className="mono">{profile.brake ? `${profile.brake.axisId}  ${f(profile.brake.released)} → ${f(profile.brake.pressed)}` : '—'}</dd>
              <dt>Clutch</dt>
              <dd className="mono">{profile.clutch ? `${profile.clutch.axisId}  ${f(profile.clutch.released)} → ${f(profile.clutch.pressed)}` : '—'}</dd>
              <dt>Live output</dt>
              <dd className="mono">S {pct(state?.steering ?? null, true)} · A {pct(state?.throttle ?? null)} · B {pct(state?.brake ?? null)} · C {pct(state?.clutch ?? null)}</dd>
            </dl>
            <label className="field">Steering dead-zone: {(profile.settings.steeringDeadzone * 100).toFixed(0)}%
              <input type="range" min={0} max={0.2} step={0.005} value={profile.settings.steeringDeadzone} onChange={(e) => setSetting('steeringDeadzone', Number(e.target.value))} />
            </label>
            <label className="field">Pedal dead-zone (released end): {(profile.settings.pedalDeadzone * 100).toFixed(0)}%
              <input type="range" min={0} max={0.2} step={0.005} value={profile.settings.pedalDeadzone} onChange={(e) => setSetting('pedalDeadzone', Number(e.target.value))} />
            </label>
            <label className="field">Pedal saturation (pressed end): {(profile.settings.pedalSaturation * 100).toFixed(0)}%
              <input type="range" min={0} max={0.2} step={0.005} value={profile.settings.pedalSaturation} onChange={(e) => setSetting('pedalSaturation', Number(e.target.value))} />
            </label>
            <label className="field">Input smoothing: {(profile.settings.smoothing * 100).toFixed(0)}%
              <input type="range" min={0} max={0.9} step={0.05} value={profile.settings.smoothing} onChange={(e) => setSetting('smoothing', Number(e.target.value))} />
            </label>
            <label className="field">Wheel graphic rotation (display only): {profile.settings.rotationDegrees}°
              <input type="range" min={180} max={1080} step={10} value={profile.settings.rotationDegrees} onChange={(e) => setSetting('rotationDegrees', Number(e.target.value))} />
            </label>
            <label className="check">
              <input type="checkbox" checked={profile.settings.invertSteering} onChange={(e) => setSetting('invertSteering', e.target.checked)} /> Invert steering
            </label>
            <div className="row">
              <button className="btn sm" onClick={() => resetProfile(profile.deviceKey)}>Reset profile to defaults</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
