import type { DeviceStatus } from '../ai/engine';
import type { Verdict, Where } from '../ai/types';

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 3 6 10v13c0 11.5 7.7 19.7 18 22 10.3-2.3 18-10.5 18-22V10L24 3Z" fill="var(--brand)" />
      <path d="M24 34s-9-5.4-9-11.6A5 5 0 0 1 24 19a5 5 0 0 1 9 3.4C33 28.6 24 34 24 34Z" fill="var(--paper)" />
    </svg>
  );
}

export function DevicePill({ status, progress, onSetup }: { status: DeviceStatus; progress: number | null; onSetup: () => void }) {
  if (status === 'available') {
    return (
      <span className="pill pill-device" title="Gemini Nano is running on this computer">
        <span className="dot" /> Private AI on this device
      </span>
    );
  }
  if (status === 'downloading' || progress !== null) {
    return (
      <span className="pill pill-wait">
        <span className="dot" /> Setting up private AI{progress !== null ? ` ${Math.round(progress * 100)}%` : '…'}
      </span>
    );
  }
  if (status === 'downloadable') {
    return (
      <button className="pill pill-action" onClick={onSetup}>
        <span className="dot" /> Turn on private AI
      </button>
    );
  }
  return (
    <span className="pill pill-cloud" title="This browser has no on-device model, so Kinguard uses the secure cloud after hiding personal details">
      <span className="dot" /> Secure cloud mode
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
        <div className="meter-fill" style={{ width: `${Math.max(4, score)}%` }} />
      </div>
      <span className="meter-label">Scam risk {score}/100</span>
    </div>
  );
}
