import { useEffect, useState } from 'react';
import { StatusPill } from './components/ui';
import { emergencyStop } from './platform/forceFeedback';
import { Bridge } from './pages/Bridge';
import { Buttons } from './pages/Buttons';
import { Calibration } from './pages/Calibration';
import { Dashboard } from './pages/Dashboard';
import { DevConsole } from './pages/DevConsole';
import { Diagnostics } from './pages/Diagnostics';
import { ForceFeedback } from './pages/ForceFeedback';
import { app, hardwareStatus, initialize, setSimulation } from './state/app';
import { useStore } from './state/store';

const TABS = [
  ['dashboard', 'Dashboard', Dashboard],
  ['buttons', 'Button Tester', Buttons],
  ['ffb', 'Force Feedback', ForceFeedback],
  ['calibration', 'Calibration', Calibration],
  ['diagnostics', 'Diagnostics', Diagnostics],
  ['console', 'Developer Console', DevConsole],
  ['bridge', 'Bridge Options', Bridge],
] as const;
type TabId = (typeof TABS)[number][0];

function readTab(): TabId {
  const h = location.hash.replace('#', '');
  return (TABS.find((t) => t[0] === h)?.[0] ?? 'dashboard') as TabId;
}

export function App() {
  const [tab, setTab] = useState<TabId>(readTab);
  const s = useStore(app, (x) => x);
  const status = hardwareStatus(s);

  useEffect(() => {
    void initialize();
    const onHash = () => setTab(readTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (id: TabId) => {
    location.hash = id;
    setTab(id);
  };
  const Page = TABS.find((t) => t[0] === tab)![2];

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <svg className="logo" viewBox="0 0 64 64" aria-hidden>
            <circle cx="32" cy="32" r="25" fill="none" stroke="#ff3b30" strokeWidth="7" />
            <path d="M8 36 Q32 26 56 36" stroke="#ff3b30" strokeWidth="6" fill="none" />
            <circle cx="32" cy="36" r="6" fill="#e8ebf0" />
          </svg>
          <div>
            G923 iPad Bridge
            <small>Compatibility Tester</small>
          </div>
        </div>
        <StatusPill status={status.status} />
        {s.simulation && <span className="pill sim"><span className="dot" /> Simulation running</span>}
        <div className="spacer" />
        <label className="check small" title="Synthetic demo data — never used in hardware testing">
          <input type="checkbox" checked={s.simulation} onChange={(e) => setSimulation(e.target.checked)} />
          Simulation demo
        </label>
        <button className="estop" onClick={() => void emergencyStop('user')} aria-label="Emergency stop force feedback">■ STOP</button>
      </header>
      {s.simulation && (
        <div className="sim-banner" role="alert">
          <span>SIMULATED DEMONSTRATION — NOT REAL HARDWARE DATA</span>
        </div>
      )}
      <nav className="tabs" aria-label="Sections">
        {TABS.map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => go(id)}>
            {label}
          </button>
        ))}
      </nav>
      <main>
        <Page />
      </main>
    </div>
  );
}
