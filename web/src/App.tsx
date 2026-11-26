import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chromeDeviceStatus, FirebaseEngine, type DeviceStatus, type Engine } from './ai/engine';
import { MockEngine } from './ai/mockEngine';
import { completeDeepCheck, NeedsImageConsentError, runCheck, type Stage } from './ai/pipeline';
import type { CheckResult } from './ai/types';
import { DEFAULT_POLICY, loadPolicy, type RoutingPolicy } from './config';
import { signInWithGoogle, signOut, watchUser, type Me } from './family/account';
import * as fam from './family/circles';
import type { Circle, FamilyAlert, Invite, Member } from './family/circles';
import { getFirebase, isFirebaseConfigured, type FirebaseServices } from './firebase';
import { clearHistory, loadHistory, saveToHistory } from './local/history';
import { Avatar, DevicePill, Logo, Sheet } from './ui/bits';
import { CheckView, type CheckRequest } from './ui/CheckView';
import { CircleHub, JoinSheet, NoCircle, SignInCard, CreateCircleSheet, type CircleActions } from './ui/CircleView';
import { HistoryView } from './ui/HistoryView';
import { IconChevronDown, IconClock, IconHome, IconPlus, IconSettings, IconShield, IconUsers } from './ui/icons';
import { ResultView } from './ui/ResultView';
import { SettingsView } from './ui/SettingsView';
import { mockFamily } from './ui/mockFamily';

type Tab = 'home' | 'check' | 'result' | 'activity' | 'settings';

const USE_MOCK = import.meta.env.VITE_MOCK_ENGINE === '1';

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

