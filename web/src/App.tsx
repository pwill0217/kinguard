import { useCallback, useEffect, useRef, useState } from 'react';
import { chromeDeviceStatus, FirebaseEngine, type DeviceStatus, type Engine } from './ai/engine';
import { MockEngine } from './ai/mockEngine';
import { completeDeepCheck, NeedsImageConsentError, runCheck, type Stage } from './ai/pipeline';
import type { CheckResult } from './ai/types';
import { DEFAULT_POLICY, loadPolicy, type RoutingPolicy } from './config';
import {
  acknowledge,
  createCircle,
  ensureUser,
  joinCircle,
  loadMembership,
  saveMembership,
  sendAlert,
  watchAlerts,
  type FamilyAlert,
  type Membership,
} from './family/circle';
import { getFirebase, isFirebaseConfigured, type FirebaseServices } from './firebase';
import { clearHistory, loadHistory, saveToHistory } from './local/history';
import { AboutView } from './ui/AboutView';
import { DevicePill, Logo } from './ui/bits';
import { CheckView, type CheckRequest } from './ui/CheckView';
import { FamilyView } from './ui/FamilyView';
import { HistoryView } from './ui/HistoryView';
import { ResultView } from './ui/ResultView';

type Tab = 'check' | 'result' | 'family' | 'history' | 'about';

const USE_MOCK = import.meta.env.VITE_MOCK_ENGINE === '1';

