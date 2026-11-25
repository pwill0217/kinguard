import { CATEGORY_LABEL, type CheckResult } from '../ai/types';
import { useVoice, voice } from '../voice/voice';
import { RiskMeter, VerdictIcon, WhereBadge } from './bits';
import { IconBell, IconSpeaker, IconStop } from './icons';

export function ResultView(props: {
  result: CheckResult;
  online: boolean;
  deepBusy: boolean;
  familyState: 'none' | 'available' | 'sent' | 'sending' | 'signin';
  onDeepCheck: () => void;
  onAlertFamily: () => void;
  onAgain: () => void;
}) {
  const { result: r, online, deepBusy, familyState } = props;
  const f = r.final;
  const v = useVoice();
  const sentToCloud = r.ledger.filter((e) => e.sent);
  const script = [f.headline + '.', f.explanation, 'Here is what to do.', ...f.whatToDo, f.howToVerify].filter(Boolean).join(' ');

  return (
    <section className="result" aria-live="polite">
      <div className={`verdict-card v-${f.verdict}`}>
        <div className="verdict-head">
          <VerdictIcon verdict={f.verdict} size={52} />
          <div>
            <h1>{f.headline}</h1>
            {f.category !== 'none' && <p className="category">{CATEGORY_LABEL[f.category]}</p>}
          </div>
        </div>
        <RiskMeter score={f.riskScore} />
        <p className="explanation">{f.explanation}</p>
        <div className="row wrap gap-sm">
          <button className="btn btn-white" onClick={() => (v.speaking ? voice.stop() : void voice.speak(script))}>
            {v.speaking ? <IconStop size={18} /> : <IconSpeaker size={18} />}
            {v.speaking ? 'Stop' : v.status === 'loading' ? `Preparing voice ${Math.round(v.progress * 100)}%` : 'Read this to me'}
          </button>
          {familyState === 'available' && (
            <button className="btn btn-white" onClick={props.onAlertFamily}><IconBell size={18} /> Tell my family</button>
          )}
          {familyState === 'sending' && <span className="note">Telling your family…</span>}
          {familyState === 'sent' && <span className="note">✓ Your family was told (no personal details)</span>}
        </div>
        {v.speaking && v.status === 'loading' && (
          <p className="fine">Downloading Kokoro, a natural voice that runs on this device (one time, about 90 MB).</p>
        )}
      </div>

      {r.deepPending === 'offline' && (
        <div className="card notice"><strong>Checked privately while offline.</strong> An expert double-check will run when you're back online.</div>
      )}
      {(r.deepPending === 'below_threshold' || r.deepPending === 'error') && (
        <div className="card notice">
          <p>{r.deepPending === 'error' ? "The expert double-check couldn't run just now." : 'Checked privately on your device.'} Want a second opinion? Only the version with your details hidden is sent.</p>
          <button className="btn btn-soft" disabled={!online || deepBusy} onClick={props.onDeepCheck}>
            {deepBusy ? 'Double-checking…' : online ? 'Get an expert double-check' : 'Connect to the internet to double-check'}
          </button>
        </div>
      )}

      {f.redFlags.length > 0 && (
        <div className="card">
          <h2>Warning signs</h2>
          <ul className="flags">
            {f.redFlags.map((fl, i) => (
              <li key={i}><strong>{fl.signal}</strong>{fl.why && <span className="muted"> · {fl.why}</span>}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>What to do now</h2>
        <ol className="steps">{f.whatToDo.map((s, i) => <li key={i}>{s}</li>)}</ol>
        {f.howToVerify && <p className="verify"><strong>Check for yourself:</strong> {f.howToVerify}</p>}
      </div>

      <details className="card how">
        <summary>
          <h2>How Kinguard checked this</h2>
          <span className="muted small">{sentToCloud.length === 0 ? 'Nothing left this device' : `Hidden before sending: ${r.piiSummary}`}</span>
        </summary>
        <ol className="ledger">
          {r.ledger.map((e, i) => (
            <li key={i}>
              <WhereBadge where={e.where} />
              <div>
                <strong>{e.step}</strong>
                {e.ms !== undefined && <span className="muted"> · {(e.ms / 1000).toFixed(1)}s</span>}
                {e.note && <p className="muted small">{e.note}</p>}
              </div>
            </li>
          ))}
        </ol>
        {sentToCloud.length > 0 ? (
          <div className="sent">
            <h3>Exactly what the cloud saw</h3>
            <pre>{sentToCloud[sentToCloud.length - 1].sent}</pre>
            <p className="muted small">Your real details were put back only on this screen, on this device.</p>
          </div>
        ) : (
          <p className="ok">Nothing from this message was sent anywhere.</p>
        )}
        {r.links.length > 0 && (
          <div>
            <h3>Links in the message</h3>
            <ul className="links">
              {r.links.map((l) => (
                <li key={l.host}><code>{l.host}</code> {l.signals.length ? <span className="bad">· {l.signals.join('; ')}</span> : <span className="muted">· no warning signs</span>}</li>
              ))}
            </ul>
          </div>
        )}
      </details>

      <button className="btn btn-primary btn-xl" onClick={props.onAgain}>Check something else</button>
    </section>
  );
}