function joinCodeFromUrl(): string | null {
  const m = location.pathname.match(/^\/join\/([A-Za-z0-9]{6})\/?$/);
  return m ? fam.normalizeCode(m[1]) : null;
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

  const [tab, setTab] = useState<Tab>(() => (joinCodeFromUrl() ? 'home' : 'home'));
  const [text, setText] = useState('');
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [deepBusy, setDeepBusy] = useState(false);
  const [history, setHistory] = useState<CheckResult[]>(loadHistory);
  const [largeText, setLargeText] = useState(() => localStorage.getItem('kinguard.large') === '1');

  // Family state
  const [me, setMe] = useState<Me | null>(USE_MOCK ? mockFamily.me : null);
  const [authReady, setAuthReady] = useState(USE_MOCK || !services);
  const [circles, setCircles] = useState<Circle[]>(USE_MOCK && !location.search.includes('solo') ? mockFamily.circles : []);
  const [circleId, setCircleId] = useState<string | null>(() => localStorage.getItem('kinguard.circle'));
  const [members, setMembers] = useState<Member[]>(USE_MOCK ? mockFamily.members : []);
  const [alerts, setAlerts] = useState<FamilyAlert[]>(USE_MOCK ? mockFamily.alerts : []);
  const [invites, setInvites] = useState<Invite[]>(USE_MOCK ? mockFamily.invites : []);
  const [alerted, setAlerted] = useState<Record<string, 'sending' | 'sent'>>({});
  const [switcher, setSwitcher] = useState(false);
  const [joinCode, setJoinCode] = useState<string | null>(joinCodeFromUrl);
  const [createOpen, setCreateOpen] = useState(false);
  const [familyError, setFamilyError] = useState<string | null>(null);
  const [inviteAfterCreate, setInviteAfterCreate] = useState(false);

  const [incoming, setIncoming] = useState<FamilyAlert | null>(null);
  const seenAlerts = useRef<{ circle: string | null; ids: Set<string> | null }>({ circle: null, ids: null });

  // "Family told" belongs to whoever sent it.
  useEffect(() => setAlerted({}), [me?.uid]);

  const circle = useMemo(() => circles.find((c) => c.id === circleId) ?? circles[0] ?? null, [circles, circleId]);

  // ---------- AI engine ----------
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
    const t = setInterval(refreshDevice, 20_000);
    return () => clearInterval(t);
  }, [refreshDevice]);

  const setupDevice = useCallback(async () => {
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

  // ---------- auth + live family data ----------
  useEffect(() => {
    if (!services) return;
    return watchUser(services.auth, (u) => {
      setMe(u);
      setAuthReady(true);
    });
  }, [services]);

  useEffect(() => {
    if (!services || !me) {
      if (!USE_MOCK) setCircles([]);
      return;
    }
    return fam.watchMyCircles(services.db, me.uid, setCircles, (e) => setFamilyError(e.message));
  }, [services, me]);

  useEffect(() => {
    if (!services || !circle) {
      if (!USE_MOCK) {
        setMembers([]);
        setAlerts([]);
        setInvites([]);
      }
      return;
    }
    const err = (e: Error) => console.warn(e);
    const u1 = fam.watchMembers(services.db, circle.id, setMembers, err);
    seenAlerts.current = { circle: circle.id, ids: null };
    const u2 = fam.watchAlerts(
      services.db,
      circle.id,
      (list) => {
        setAlerts(list);
        const seen = seenAlerts.current;
        const ids = new Set(list.map((a) => a.id));
        if (seen.ids) {
          const fresh = list.find((a) => !seen.ids!.has(a.id) && a.fromUid !== me?.uid);
          if (fresh) announceAlert(fresh, circle.name);
        }
        seen.ids = new Set([...(seen.ids ?? []), ...ids]);
      },
      err,
    );
    const u3 = fam.watchInvites(services.db, circle.id, setInvites, () => setInvites([]));
    return () => {
      u1();
      u2();
      u3();
    };
  }, [services, circle?.id, me?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  function announceAlert(a: FamilyAlert, circleName: string) {
    setIncoming(a);
    navigator.vibrate?.(200);
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      new Notification(`${a.fromName} may have received a scam`, { body: `${a.headline} · risk ${a.riskScore} · ${circleName}`, tag: a.id });
    }
  }
  useEffect(() => {
    if (!incoming) return;
    const t = setTimeout(() => setIncoming(null), 8000);
    return () => clearTimeout(t);
  }, [incoming]);
  useEffect(() => {
    if (me && 'Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
  }, [me]);

  useEffect(() => {
    if (circle) localStorage.setItem('kinguard.circle', circle.id);
  }, [circle]);

  const doSignIn = useCallback(async () => {
    if (!services) throw new Error('Sign-in is not available in this build.');
    await signInWithGoogle(services.auth, services.db);
  }, [services]);

  const need = () => {
    if (!services || !me) throw new Error('Please sign in first.');
    return { db: services.db, me };
  };

  const act: CircleActions = {
    signIn: doSignIn,
    createCircle: async (name, prot) => {
      const { db, me } = need();
      const id = await fam.createCircle(db, me, name, prot);
      setCircleId(id);
      setInviteAfterCreate(true);
    },
    previewInvite: async (code) => fam.previewInvite(need().db, code),
    joinCircle: async (inv) => {
      const { db, me } = need();
      await fam.joinWithInvite(db, me, inv);
      setCircleId(inv.circleId);
      setJoinCode(null);
      if (location.pathname.startsWith('/join/')) window.history.replaceState(null, '', '/');
    },
    createInvite: async (asProtected) => {
      const { db, me } = need();
      return fam.createInvite(db, me, circle!, asProtected);
    },
    revokeInvite: async (code) => fam.revokeInvite(need().db, code),
    removeMember: async (uid) => {
      await fam.removeMember(need().db, circle!.id, uid);
    },
    setRole: async (uid, role) => fam.setRole(need().db, circle!.id, uid, role),
    setProtected: async (uid, v) => fam.setProtected(need().db, circle!.id, uid, v),
    renameCircle: async (name) => fam.renameCircle(need().db, circle!.id, name),
    deleteCircle: async () => {
      await fam.deleteCircle(need().db, circle!);
      setCircleId(null);
    },
    acknowledge: async (id) => {
      const { db, me } = need();
      await fam.acknowledge(db, me, circle!.id, id);
    },
  };

  // ---------- checking ----------
  const shareWithFamily = useCallback(
    async (r: CheckResult, p: RoutingPolicy, force = false) => {
      if (!services || !me || !circles.length) return;
      const protectedIn = await fam.circlesWhereProtected(services.db, me.uid, circles);
      const inCircles = circles.filter((c) => protectedIn.includes(c.id));
      if (inCircles.length) await fam.recordMyCheck(services.db, me, inCircles, r.final.verdict);
      // Automatic alerts come from protected members; a tap on "Tell my family" works for anyone.
      const targets = force ? circles.map((c) => c.id) : r.final.riskScore >= p.familyAlertThreshold ? protectedIn : [];
      if (!targets.length || alerted[r.id]) return;
      setAlerted((a) => ({ ...a, [r.id]: 'sending' }));
      try {
        await fam.sendAlert(services.db, me, targets, r);
        setAlerted((a) => ({ ...a, [r.id]: 'sent' }));
      } catch (e) {
        console.warn('Family alert failed', e);
        setFamilyError('Could not alert your family. Check your connection and try again.');
        setAlerted(({ [r.id]: _drop, ...rest }) => rest);
      }
    },
    [services, me, circles, alerted],
  );

  const finishResult = useCallback(
    async (r: CheckResult, p: RoutingPolicy) => {
      setResult(r);
      setHistory(saveToHistory(r));
      void shareWithFamily(r, p);
    },
    [shareWithFamily],
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
          const ok = window.confirm("This device can't read screenshots privately.\n\nSend the screenshot to Google's secure cloud to read it? Everything else stays private.");
          setStage(null);
          if (ok) return check(req, true);
          setError('OK, the screenshot was not sent. You can paste the message text instead.');
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
        setTab('check');
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

  const familyState: 'none' | 'available' | 'sent' | 'sending' =
    !result || !me || !circles.length ? 'none' : alerted[result.id] ?? (result.final.verdict === 'safe' ? 'none' : 'available');

  const unread = me ? alerts.filter((a) => a.fromUid !== me.uid && a.verdict !== 'safe' && a.ackBy.length === 0 && (a.createdAt?.getTime() ?? Date.now()) > Date.now() - 7 * 86400_000).length : 0;

  const goCheck = () => {
    setTab('check');
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="shell">
      <header className="topbar">
        {me && circle ? (
          <button className="circle-switch" onClick={() => setSwitcher(true)}>
            <span className="cs-icon"><IconUsers size={16} /></span>
            <span className="cs-name">{circle.name}</span>
            <IconChevronDown size={16} />
          </button>
        ) : (
          <button className="brand" onClick={() => setTab('home')}><Logo size={30} /><span>Kinguard</span></button>
        )}
        <div className="topbar-right">
          <DevicePill status={device} progress={progress} onSetup={setupDevice} />
          {me && (
            <button className="avatar-btn" onClick={() => setTab('settings')} aria-label="Account and settings">
              <Avatar name={me.name} photoURL={me.photoURL} seed={me.uid} size={34} />
            </button>
          )}
        </div>
      </header>

      {!online && <div className="banner">You're offline. Kinguard can still check messages privately on this device.</div>}
      {!services && !USE_MOCK && <div className="banner warn">Setup needed: no Firebase project configured, so only the built-in rules are active.</div>}

      {incoming && (
        <button
          className="incoming-toast"
          role="alert"
          onClick={() => {
            setTab('home');
            setIncoming(null);
            window.scrollTo({ top: 0 });
          }}
        >
          <span className="incoming-bell" aria-hidden>🔔</span>
          <span className="incoming-text">
            <strong>{incoming.fromName} may have received a scam</strong>
            <span>{incoming.headline} · risk {incoming.riskScore}</span>
          </span>
          <span className="incoming-view">View</span>
        </button>
      )}
      <main className="content">
        {tab === 'home' &&
          (!authReady ? (
            <div className="card skeleton" />
          ) : !me ? (
            <>
              <SignInCard onSignIn={doSignIn} available={!!services} />
              {joinCode && <p className="banner">Sign in to join the circle you were invited to (code {joinCode}).</p>}
              <button className="quick-check" onClick={goCheck}>
                <span className="qc-icon"><IconShield /></span>
                <span className="grow"><strong>Just check a message</strong><span className="muted small">No account needed</span></span>
              </button>
            </>
          ) : !circle ? (
            <NoCircle me={me} act={act} initialCode={joinCode} />
          ) : (
            <CircleHub
              me={me}
              circle={circle}
              members={members}
              alerts={alerts}
              invites={invites}
              act={act}
              onCheck={goCheck}
              autoInvite={inviteAfterCreate && members.some((m) => m.uid === me.uid)}
              onAutoInviteShown={() => setInviteAfterCreate(false)}
            />
          ))}
        {familyError && tab === 'home' && <p className="error">{familyError}</p>}
        {tab === 'check' && <CheckView text={text} setText={setText} busy={stage} error={error} onCheck={(r) => void check(r)} />}
        {tab === 'result' && result && (
          <ResultView
            result={result}
            online={online}
            deepBusy={deepBusy}
            familyState={familyState}
            onDeepCheck={() => void deepCheck()}
            onAlertFamily={() => void shareWithFamily(result, policy, true)}
            onAgain={() => {
              setText('');
              goCheck();
            }}
          />
        )}
        {tab === 'activity' && (
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
        {tab === 'settings' && (
          <SettingsView
            me={me}
            authAvailable={!!services}
            onSignIn={() => void doSignIn().catch((e) => setError(e.message))}
            onSignOut={() => services && void signOut(services.auth)}
            device={device}
            onSetupDevice={setupDevice}
            largeText={largeText}
            setLargeText={setLargeText}
            policy={policy}
          />
        )}
        <p className="disclaimer">Kinguard gives guidance, not guarantees. When in doubt, hang up and call someone you trust.</p>
      </main>

      <nav className="bottomnav" aria-label="Main">
        <button className={tab === 'home' ? 'on' : ''} onClick={() => setTab('home')}>
          <span className="nav-ico"><IconHome />{unread > 0 && <span className="dot-badge">{unread}</span>}</span>
          <span>{me && circle ? 'Circle' : 'Home'}</span>
        </button>
        <button className={`nav-check ${tab === 'check' || tab === 'result' ? 'on' : ''}`} onClick={goCheck} aria-label="Check a message">
          <span className="nav-fab"><IconShield size={28} /></span>
          <span>Check</span>
        </button>
        <button className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}>
          <span className="nav-ico"><IconClock /></span>
          <span>Activity</span>
        </button>
        <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>
          <span className="nav-ico"><IconSettings /></span>
          <span>Settings</span>
        </button>
      </nav>

      <Sheet open={switcher} title="Your circles" onClose={() => setSwitcher(false)}>
        <ul className="circle-list">
          {circles.map((c) => (
            <li key={c.id}>
              <button className={`circle-item ${c.id === circle?.id ? 'on' : ''}`} onClick={() => { setCircleId(c.id); setSwitcher(false); setTab('home'); }}>
                <span className="cs-icon big"><IconUsers size={20} /></span>
                <span className="grow"><strong>{c.name}</strong><span className="muted small">{c.memberUids.length} of {fam.MAX_MEMBERS} people</span></span>
                {c.id === circle?.id && <span className="chip">Current</span>}
              </button>
            </li>
          ))}
        </ul>
        <button className="btn btn-soft btn-block" onClick={() => { setSwitcher(false); setCreateOpen(true); }}><IconPlus size={18} /> Create a new circle</button>
        <button className="btn btn-ghost btn-block" onClick={() => { setSwitcher(false); setJoinCode(''); }}><IconUsers size={18} /> Join with a code</button>
      </Sheet>
      {me && circle && joinCode !== null && (
        <JoinSheet open initialCode={joinCode || null} onClose={() => setJoinCode(null)} act={act} />
      )}
      {me && <CreateCircleSheet open={createOpen} me={me} onClose={() => setCreateOpen(false)} act={act} />}
    </div>
  );
}
