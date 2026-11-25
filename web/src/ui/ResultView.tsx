import { useState } from 'react';
import { CATEGORY_LABEL, type CheckResult } from '../ai/types';
import { RiskMeter, VerdictIcon, WhereBadge } from './bits';

export function ResultView(props: {
  result: CheckResult;
  online: boolean;
  deepBusy: boolean;
  familyState: 'none' | 'available' | 'sent' | 'sending';
  onDeepCheck: () => void;
  onAlertFamily: () => void;
  onAgain: () => void;
}) {
  const { result: r, online, deepBusy, familyState } = props;
  const f = r.final;
  const [speaking, setSpeaking] = useState(false);

  function readAloud() {
    if (!('speechSynthesis' in window)) return;
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(
      [f.headline, f.explanation, 'What to do:', ...f.whatToDo, f.howToVerify].filter(Boolean).join('. '),
    );
    u.rate = 0.92;
    u.onend = () => setSpeaking(false);
    speechSynthesis.speak(u);
    setSpeaking(true);
  }

  const sentToCloud = r.ledger.filter((e) => e.sent);

  return (
    <section className="result" aria-live="polite">
      <div className={`card verdict verdict-${f.verdict}`}>
        <div className="verdict-head">
          <VerdictIcon verdict={f.verdict} />
          <div>
            <h1>{f.headline}</h1>
            {f.category !== 'none' && <p className="category">{CATEGORY_LABEL[f.category]}</p>}
          </div>
        </div>
        <RiskMeter score={f.riskScore} />
        <p className="explanation">{f.explanation}</p>
        <div className="row wrap gap">
          <button className="btn btn-ghost" onClick={readAloud}>{speaking ? '⏹ Stop reading' : '🔊 Read this to me'}</button>
          {familyState === 'available' && (
            <button className="btn btn-ghost" onClick={props.onAlertFamily}>👪 Tell my family</button>
          )}
          {familyState === 'sending' && <span className="note">Telling your family…</span>}
          {familyState === 'sent' && <span className="note ok">✓ Your family was told (no personal details shared)</span>}
        </div>
      </div>

      {r.deepPending === 'offline' && (
        <div className="card notice">
          <strong>Checked privately while offline.</strong> An expert double-check will run automatically when you're back online.
        </div>
      )}
      {(r.deepPending === 'below_threshold' || r.deepPending === 'error') && (
        <div className="card notice">
          {r.deepPending === 'error' ? 'The expert double-check could not run. ' : 'This was checked privately on your device. '}
          Want a second opinion? Only the version with your details hidden is sent.
          <div>
            <button className="btn btn-secondary" disabled={!online || deepBusy} onClick={props.onDeepCheck}>
              {deepBusy ? 'Double-checking…' : online ? 'Get an expert double-check' : 'Connect to the internet to double-check'}
            </button>
          </div>
        </div>
      )}

      {f.redFlags.length > 0 && (
        <div className="card">
          <h2>Warning signs we found</h2>
          <ul className="flags">
            {f.redFlags.map((fl, i) => (
              <li key={i}>
                <strong>{fl.signal}</strong>
                {fl.why && <span> — {fl.why}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>What to do now</h2>
        <ol className="steps">
          {f.whatToDo.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        {f.howToVerify && (
          <p className="verify">
            <strong>How to check for yourself:</strong> {f.howToVerify}
          </p>
        )}
      </div>

      <details className="card how">
        <summary>
          <h2>How Kinguard checked this</h2>
          <span className="muted">{sentToCloud.length === 0 ? 'Nothing left this device' : `Personal details hidden: ${r.piiSummary}`}</span>
        </summary>
        <ol className="ledger">
          {r.ledger.map((e, i) => (
            <li key={i}>
              <WhereBadge where={e.where} />
              <div>
                <strong>{e.step}</strong>
                {e.ms !== undefined && <span className="muted"> · {(e.ms / 1000).toFixed(1)}s</span>}
                {e.note && <p className="muted">{e.note}</p>}
              </div>
            </li>
          ))}
        </ol>
        {sentToCloud.length > 0 ? (
          <div className="sent">
            <h3>Exactly what was sent to the cloud</h3>
            <pre>{sentToCloud[sentToCloud.length - 1].sent}</pre>
            <p className="muted">Your real details were put back in only on this screen, on this device.</p>
          </div>
        ) : (
          <p className="ok">Nothing from this message was sent anywhere.</p>
        )}
        {r.links.length > 0 && (
          <div>
            <h3>Links in the message</h3>
            <ul className="links">
              {r.links.map((l) => (
                <li key={l.host}>
                  <code>{l.host}</code> {l.signals.length ? <span className="bad">— {l.signals.join('; ')}</span> : <span className="muted">— no warning signs</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </details>

      <button className="btn btn-primary btn-huge" onClick={props.onAgain}>Check something else</button>
    </section>
  );
}
