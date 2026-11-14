import type { PedalCalibration, RawAxis, RawFrame } from '../core/types';
import { pct } from './ui';

export function SteeringWheel({ value, rotationDegrees, simulated }: { value: number | null; rotationDegrees: number; simulated: boolean }) {
  const angle = (value ?? 0) * (rotationDegrees / 2);
  const left = value !== null && value < 0;
  const fillLeft = value === null ? 50 : left ? 50 + value * 50 : 50;
  const fillWidth = value === null ? 0 : Math.abs(value) * 50;
  return (
    <div className="wheel-wrap">
      <svg className="wheel-svg" viewBox="-110 -110 220 220" aria-label="Steering wheel visualisation">
        <defs>
          <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a414c" />
            <stop offset="1" stopColor="#14171c" />
          </linearGradient>
        </defs>
        {/* fixed scale */}
        {Array.from({ length: 19 }, (_, i) => {
          const a = ((-90 + i * 10 - 90) * Math.PI) / 180;
          return <line key={i} x1={Math.cos(a) * 104} y1={Math.sin(a) * 104} x2={Math.cos(a) * (i % 9 === 0 ? 96 : 100)} y2={Math.sin(a) * (i % 9 === 0 ? 96 : 100)} stroke={i === 9 ? '#ff3b30' : '#3a4352'} strokeWidth={i % 9 === 0 ? 2.5 : 1.2} />;
        })}
        <g transform={`rotate(${angle})`} style={{ transition: 'transform 0.02s linear' }}>
          <circle r="86" fill="none" stroke="url(#rim)" strokeWidth="16" />
          <circle r="86" fill="none" stroke="#000" strokeOpacity="0.5" strokeWidth="1" />
          <path d="M -14 -86 L 14 -86" stroke="#ff3b30" strokeWidth="16" />
          <path d="M -78 8 Q -40 2 -24 14 L -18 34 Q 0 44 18 34 L 24 14 Q 40 2 78 8 L 80 24 Q 40 22 26 44 L 14 76 L -14 76 L -26 44 Q -40 22 -80 24 Z" fill="#20252d" stroke="#3a4352" />
          <circle r="22" fill="#14171c" stroke="#3a4352" />
          <text y="2" textAnchor="middle" dominantBaseline="middle" fill="#8b95a5" fontSize="9" fontWeight="800">G923</text>
        </g>
      </svg>
      <div className="readout">
        {pct(value, true)}
        <small>{value === null ? 'no steering axis assigned' : `${angle >= 0 ? '+' : ''}${angle.toFixed(0)}°`}{simulated ? ' · SIMULATED' : ''}</small>
      </div>
      <div className="steer-bar">
        <div className="fill" style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }} />
        <div className="mid" />
      </div>
      <div className="row small muted" style={{ justifyContent: 'space-between', width: '100%' }}>
        <span>−100% (left)</span>
        <span>0</span>
        <span>+100% (right)</span>
      </div>
    </div>
  );
}

const PEDAL_COLORS: Record<string, string> = {
  Clutch: 'linear-gradient(0deg, #6d5bd0, #a78bfa)',
  Brake: 'linear-gradient(0deg, #b3150d, #ff3b30)',
  Accelerator: 'linear-gradient(0deg, #1f8f3e, #30d158)',
};

export function Pedal({ name, value, raw, cal }: { name: string; value: number | null; raw: number | null; cal?: PedalCalibration }) {
  return (
    <div className={`pedal ${value === null ? 'unmapped' : ''}`}>
      <div className="val">{pct(value)}</div>
      <div className="track">
        <div className="ticks" />
        <div className="fill" style={{ height: `${(value ?? 0) * 100}%`, background: PEDAL_COLORS[name] }} />
      </div>
      <div className="name">{name}</div>
      <div className="raw">
        {value === null ? 'not assigned' : `raw ${raw ?? '—'}`}
        {cal && <><br />{cal.released}→{cal.pressed}</>}
      </div>
    </div>
  );
}

export function AxisList({ frame, assigned, moved }: { frame: RawFrame | null; assigned: Record<string, string>; moved: string[] }) {
  if (!frame || frame.axes.length === 0) return <p className="muted small">No axes reported yet.</p>;
  return (
    <div>
      {frame.axes.map((a: RawAxis) => {
        const span = a.max - a.min || 1;
        const frac = Math.min(1, Math.max(0, (a.value - a.min) / span));
        return (
          <div className="axis-row" key={a.id}>
            <div>
              <div style={{ fontWeight: 650 }}>{a.label}</div>
              <div className="mono dim" style={{ fontSize: 11 }}>
                {a.id} · range {a.min}…{a.max}
              </div>
              <div className="row" style={{ gap: 4, marginTop: 2 }}>
                {assigned[a.id] && <span className="tag ok">{assigned[a.id]}</span>}
                {moved.includes(a.id) && <span className="tag info">moved</span>}
              </div>
            </div>
            <div className="bar">
              <div style={{ width: `${frac * 100}%` }} />
            </div>
            <div className="v">{Number.isInteger(a.value) ? a.value : a.value.toFixed(4)}</div>
          </div>
        );
      })}
    </div>
  );
}
