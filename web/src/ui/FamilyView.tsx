import { useState } from 'react';
import { CATEGORY_LABEL, type Category } from '../ai/types';
import type { FamilyAlert, Membership } from '../family/circle';
import { normalizeCode } from '../family/circle';
import { VerdictIcon } from './bits';

export function FamilyView(props: {
  available: boolean;
  membership: Membership | null;
  alerts: FamilyAlert[];
  uid: string | null;
  error: string | null;
  busy: boolean;
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
  onAck: (alert: FamilyAlert) => void;
  onToggleAuto: (on: boolean) => void;
  onLeave: () => void;
}) {
  const { membership: m } = props;
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  if (!props.available) {
    return (
      <section className="card">
        <h1>Family circle</h1>
        <p>The family circle needs this app's Firebase project to be set up. Checking messages still works.</p>
      </section>
    );
  }

  if (!m) {
    return (
      <section className="family-setup">
        <div className="card">
          <h1>Family circle</h1>
          <p className="lead">
            Let someone you trust know when Kinguard spots a likely scam. They see the warning, never your message, names, or numbers.
          </p>
          <label htmlFor="name">Your first name</label>
          <input id="name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Margaret" />
        </div>
        <div className="two-col">
          <div className="card">
            <h2>I want protecting</h2>
            <p>Create a circle and share the code with a family member.</p>
            <button className="btn btn-primary" disabled={!name.trim() || props.busy} onClick={() => props.onCreate(name.trim())}>
              Create my circle
            </button>
          </div>
          <div className="card">
            <h2>I'm helping someone</h2>
            <label htmlFor="code">Their circle code</label>
            <input
              id="code"
              className="code-input"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              placeholder="ABC123"
              autoCapitalize="characters"
            />
            <button className="btn btn-primary" disabled={!name.trim() || code.length !== 6 || props.busy} onClick={() => props.onJoin(name.trim(), code)}>
              Join circle
            </button>
          </div>
        </div>
        {props.error && <p className="error" role="alert">{props.error}</p>}
      </section>
    );
  }

  return (
    <section>
      <div className="card">
        <h1>Family circle</h1>
        {m.role === 'protected' ? (
          <>
            <p className="lead">Share this code with someone you trust so they can join:</p>
            <p className="code-display" aria-label={`Circle code ${m.code.split('').join(' ')}`}>{m.code}</p>
            <label className="toggle">
              <input type="checkbox" checked={m.autoAlert} onChange={(e) => props.onToggleAuto(e.target.checked)} />
              Automatically tell my family when something looks like a scam
            </label>
          </>
        ) : (
          <p className="lead">
            You're helping in circle <strong>{m.code}</strong>. New warnings appear here instantly. Add Kinguard to your phone's home screen to keep it handy.
          </p>
        )}
        <button className="link" onClick={props.onLeave}>Leave this circle on this device</button>
      </div>

      <div className="card">
        <h2>Warnings</h2>
        {props.alerts.length === 0 ? (
          <p className="muted">No warnings yet. That's good news.</p>
        ) : (
          <ul className="alerts">
            {props.alerts.map((a) => {
              const mine = a.fromUid === props.uid;
              const acked = props.uid ? a.ackBy.includes(props.uid) : false;
              return (
                <li key={a.id} className={`alert alert-${a.verdict}`}>
                  <VerdictIcon verdict={a.verdict} size={36} />
                  <div className="grow">
                    <p className="alert-title">
                      <strong>{mine ? 'You' : a.fromName}</strong> checked a message: {a.headline}
                    </p>
                    <p className="muted">
                      {CATEGORY_LABEL[a.category as Category] ?? a.category} · risk {a.riskScore}/100
                      {a.createdAt ? ` · ${a.createdAt.toLocaleString()}` : ' · sending…'}
                    </p>
                    <p>{a.explanation}</p>
                    {a.ackNames.length > 0 && <p className="ok">✓ {a.ackNames.join(', ')} {a.ackNames.length > 1 ? 'are' : 'is'} on it</p>}
                  </div>
                  {!mine && !acked && (
                    <button className="btn btn-secondary" onClick={() => props.onAck(a)}>I'll call them</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
