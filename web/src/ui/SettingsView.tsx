import type { DeviceStatus } from '../ai/engine';
import type { RoutingPolicy } from '../config';
import type { Me } from '../family/account';
import { useVoice, voice, VOICES } from '../voice/voice';
import { Avatar } from './bits';
import { IconChip, IconCloud, IconGoogle, IconLock, IconShield, IconSpeaker } from './icons';

export function SettingsView(props: {
  me: Me | null;
  authAvailable: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  device: DeviceStatus;
  onSetupDevice: () => void;
  largeText: boolean;
  setLargeText: (v: boolean) => void;
  policy: RoutingPolicy;
}) {
  const { me, device, policy } = props;
  const v = useVoice();
  return (
    <section className="settings">
      <header className="page-head"><h1>Settings</h1></header>

      <div className="card">
        {me ? (
          <div className="account">
            <Avatar name={me.name} photoURL={me.photoURL} seed={me.uid} size={52} />
            <div className="grow">
              <strong>{me.name}</strong>
              <p className="muted small">{me.email}</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={props.onSignOut}>Sign out</button>
          </div>
        ) : (
          <div className="account">
            <div className="grow">
              <strong>Not signed in</strong>
              <p className="muted small">Sign in to create or join a family circle.</p>
            </div>
            <button className="btn btn-google btn-sm" disabled={!props.authAvailable} onClick={props.onSignIn}><IconGoogle size={18} /> Sign in</button>
          </div>
        )}
      </div>

      <div className="card">
        <h2><IconSpeaker size={20} /> Voice</h2>
        <p className="muted small">"Read this to me" uses Kokoro, a natural voice that runs on this device. Nothing you hear is sent anywhere.</p>
        <div className="voice-grid">
          {VOICES.map((x) => (
            <button key={x.id} className={`voice-opt ${v.voice === x.id ? 'on' : ''}`} onClick={() => voice.setVoice(x.id)} aria-pressed={v.voice === x.id}>
              <strong>{x.label}</strong>
              <span className="muted small">{x.note}</span>
            </button>
          ))}
        </div>
        <label className="range-row">
          <span>Speed</span>
          <input type="range" min={0.7} max={1.2} step={0.05} value={v.speed} onChange={(e) => voice.setVoice(v.voice, Number(e.target.value))} />
          <span className="muted small">{v.speed.toFixed(2)}×</span>
        </label>
        <div className="row gap-sm wrap">
          <button className="btn btn-soft" onClick={() => (v.speaking ? voice.stop() : void voice.speak('Hi! I will read your results out loud, so you never have to squint at the screen.'))}>
            {v.speaking ? 'Stop' : 'Play a sample'}
          </button>
          {v.status === 'loading' && <span className="muted small">Downloading voice… {Math.round(v.progress * 100)}%</span>}
          {v.status === 'ready' && <span className="ok small">Voice ready on this device</span>}
          {v.status === 'error' && <span className="muted small">Natural voice unavailable here. Using the built-in voice.</span>}
          {v.status === 'idle' && <button className="link" onClick={() => voice.preload()}>Download voice now (90 MB)</button>}
        </div>
      </div>

      <div className="card">
        <h2>Display</h2>
        <label className="switch-row">
          <span><strong>Larger text</strong><span className="muted">Make everything easier to read.</span></span>
          <input type="checkbox" className="switch" checked={props.largeText} onChange={(e) => props.setLargeText(e.target.checked)} />
        </label>
      </div>

      <div className="card">
        <h2><IconChip size={20} /> Private on-device AI</h2>
        {device === 'available' ? (
          <p className="ok">Gemini Nano is running on this device. Most checks never leave it.</p>
        ) : device === 'downloadable' ? (
          <>
            <p className="muted">Your browser supports private AI. Download it once (a few minutes).</p>
            <button className="btn btn-soft" onClick={props.onSetupDevice}>Turn on private AI</button>
          </>
        ) : (
          <>
            <p className="muted">Not available in this browser. Kinguard hides your details, then uses the secure cloud. To run AI on your computer:</p>
            <ol className="small">
              <li>Use Google Chrome 139+ on a computer.</li>
              <li>Open <code>chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</code>, set it to <strong>Enabled</strong>, and restart Chrome.</li>
              <li>Come back and tap <strong>Turn on private AI</strong>.</li>
            </ol>
          </>
        )}
      </div>

      <div className="card">
        <h2><IconShield size={20} /> How Kinguard protects you</h2>
        <ol className="how-list">
          <li><span className="where where-device">Device</span><span>Screenshots are read and personal details (names, numbers, emails, codes) are hidden on your device.</span></li>
          <li><span className="where where-device">Device</span><span>Gemini Nano does a fast, free, offline-capable scam screen.</span></li>
          <li><span className="where where-cloud"><IconCloud size={12} /> Cloud</span><span>If the risk is {policy.deepCheckThreshold}+ a stronger Gemini model double-checks the version with your details hidden.</span></li>
          <li><span className="where where-device">Device</span><span>Your details are put back on your screen only.</span></li>
          <li><span className="where where-cloud">Family</span><span>For high-risk messages ({policy.familyAlertThreshold}+), your circle gets the warning, never the message.</span></li>
        </ol>
        <p className="fine"><IconLock size={13} /> Built with Firebase AI Logic hybrid inference, App Check, Remote Config, Authentication and Firestore. Open source (Apache 2.0).</p>
      </div>
    </section>
  );
}
