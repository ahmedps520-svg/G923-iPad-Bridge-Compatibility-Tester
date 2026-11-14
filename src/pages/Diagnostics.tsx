import { useMemo, useState } from 'react';
import { Card, downloadJson } from '../components/ui';
import { app } from '../state/app';
import { buildDiagnosticReport, computeStages, type StageResult } from '../state/diagnostics';
import { useStore } from '../state/store';
import { CapabilitiesCard } from './Dashboard';

const TAG: Record<StageResult, string> = { pass: 'ok', fail: 'no', partial: 'warn', pending: 'info', 'n/a': 'info' };

export function Diagnostics() {
  // Re-render whenever app state changes (1 Hz stats tick included).
  const s = useStore(app, (x) => x);
  const stages = computeStages();
  const report = useMemo(() => buildDiagnosticReport(), [s]);
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(report, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="grid g2">
      <Card title="What actually works here — stage results" className="span2">
        <div className="stack">
          {stages.map((st) => (
            <div className="stage" key={st.n}>
              <div className="num">{st.n}</div>
              <div>
                <b>{st.title}</b>
                <div className="small muted">{st.detail}</div>
              </div>
              <span className={`tag ${TAG[st.result]}`}>{st.result}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Device & browser">
        <dl className="kv small">
          <dt>Device model</dt><dd>{report.device.model}</dd>
          <dt>iPad detected</dt><dd>{String(report.device.iPadDetected)} — {report.device.iPadDetection}</dd>
          <dt>OS version</dt><dd>{report.device.osVersion}<div className="dim">{report.device.osVersionSource}</div></dd>
          <dt>GPU</dt><dd>{report.device.gpu ?? 'not exposed'}</dd>
          <dt>Screen</dt><dd>{report.device.screen} @ {report.device.devicePixelRatio}x</dd>
          <dt>Browser</dt><dd>{report.browser.name}</dd>
          <dt>Engine</dt><dd>{report.browser.engine}</dd>
          <dt>User agent</dt><dd className="mono">{report.browser.userAgent}</dd>
          <dt>Detected axes</dt><dd>{report.inputs?.axes.length ?? 0}</dd>
          <dt>Detected buttons</dt><dd>{report.inputs?.buttons.length ?? 0}</dd>
          <dt>Force feedback</dt><dd>{report.forceFeedback.verdict}</dd>
        </dl>
      </Card>

      <CapabilitiesCard />

      <Card
        title="Diagnostic report (JSON)"
        className="span2"
        right={
          <div className="row">
            <button className="btn sm" onClick={() => void copy()}>{copied ? 'Copied ✓' : 'Copy'}</button>
            <button className="btn sm primary" onClick={() => downloadJson(`g923-diagnostics-${Date.now()}.json`, report)}>Export JSON</button>
          </div>
        }
      >
        <p className="small muted">Serial numbers are never included. The report contains your browser's user-agent string.</p>
        <pre className="json">{json}</pre>
      </Card>
    </div>
  );
}