/** Used when Firebase isn't configured: on-device status is real, AI calls fail and the pipeline falls back to rules. */
class UnconfiguredEngine implements Engine {
  deviceStatus = chromeDeviceStatus;
  async prepareDevice() {}
  private fail(): never {
    throw new Error('Firebase is not configured');
  }
  findPii = async () => this.fail();
  readScreenshot = async () => this.fail();
  triage = async () => this.fail();
  deepCheck = async () => this.fail();
}

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export default function App() {
  const online = useOnline();
  const [services] = useState<FirebaseServices | null>(() => {
    if (USE_MOCK || !isFirebaseConfigured) return null;
    try {
      return getFirebase();
    } catch (e) {
      console.error(e);
      return null;
    }
  });
  const [policy, setPolicy] = useState<RoutingPolicy>(DEFAULT_POLICY);
  const engineRef = useRef<Engine>(USE_MOCK ? new MockEngine() : new UnconfiguredEngine());
  const [device, setDevice] = useState<DeviceStatus>('unavailable');
  const [progress, setProgress] = useState<number | null>(null);

  const [tab, setTab] = useState<Tab>('check');
  const [text, setText] = useState('');
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [deepBusy, setDeepBusy] = useState(false);
  const [history, setHistory] = useState<CheckResult[]>(loadHistory);
  const [largeText, setLargeText] = useState(() => localStorage.getItem('kinguard.large') === '1');

  const [uid, setUid] = useState<string | null>(null);
  const [membership, setMembership] = useState<Membership | null>(loadMembership);
  const [alerts, setAlerts] = useState<FamilyAlert[]>([]);
  const [familyBusy, setFamilyBusy] = useState(false);
  const [familyError, setFamilyError] = useState<string | null>(null);
  const [alerted, setAlerted] = useState<Record<string, 'sending' | 'sent'>>({});

  // Load routing policy from Remote Config, then build the Firebase AI Logic engine.
  useEffect(() => {
    if (!services) return;
    let cancelled = false;
    loadPolicy(services.remoteConfig).then((p) => {
      if (cancelled) return;
      setPolicy(p);
      engineRef.current = new FirebaseEngine(services.ai, p);
    });
    return () => {
      cancelled = true;
    };
  }, [services]);

  const refreshDevice = useCallback(async () => setDevice(await engineRef.current.deviceStatus()), []);
  useEffect(() => {
    void refreshDevice();
    const t = setInterval(refreshDevice, 15_000);
    return () => clearInterval(t);
  }, [refreshDevice]);

  const setupDevice = useCallback(async () => {
    // Called from a click: Chrome requires a user gesture to start the model download.
    setProgress(0);
    try {
      await engineRef.current.prepareDevice((p) => setProgress(p));
    } catch (e) {
      console.warn('On-device setup failed', e);
    } finally {
      setProgress(null);
      void refreshDevice();
    }
  }, [refreshDevice]);

  // Sign in anonymously for the family circle.
  useEffect(() => {
    if (!services) return;
    ensureUser(services.auth).then(setUid).catch((e) => console.warn('Auth unavailable', e));
  }, [services]);

  useEffect(() => {
    if (!services || !membership || !uid) return;
    return watchAlerts(services.db, membership.code, setAlerts, (e) => setFamilyError(e.message));
  }, [services, membership, uid]);

  const finishResult = useCallback(
    async (r: CheckResult, p: RoutingPolicy) => {
      setResult(r);
      setHistory(saveToHistory(r));
      // Auto-alert family for high-risk results.
      if (services && uid && membership?.role === 'protected' && membership.autoAlert && r.final.riskScore >= p.familyAlertThreshold && !alerted[r.id]) {
        setAlerted((a) => ({ ...a, [r.id]: 'sending' }));
        try {
          await sendAlert(services.db, uid, membership, r);
          setAlerted((a) => ({ ...a, [r.id]: 'sent' }));
        } catch (e) {
          console.warn('Family alert failed', e);
          setAlerted((a) => {
            const { [r.id]: _drop, ...rest } = a;
            return rest;
          });
        }
      }
    },
    [services, uid, membership, alerted],
  );

  const check = useCallback(
    async (req: CheckRequest, allowCloudImage = false) => {
      setError(null);
      if (device === 'downloadable') void setupDevice();
      try {
        const r = await runCheck({ ...req, allowCloudImage }, engineRef.current, policy, { online, device }, setStage);
        await finishResult(r, policy);
        setTab('result');
        window.scrollTo({ top: 0 });
      } catch (e) {
        if (e instanceof NeedsImageConsentError) {
          const ok = window.confirm(
            'This device cannot read screenshots privately.\n\nSend the screenshot to Google\'s secure cloud to read it? Everything else stays private.',
          );
          setStage(null);
          if (ok) return check(req, true);
          setError('OK, the screenshot was not sent. You can type or paste the message instead.');
        } else {
          setError((e as Error).message || 'Something went wrong. Please try again.');
        }
      } finally {
        setStage(null);
      }
    },
    [device, online, policy, finishResult, setupDevice],
  );

  const deepCheck = useCallback(async () => {
    if (!result) return;
    setDeepBusy(true);
    try {
      const r = await completeDeepCheck(result, engineRef.current, policy);
      await finishResult(r, policy);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeepBusy(false);
    }
  }, [result, policy, finishResult]);

  // Back online: finish any deep check that was postponed.
  useEffect(() => {
    if (online && result?.deepPending === 'offline' && !deepBusy) void deepCheck();
  }, [online, result, deepBusy, deepCheck]);

  // Text handed over by the Chrome extension or the Android share sheet.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || e.data?.source !== 'kinguard-extension' || typeof e.data.text !== 'string') return;
      setText(e.data.text.slice(0, 20000));
      setTab('check');
    };
    window.addEventListener('message', onMsg);
    window.postMessage({ source: 'kinguard-app', type: 'ready' }, window.location.origin);
    void (async () => {
      const params = new URLSearchParams(location.search);
      if (!params.has('shared') || !('caches' in window)) return;
      const cache = await caches.open('kinguard-share');
      const res = await cache.match('/__shared');
      if (res) {
        setText(await res.text());
        await cache.delete('/__shared');
      }
      window.history.replaceState(null, '', location.pathname);
    })();
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('large', largeText);
    localStorage.setItem('kinguard.large', largeText ? '1' : '0');
  }, [largeText]);

  async function familyAction(fn: () => Promise<void>) {
    setFamilyBusy(true);
    setFamilyError(null);
    try {
      await fn();
    } catch (e) {
      setFamilyError((e as Error).message);
    } finally {
      setFamilyBusy(false);
    }
  }

  const familyState: 'none' | 'available' | 'sent' | 'sending' =
    !result || !membership || membership.role !== 'protected' || !uid
      ? 'none'
      : alerted[result.id] ?? (result.final.verdict === 'safe' ? 'none' : 'available');

  const nav: { id: Tab; label: string }[] = [
    { id: 'check', label: 'Check' },
    { id: 'family', label: 'Family' },
    { id: 'history', label: 'History' },
    { id: 'about', label: 'About' },
  ];

  return (
    <div className="app">
      <header className="top">
        <button className="brand" onClick={() => setTab('check')} aria-label="Kinguard home">
          <Logo />
          <span>Kinguard</span>
        </button>
        <div className="row gap-sm wrap end">
          <DevicePill status={device} progress={progress} onSetup={setupDevice} />
          <button className="pill pill-plain" aria-pressed={largeText} onClick={() => setLargeText((v) => !v)}>
            {largeText ? 'A−' : 'A+'} <span className="sr-only">Toggle larger text</span>
          </button>
        </div>
      </header>
      <nav className="tabs" aria-label="Main">
        {nav.map((n) => (
          <button key={n.id} className={tab === n.id || (n.id === 'check' && tab === 'result') ? 'active' : ''} onClick={() => setTab(n.id === 'check' && result && tab === 'result' ? 'check' : n.id)}>
            {n.label}
            {n.id === 'family' && alerts.some((a) => uid && a.fromUid !== uid && !a.ackBy.includes(uid)) && <span className="badge" aria-label="new warnings" />}
          </button>
        ))}
      </nav>

      {!online && <div className="banner">You're offline. Kinguard can still check messages privately on this device.</div>}
      {!services && !USE_MOCK && (
        <div className="banner warn">Setup needed: this build has no Firebase project configured, so only the built-in rules are active.</div>
      )}

      <main>
        {tab === 'check' && <CheckView text={text} setText={setText} busy={stage} error={error} onCheck={(r) => void check(r)} />}
        {tab === 'result' && result && (
          <ResultView
            result={result}
            online={online}
            deepBusy={deepBusy}
            familyState={familyState}
            onDeepCheck={() => void deepCheck()}
            onAlertFamily={async () => {
              if (!services || !uid || !membership) return;
              setAlerted((a) => ({ ...a, [result.id]: 'sending' }));
              try {
                await sendAlert(services.db, uid, membership, result);
                setAlerted((a) => ({ ...a, [result.id]: 'sent' }));
              } catch (e) {
                setError((e as Error).message);
                setAlerted(({ [result.id]: _drop, ...rest }) => rest);
              }
            }}
            onAgain={() => {
              setText('');
              setTab('check');
            }}
          />
        )}
        {tab === 'family' && (
          <FamilyView
            available={!!services}
            membership={membership}
            alerts={alerts}
            uid={uid}
            error={familyError}
            busy={familyBusy}
            onCreate={(name) =>
              familyAction(async () => {
                const id = uid ?? (await ensureUser(services!.auth));
                setUid(id);
                const code = await createCircle(services!.db, id);
                const m: Membership = { code, myName: name, role: 'protected', autoAlert: true };
                saveMembership(m);
                setMembership(m);
              })
            }
            onJoin={(name, code) =>
              familyAction(async () => {
                const id = uid ?? (await ensureUser(services!.auth));
                setUid(id);
                await joinCircle(services!.db, id, code);
                const m: Membership = { code, myName: name, role: 'helper', autoAlert: false };
                saveMembership(m);
                setMembership(m);
              })
            }
            onAck={(a) => familyAction(() => acknowledge(services!.db, uid!, membership!.myName, membership!.code, a.id))}
            onToggleAuto={(on) => {
              const m = { ...membership!, autoAlert: on };
              saveMembership(m);
              setMembership(m);
            }}
            onLeave={() => {
              if (!window.confirm('Leave this circle on this device? You can rejoin with the code.')) return;
              saveMembership(null);
              setMembership(null);
              setAlerts([]);
            }}
          />
        )}
        {tab === 'history' && (
          <HistoryView
            items={history}
            onOpen={(r) => {
              setResult(r);
              setTab('result');
            }}
            onClear={() => {
              if (!window.confirm('Delete all past checks from this device?')) return;
              clearHistory();
              setHistory([]);
            }}
          />
        )}
        {tab === 'about' && <AboutView policy={policy} device={device} />}
      </main>
      <footer className="foot muted">
        Kinguard gives guidance, not guarantees. When in doubt, hang up and call someone you trust.
      </footer>
    </div>
  );
}
