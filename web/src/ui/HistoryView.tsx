import type { CheckResult } from '../ai/types';
import { timeAgo, VerdictIcon } from './bits';
import { IconLock } from './icons';

export function HistoryView({ items, onOpen, onClear }: { items: CheckResult[]; onOpen: (r: CheckResult) => void; onClear: () => void }) {
  return (
    <section>
      <header className="page-head">
        <h1>Activity</h1>
        <p><IconLock size={14} /> Your past checks are saved only on this device.</p>
      </header>
      {items.length === 0 ? (
        <div className="card empty"><p>Nothing checked yet.</p></div>
      ) : (
        <div className="card list-card">
          <ul className="history">
            {items.map((r) => (
              <li key={r.id}>
                <button className={`history-item h-${r.final.verdict}`} onClick={() => onOpen(r)}>
                  <VerdictIcon verdict={r.final.verdict} size={30} />
                  <span className="grow">
                    <strong>{r.final.headline}</strong>
                    <span className="muted clamp">{r.original.slice(0, 120)}</span>
                  </span>
                  <span className="muted small nowrap">{timeAgo(new Date(r.createdAt))}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {items.length > 0 && <button className="settings-link danger" onClick={onClear}>Delete all past checks</button>}
    </section>
  );
}
