import { useEffect, type ReactNode } from 'react';
import type { DeviceStatus } from '../ai/engine';
import type { Verdict, Where } from '../ai/types';
import { IconChip, IconCloud, IconX } from './icons';

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="kg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a6bff" />
          <stop offset="1" stopColor="#4b28e0" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="url(#kg)" />
      <path d="M24 9 12 13.6v8.7C12 30 17.1 35.5 24 37c6.9-1.5 12-7 12-14.7v-8.7L24 9Z" fill="#fff" />
      <path d="M24 30s-6-3.6-6-7.7a3.3 3.3 0 0 1 6-2 3.3 3.3 0 0 1 6 2C30 26.4 24 30 24 30Z" fill="#6d4aff" />
    </svg>
  );
}

const PALETTE = ['#6d4aff', '#ef5da8', '#14b8a6', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#f43f5e'];
export function colorFor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function Avatar({ name, photoURL, size = 44, ring, seed }: { name: string; photoURL?: string | null; size?: number; ring?: Verdict | 'none'; seed?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
  return (
    <span className={`avatar ring-${ring ?? 'none'}`} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {photoURL ? (
        <img src={photoURL} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="avatar-initials" style={{ background: colorFor(seed ?? name) }}>{initials}</span>
      )}
    </span>
  );
}

export function AvatarStack({ people, size = 36, max = 5 }: { people: { name: string; photoURL?: string | null; uid: string }[]; size?: number; max?: number }) {
  const shown = people.slice(0, max);
  return (
    <span className="avatar-stack">
      {shown.map((p) => (
        <Avatar key={p.uid} name={p.name} photoURL={p.photoURL} size={size} seed={p.uid} />
      ))}
      {people.length > max && <span className="avatar more" style={{ width: size, height: size }}>+{people.length - max}</span>}
    </span>
  );
}

export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconX size={20} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function DevicePill({ status, progress, onSetup }: { status: DeviceStatus; progress: number | null; onSetup: () => void }) {
  if (status === 'available')
    return (
      <span className="pill pill-device" title="Gemini Nano is running on this device">
        <IconChip size={14} /> <span className="pill-label">On-device AI</span>
      </span>
    );
  if (status === 'downloading' || progress !== null)
    return <span className="pill pill-wait"><IconChip size={14} /> Setting up{progress !== null ? ` ${Math.round(progress * 100)}%` : '…'}</span>;
  if (status === 'downloadable')
    return (
      <button className="pill pill-action" onClick={onSetup}>
        <IconChip size={14} /> Turn on private AI
      </button>
    );
  return (
    <span className="pill pill-cloud" title="No on-device model here: personal details are hidden, then checked in the secure cloud">
      <IconCloud size={14} /> <span className="pill-label">Secure cloud</span>
    </span>
  );
}

export function WhereBadge({ where }: { where: Where }) {
  const label = where === 'device' ? 'On this device' : where === 'cloud' ? 'Cloud' : 'Built-in rules';
  return <span className={`where where-${where}`}>{label}</span>;
}

export function VerdictIcon({ verdict, size = 56 }: { verdict: Verdict; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 48 48', 'aria-hidden': true };
  if (verdict === 'safe')
    return (
      <svg {...common}>
        <circle cx="24" cy="24" r="22" fill="currentColor" />
        <path d="m14 25 7 7 13-15" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (verdict === 'suspicious')
    return (
      <svg {...common}>
        <path d="M24 3 46 43H2L24 3Z" fill="currentColor" />
        <rect x="21.5" y="16" width="5" height="15" rx="2.5" fill="#fff" />
        <circle cx="24" cy="36.5" r="3" fill="#fff" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M15 2h18l13 13v18L33 46H15L2 33V15L15 2Z" fill="currentColor" />
      <path d="m16 16 16 16M32 16 16 32" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function RiskMeter({ score }: { score: number }) {
  return (
    <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-label="Scam risk">
      <div className="meter-track">
        <div className="meter-dot" style={{ left: `${Math.min(97, Math.max(3, score))}%` }} />
      </div>
      <div className="meter-labels">
        <span>Safe</span>
        <strong>Risk {score}/100</strong>
        <span>Scam</span>
      </div>
    </div>
  );
}

export function timeAgo(d: Date | null): string {
  if (!d) return 'just now';
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString();
}

export function timeLeft(d: Date): string {
  const h = Math.max(0, (d.getTime() - Date.now()) / 3600_000);
  return h >= 1 ? `expires in ${Math.floor(h)}h` : `expires in ${Math.max(1, Math.round(h * 60))}m`;
}
