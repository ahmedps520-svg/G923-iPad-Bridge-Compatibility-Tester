import { PHYSICAL_BUTTON_LABELS, type PhysicalButtonId } from '../core/types';

/**
 * Schematic of the G923 PlayStation-edition wheel face. Positions are
 * approximate and for orientation only. Which HID button number belongs to
 * which control is NOT assumed — the user teaches it via the "learn" mode.
 */
interface Ctl {
  id: PhysicalButtonId;
  x: number;
  y: number;
  shape: 'circle' | 'rect' | 'paddle' | 'pill';
  label: string;
  r?: number;
}

const CONTROLS: Ctl[] = [
  { id: 'paddle_left', x: 58, y: 150, shape: 'paddle', label: '−' },
  { id: 'paddle_right', x: 542, y: 150, shape: 'paddle', label: '+' },
  { id: 'dpad_up', x: 190, y: 152, shape: 'rect', label: '▲' },
  { id: 'dpad_down', x: 190, y: 206, shape: 'rect', label: '▼' },
  { id: 'dpad_left', x: 163, y: 179, shape: 'rect', label: '◀' },
  { id: 'dpad_right', x: 217, y: 179, shape: 'rect', label: '▶' },
  { id: 'share', x: 250, y: 132, shape: 'pill', label: 'SHARE' },
  { id: 'options', x: 350, y: 132, shape: 'pill', label: 'OPTIONS' },
  { id: 'triangle', x: 410, y: 150, shape: 'circle', label: '△' },
  { id: 'circle', x: 438, y: 179, shape: 'circle', label: '○' },
  { id: 'cross', x: 410, y: 208, shape: 'circle', label: '✕' },
  { id: 'square', x: 382, y: 179, shape: 'circle', label: '□' },
  { id: 'l2', x: 158, y: 248, shape: 'circle', label: 'L2' },
  { id: 'l3', x: 205, y: 258, shape: 'circle', label: 'L3' },
  { id: 'r2', x: 442, y: 248, shape: 'circle', label: 'R2' },
  { id: 'r3', x: 395, y: 258, shape: 'circle', label: 'R3' },
  { id: 'ps', x: 300, y: 300, shape: 'circle', label: 'PS', r: 16 },
  { id: 'minus', x: 345, y: 318, shape: 'circle', label: '−', r: 11 },
  { id: 'plus', x: 345, y: 284, shape: 'circle', label: '+', r: 11 },
  { id: 'dial_ccw', x: 378, y: 312, shape: 'circle', label: '↺', r: 11 },
  { id: 'dial_enter', x: 405, y: 300, shape: 'circle', label: '●', r: 13 },
  { id: 'dial_cw', x: 432, y: 312, shape: 'circle', label: '↻', r: 11 },
];

export function WheelDiagram({
  pressed, mapped, learning, onSelect,
}: {
  pressed: Partial<Record<PhysicalButtonId, boolean>>;
  mapped: Set<PhysicalButtonId>;
  learning: PhysicalButtonId | null;
  onSelect: (id: PhysicalButtonId) => void;
}) {
  return (
    <svg className="diagram" viewBox="0 0 600 400" role="group" aria-label="G923 button diagram">
      {/* rim */}
      <circle cx="300" cy="200" r="178" fill="none" stroke="#1d2229" strokeWidth="34" />
      <circle cx="300" cy="200" r="178" fill="none" stroke="#2c333d" strokeWidth="1" />
      <rect x="290" y="5" width="20" height="34" rx="4" fill="#ff3b30" opacity="0.8" />
      {/* hub & spokes */}
      <path d="M 128 135 Q 300 100 472 135 L 470 270 Q 400 290 360 345 L 240 345 Q 200 290 130 270 Z" fill="#14181e" stroke="#2c333d" />
      <text x="300" y="215" style={{ fill: '#5d6675', fontSize: 13, letterSpacing: 3 }}>G923 · PS</text>
      {CONTROLS.map((c) => {
        const on = !!pressed[c.id];
        const cls = `ctl ${on ? 'on' : ''} ${mapped.has(c.id) ? 'mapped' : ''} ${learning === c.id ? 'learning' : ''}`;
        return (
          <g key={c.id} className={cls} onClick={() => onSelect(c.id)} role="button" aria-pressed={on} aria-label={PHYSICAL_BUTTON_LABELS[c.id]}>
            <title>{PHYSICAL_BUTTON_LABELS[c.id]}</title>
            {c.shape === 'circle' && <circle className="shape" cx={c.x} cy={c.y} r={c.r ?? 14} />}
            {c.shape === 'rect' && <rect className="shape" x={c.x - 12} y={c.y - 12} width="24" height="24" rx="4" />}
            {c.shape === 'pill' && <rect className="shape" x={c.x - 30} y={c.y - 10} width="60" height="20" rx="10" />}
            {c.shape === 'paddle' && <rect className="shape" x={c.x - 22} y={c.y - 55} width="44" height="110" rx="18" />}
            <text x={c.x} y={c.y} style={c.shape === 'pill' ? { fontSize: 9 } : undefined}>{c.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
