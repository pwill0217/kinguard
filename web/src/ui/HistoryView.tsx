import type { CheckResult } from '../ai/types';
import { VerdictIcon } from './bits';

export function HistoryView({ items, onOpen, onClear }: { items: CheckResult[]; onOpen: (r: CheckResult) => void; onClear: () => void }) {
  return (
    <section className="card">
      <h1>Past checks</h1>
      <p className="muted">Saved only on this device.</p>
      {items.length === 0 ? (
        <p>Nothing checked yet.</p>
      ) : (
        <>
          <ul className="history">
            {items.map((r) => (
              <li key={r.id}>
                <button className={`history-item verdict-${r.final.verdict}`} onClick={() => onOpen(r)}>
                  <VerdictIcon verdict={r.final.verdict} size={32} />
                  <span className="grow">
                    <strong>{r.final.headline}</strong>
                    <span className="muted clamp">{r.original.slice(0, 120)}</span>
                  </span>
                  <span className="muted">{new Date(r.createdAt).toLocaleDateString()}</span>
                </button>
              </li>
            ))}
          </ul>
          <button className="link" onClick={onClear}>Delete all past checks</button>
        </>
      )}
    </section>
  );
}
