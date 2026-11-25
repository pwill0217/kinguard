import { useEffect, useState } from 'react';
import { CATEGORY_LABEL, type Category, type Verdict } from '../ai/types';
import type { Me } from '../family/account';
import {
  canManage,
  MAX_MEMBERS,
  normalizeCode,
  type Circle,
  type FamilyAlert,
  type Invite,
  type Member,
} from '../family/circles';
import { Avatar, AvatarStack, Sheet, timeAgo, timeLeft, VerdictIcon } from './bits';
import { IconBell, IconChevronRight, IconCopy, IconGoogle, IconLock, IconPlus, IconSettings, IconShare, IconShield, IconUsers } from './icons';

export interface CircleActions {
  signIn: () => Promise<void>;
  createCircle: (name: string, iAmProtected: boolean) => Promise<void>;
  previewInvite: (code: string) => Promise<Invite>;
  joinCircle: (inv: Invite) => Promise<void>;
  createInvite: (asProtected: boolean) => Promise<Invite>;
  revokeInvite: (code: string) => Promise<void>;
  removeMember: (uid: string) => Promise<void>;
  setRole: (uid: string, role: 'admin' | 'member') => Promise<void>;
  setProtected: (uid: string, v: boolean) => Promise<void>;
  renameCircle: (name: string) => Promise<void>;
  deleteCircle: () => Promise<void>;
  acknowledge: (alertId: string) => Promise<void>;
}

const VERDICT_WORD: Record<Verdict, string> = { safe: 'All clear', suspicious: 'Checked something suspicious', likely_scam: 'Caught a likely scam' };

export function inviteLink(code: string) {
  return `${location.origin}/join/${code}`;
}

async function shareInvite(inv: Invite): Promise<'shared' | 'copied'> {
  const text = `Join our family circle "${inv.circleName}" on Kinguard, the scam checker. Code: ${inv.code}`;
  const url = inviteLink(inv.code);
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Join my Kinguard circle', text, url });
      return 'shared';
    } catch {
      /* cancelled: fall through to copy */
    }
  }
  await navigator.clipboard?.writeText(`${text}\n${url}`);
  return 'copied';
}

function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError((e as Error).message || 'Something went wrong.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

// ---------- signed-out / empty states ----------

export function SignInCard({ onSignIn, available }: { onSignIn: () => Promise<void>; available: boolean }) {
  const { busy, error, run } = useBusy();
  return (
    <section className="hero-card hero-welcome">
      <div className="hero-art" aria-hidden="true">
        <span className="orb o1">👵</span>
        <span className="orb o2">🧑</span>
        <span className="orb o3">👧</span>
        <span className="orb o4">👴</span>
        <span className="hero-shield"><IconShield size={40} /></span>
      </div>
      <h1>Scam protection for the people you love</h1>
      <p>Create a family circle. When Kinguard catches a likely scam, the people who look out for each other find out right away, without anyone's messages being shared.</p>
      <button className="btn btn-google" disabled={busy || !available} onClick={() => run(onSignIn)}>
        <IconGoogle /> Continue with Google
      </button>
      <p className="fine">Your circle is saved to your account, so it works on every device. Checking a message never needs an account.</p>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export function NoCircle({ me, act, initialCode }: { me: Me; act: CircleActions; initialCode?: string | null }) {
  const [sheet, setSheet] = useState<'create' | 'join' | null>(initialCode ? 'join' : null);
  const { busy, error, run } = useBusy();
  const lastName = me.name.split(' ').slice(1).join(' ');
  const defaultName = lastName ? `The ${lastName} Family` : `${me.firstName}'s Family`;
  return (
    <>
      <section className="hero-card status status-ok">
        <div className="solo">
          <Avatar name={me.name} photoURL={me.photoURL} seed={me.uid} size={84} />
          <div>
            <p className="eyebrow">Welcome, {me.firstName}</p>
            <h1>It's just you so far</h1>
            <p>Invite the people you look out for, or the people who look out for you. Up to {MAX_MEMBERS} per family.</p>
          </div>
        </div>
        <div className="status-bottom">
          <button className="btn btn-light" disabled={busy} onClick={() => run(() => act.createCircle(defaultName, false))}>
            <IconPlus size={18} /> {busy ? 'Setting up…' : 'Invite family'}
          </button>
          <button className="btn btn-glass" onClick={() => setSheet('join')}>I have a code</button>
        </div>
      </section>
      {error && <p className="error">{error}</p>}

      <section className="card">
        <div className="section-head">
          <h2>Your family <span className="count">1/{MAX_MEMBERS}</span></h2>
        </div>
        <ul className="member-list">
          <li>
            <div className="member-row">
              <Avatar name={me.name} photoURL={me.photoURL} seed={me.uid} />
              <span className="grow">
                <span className="member-name">{me.name} <span className="you">(you)</span></span>
                <span className="member-status">{me.email}</span>
              </span>
            </div>
          </li>
          {[1, 2].map((i) => (
            <li key={i}>
              <button className="member-row ghost-row" disabled={busy} onClick={() => run(() => act.createCircle(defaultName, false))}>
                <span className="avatar ghost-avatar" style={{ width: 44, height: 44 }}><IconPlus size={18} /></span>
                <span className="grow">
                  <span className="member-name muted">{i === 1 ? 'Add a parent or grandparent' : 'Add a helper'}</span>
                  <span className="member-status">{i === 1 ? "You'll get a heads-up if they run into a likely scam" : 'A sibling or relative who also gets alerts'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button className="link" onClick={() => setSheet('create')}>Or create a family with a custom name</button>
      </section>
      <CreateCircleSheet open={sheet === 'create'} me={me} onClose={() => setSheet(null)} act={act} />
      <JoinSheet open={sheet === 'join'} onClose={() => setSheet(null)} act={act} initialCode={initialCode} />
    </>
  );
}

export function CreateCircleSheet({ open, onClose, act, me }: { open: boolean; onClose: () => void; act: CircleActions; me: Me }) {
  const lastName = me.name.split(' ').slice(1).join(' ');
  const [name, setName] = useState(lastName ? `The ${lastName} Family` : 'My Family');
  const [iAmProtected, setIAmProtected] = useState(false);
  const { busy, error, run } = useBusy();
  return (
    <Sheet open={open} title="Create a circle" onClose={onClose}>
      <label htmlFor="cname">Circle name</label>
      <input id="cname" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      <label className="switch-row">
        <span>
          <strong>Watch my messages too</strong>
          <span className="muted">Alert this circle when I check something that looks like a scam.</span>
        </span>
        <input type="checkbox" className="switch" checked={iAmProtected} onChange={(e) => setIAmProtected(e.target.checked)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={busy || !name.trim()} onClick={async () => (await run(() => act.createCircle(name.trim(), iAmProtected))) && onClose()}>
        {busy ? 'Creating…' : 'Create circle'}
      </button>
    </Sheet>
  );
}

export function JoinSheet({ open, onClose, act, initialCode }: { open: boolean; onClose: () => void; act: CircleActions; initialCode?: string | null }) {
  const [code, setCode] = useState(initialCode ?? '');
  const [inv, setInv] = useState<Invite | null>(null);
  const { busy, error, run, setError } = useBusy();
  useEffect(() => {
    if (open && initialCode && initialCode.length === 6 && !inv) void run(async () => setInv(await act.previewInvite(initialCode)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCode]);
  return (
    <Sheet open={open} title="Join a circle" onClose={onClose}>
      {!inv ? (
        <>
          <label htmlFor="jcode">Invite code</label>
          <input
            id="jcode"
            className="code-input"
            value={code}
            placeholder="ABC234"
            autoCapitalize="characters"
            onChange={(e) => {
              setCode(normalizeCode(e.target.value));
              setError(null);
            }}
          />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6} onClick={() => run(async () => setInv(await act.previewInvite(code)))}>
            {busy ? 'Checking…' : 'Continue'}
          </button>
        </>
      ) : (
        <div className="join-preview">
          <span className="join-icon"><IconUsers size={28} /></span>
          <p className="muted">{inv.createdByName} invited you to</p>
          <h3>{inv.circleName}</h3>
          <p className="chip-row">
            {inv.asProtected ? <span className="chip chip-protected"><IconShield size={14} /> You'll be protected</span> : <span className="chip">You'll be a helper</span>}
          </p>
          <p className="muted small">
            {inv.asProtected
              ? 'When you check a message that looks like a scam, this circle gets a heads-up. They never see your messages.'
              : "You'll get a heads-up when someone you protect runs into a likely scam."}
          </p>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy} onClick={async () => (await run(() => act.joinCircle(inv))) && onClose()}>
            {busy ? 'Joining…' : `Join ${inv.circleName}`}
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => setInv(null)}>Use a different code</button>
        </div>
      )}
    </Sheet>
  );
}

// ---------- the hub ----------

export function CircleHub(props: {
  me: Me;
  circle: Circle;
  members: Member[];
  alerts: FamilyAlert[];
  invites: Invite[];
  act: CircleActions;
  onCheck: () => void;
  autoInvite?: boolean;
  onAutoInviteShown?: () => void;
}) {
  const { me, circle, members, alerts, invites, act } = props;
  const myRole = members.find((m) => m.uid === me.uid)?.role;
  const manager = canManage(myRole);
  const [sheet, setSheet] = useState<'invite' | 'settings' | null>(null);
  const [memberSheet, setMemberSheet] = useState<Member | null>(null);
  const weekAgo = Date.now() - 7 * 86400_000;
  const needsAttention = alerts.filter((a) => a.verdict !== 'safe' && (a.createdAt?.getTime() ?? Date.now()) > weekAgo && a.ackBy.length === 0 && a.fromUid !== me.uid);
  const protectedCount = members.filter((m) => m.protected).length;
  const full = members.length >= MAX_MEMBERS;
  useEffect(() => {
    if (props.autoInvite && manager) {
      setSheet('invite');
      props.onAutoInviteShown?.();
    }
  }, [props.autoInvite, manager]); // eslint-disable-line react-hooks/exhaustive-deps
  const solo = members.length === 1;

  return (
    <>
      <section className={`hero-card status ${needsAttention.length ? 'status-alert' : 'status-ok'}`}>
        <div className="status-top">
          <div>
            <p className="eyebrow">{circle.name}</p>
            <h1>{needsAttention.length ? `${needsAttention.length} warning${needsAttention.length > 1 ? 's' : ''} need${needsAttention.length > 1 ? '' : 's'} attention` : solo ? "It's just you so far" : "Everyone's safe"}</h1>
            <p>
              {solo ? 'Invite your family to start looking out for each other.' : `${protectedCount} protected · ${members.length - protectedCount} helper${members.length - protectedCount === 1 ? '' : 's'}`}
            </p>
          </div>
          <span className="status-badge">{needsAttention.length ? <IconBell size={28} /> : <IconShield size={28} />}</span>
        </div>
        <div className="status-bottom">
          <AvatarStack people={members} size={solo ? 48 : 38} />
          {solo && manager ? (
            <button className="btn btn-light" onClick={() => setSheet('invite')}><IconPlus size={18} /> Invite family</button>
          ) : (
            <button className="btn btn-light" onClick={props.onCheck}>Check a message</button>
          )}
        </div>
      </section>

      {needsAttention.length > 0 && (
        <section className="card">
          <div className="section-head"><h2>Needs attention</h2></div>
          <AlertList alerts={needsAttention} me={me} members={members} act={act} />
        </section>
      )}

      <section className="card">
        <div className="section-head">
          <h2>Members <span className="count">{members.length}/{MAX_MEMBERS}</span></h2>
          {manager && (
            <button className="btn btn-soft btn-sm" disabled={full} onClick={() => setSheet('invite')}>
              <IconPlus size={16} /> Invite
            </button>
          )}
        </div>
        {full && manager && <p className="muted small">This circle is full. Remove someone to invite another person.</p>}
        <ul className="member-list">
          {members.map((m) => {
            const status = m.protected
              ? m.lastCheck
                ? `${VERDICT_WORD[m.lastCheck.verdict]} · ${timeAgo(m.lastCheck.at)}`
                : 'Protected · no checks yet'
              : 'Helper';
            const clickable = manager || m.uid === me.uid;
            return (
              <li key={m.uid}>
                <button className="member-row" disabled={!clickable} onClick={() => setMemberSheet(m)}>
                  <Avatar name={m.name} photoURL={m.photoURL} seed={m.uid} ring={m.protected ? m.lastCheck?.verdict ?? 'none' : 'none'} />
                  <span className="grow">
                    <span className="member-name">
                      {m.name}
                      {m.uid === me.uid && <span className="you"> (you)</span>}
                    </span>
                    <span className={`member-status ${m.lastCheck && m.protected ? `st-${m.lastCheck.verdict}` : ''}`}>{status}</span>
                  </span>
                  <span className="chips">
                    {m.protected && <span className="chip chip-protected" title="Protected"><IconShield size={14} /></span>}
                    {m.role !== 'member' && <span className="chip">{m.role === 'owner' ? 'Owner' : 'Admin'}</span>}
                  </span>
                  {clickable && <IconChevronRight size={18} className="muted" />}
                </button>
              </li>
            );
          })}
        </ul>
        {manager && invites.length > 0 && (
          <div className="invites">
            <h3>Pending invites</h3>
            {invites.map((i) => (
              <InviteRow key={i.code} inv={i} onRevoke={() => act.revokeInvite(i.code)} />
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-head"><h2>Recent alerts</h2></div>
        {alerts.filter((a) => !needsAttention.includes(a)).length === 0 ? (
          <p className="muted">{alerts.length ? 'Nothing else recently.' : 'No alerts yet.'} {alerts.length ? '' : ' When a protected member checks a likely scam, it shows up here, instantly.'}</p>
        ) : (
          <AlertList alerts={alerts.filter((a) => !needsAttention.includes(a)).slice(0, 10)} me={me} members={members} act={act} />
        )}
      </section>

      <button className="settings-link" onClick={() => setSheet('settings')}>
        <IconSettings size={18} /> Circle settings
      </button>

      <InviteSheet open={sheet === 'invite'} onClose={() => setSheet(null)} act={act} circle={circle} />
      <CircleSettingsSheet open={sheet === 'settings'} onClose={() => setSheet(null)} act={act} circle={circle} me={me} myRole={myRole} />
      {memberSheet && (
        <MemberSheet
          member={members.find((m) => m.uid === memberSheet.uid) ?? memberSheet}
          me={me}
          myRole={myRole}
          act={act}
          onClose={() => setMemberSheet(null)}
        />
      )}
    </>
  );
}

function AlertList({ alerts, me, members, act }: { alerts: FamilyAlert[]; me: Me; members: Member[]; act: CircleActions }) {
  return (
    <ul className="alert-list">
      {alerts.map((a) => {
        const from = members.find((m) => m.uid === a.fromUid);
        const mine = a.fromUid === me.uid;
        const acked = a.ackBy.includes(me.uid);
        return (
          <li key={a.id} className={`alert alert-${a.verdict}`}>
            <span className="alert-avatar">
              <Avatar name={a.fromName} photoURL={from?.photoURL} seed={a.fromUid} size={40} />
              <span className="alert-mark"><VerdictIcon verdict={a.verdict} size={18} /></span>
            </span>
            <div className="grow">
              <p className="alert-title"><strong>{mine ? 'You' : a.fromName}</strong> · {a.headline}</p>
              <p className="muted small">{CATEGORY_LABEL[a.category as Category] ?? a.category} · risk {a.riskScore} · {timeAgo(a.createdAt)}</p>
              <p className="alert-body">{a.explanation}</p>
              {a.ackNames.length > 0 && <p className="ack">✓ {a.ackNames.join(', ')} {a.ackNames.length > 1 ? 'are' : 'is'} on it</p>}
            </div>
            {!mine && !acked && (
              <button className="btn btn-soft btn-sm" onClick={() => void act.acknowledge(a.id)}>I'll call</button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function InviteRow({ inv, onRevoke }: { inv: Invite; onRevoke: () => Promise<void> }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="invite-row">
      <code className="invite-code">{inv.code}</code>
      <span className="grow small">
        {inv.asProtected ? 'Someone to protect' : 'Helper'} · <span className="muted">{timeLeft(inv.expiresAt)}</span>
        {msg && <span className="ok"> · {msg}</span>}
      </span>
      <button className="icon-btn" aria-label="Share invite" onClick={async () => setMsg((await shareInvite(inv)) === 'copied' ? 'Copied' : 'Shared')}>
        <IconShare size={18} />
      </button>
      <button className="link danger" onClick={() => void onRevoke()}>Cancel</button>
    </div>
  );
}

function InviteSheet({ open, onClose, act, circle }: { open: boolean; onClose: () => void; act: CircleActions; circle: Circle }) {
  const [inv, setInv] = useState<Invite | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const { busy, error, run } = useBusy();
  const close = () => {
    setInv(null);
    setCopied(null);
    onClose();
  };
  return (
    <Sheet open={open} title={`Invite to ${circle.name}`} onClose={close}>
      {!inv ? (
        <>
          <p className="muted">Who are you inviting?</p>
          <div className="choice-grid">
            <button className="choice" disabled={busy} onClick={() => run(async () => setInv(await act.createInvite(true)))}>
              <span className="choice-icon"><IconShield /></span>
              <strong>Someone to protect</strong>
              <span>A parent or grandparent. You'll be told if they run into a likely scam.</span>
            </button>
            <button className="choice" disabled={busy} onClick={() => run(async () => setInv(await act.createInvite(false)))}>
              <span className="choice-icon alt"><IconUsers /></span>
              <strong>A helper</strong>
              <span>A sibling or relative who also gets the heads-up.</span>
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </>
      ) : (
        <div className="invite-ready">
          <p className="muted">Share this code. It works once per person and {timeLeft(inv.expiresAt)}.</p>
          <p className="code-display">{inv.code}</p>
          <button className="btn btn-primary btn-block" onClick={async () => setCopied((await shareInvite(inv)) === 'copied' ? 'Invite copied. Paste it in a text or email.' : 'Shared!')}>
            <IconShare size={18} /> Share invite
          </button>
          <button className="btn btn-ghost btn-block" onClick={async () => { await navigator.clipboard?.writeText(inv.code); setCopied('Code copied.'); }}>
            <IconCopy size={18} /> Copy code
          </button>
          {copied && <p className="ok center">{copied}</p>}
          <p className="fine center"><IconLock size={14} /> They'll sign in with Google, then enter the code.</p>
        </div>
      )}
    </Sheet>
  );
}

function MemberSheet({ member: m, me, myRole, act, onClose }: { member: Member; me: Me; myRole: Member['role'] | undefined; act: CircleActions; onClose: () => void }) {
  const { busy, error, run } = useBusy();
  const self = m.uid === me.uid;
  const manager = canManage(myRole);
  const canToggleProtected = self || manager;
  const canChangeRole = myRole === 'owner' && !self && m.role !== 'owner';
  const canRemove = !self && manager && m.role !== 'owner' && (myRole === 'owner' || m.role === 'member');
  const canLeave = self && m.role !== 'owner';
  return (
    <Sheet open title={self ? 'Your membership' : 'Member'} onClose={onClose}>
      <div className="member-hero">
        <Avatar name={m.name} photoURL={m.photoURL} seed={m.uid} size={72} ring={m.protected ? m.lastCheck?.verdict ?? 'none' : 'none'} />
        <div>
          <h3>{m.name}</h3>
          <p className="muted small">
            {m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Admin' : 'Member'}
            {m.joinedAt ? ` · joined ${m.joinedAt.toLocaleDateString()}` : ''}
          </p>
          {m.protected && m.lastCheck && <p className="small">Last check: {VERDICT_WORD[m.lastCheck.verdict]} · {timeAgo(m.lastCheck.at)}</p>}
        </div>
      </div>
      {canToggleProtected && (
        <label className="switch-row">
          <span>
            <strong>Protected</strong>
            <span className="muted">{self ? 'Alert this circle when I check something that looks like a scam.' : `Alert the circle when ${m.name.split(' ')[0]} checks a likely scam.`}</span>
          </span>
          <input type="checkbox" className="switch" checked={m.protected} disabled={busy} onChange={(e) => run(() => act.setProtected(m.uid, e.target.checked))} />
        </label>
      )}
      {canChangeRole && (
        <label className="switch-row">
          <span>
            <strong>Admin</strong>
            <span className="muted">Admins can invite and remove members.</span>
          </span>
          <input type="checkbox" className="switch" checked={m.role === 'admin'} disabled={busy} onChange={(e) => run(() => act.setRole(m.uid, e.target.checked ? 'admin' : 'member'))} />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      {canRemove && (
        <button className="btn btn-danger-soft btn-block" disabled={busy} onClick={async () => {
          if (!window.confirm(`Remove ${m.name} from this circle?`)) return;
          if (await run(() => act.removeMember(m.uid))) onClose();
        }}>Remove from circle</button>
      )}
      {canLeave && (
        <button className="btn btn-danger-soft btn-block" disabled={busy} onClick={async () => {
          if (!window.confirm('Leave this circle? You can rejoin with a new invite.')) return;
          if (await run(() => act.removeMember(m.uid))) onClose();
        }}>Leave circle</button>
      )}
    </Sheet>
  );
}

function CircleSettingsSheet({ open, onClose, act, circle, me, myRole }: { open: boolean; onClose: () => void; act: CircleActions; circle: Circle; me: Me; myRole: Member['role'] | undefined }) {
  const [name, setName] = useState(circle.name);
  const { busy, error, run } = useBusy();
  useEffect(() => setName(circle.name), [circle.name]);
  return (
    <Sheet open={open} title="Circle settings" onClose={onClose}>
      {canManage(myRole) && (
        <>
          <label htmlFor="rname">Circle name</label>
          <div className="row gap">
            <input id="rname" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            <button className="btn btn-soft" disabled={busy || !name.trim() || name === circle.name} onClick={() => run(() => act.renameCircle(name.trim()))}>Save</button>
          </div>
        </>
      )}
      <p className="muted small">Up to {MAX_MEMBERS} people per circle. Invite codes expire after 48 hours and can be cancelled anytime.</p>
      {error && <p className="error">{error}</p>}
      {myRole === 'owner' ? (
        <button className="btn btn-danger-soft btn-block" disabled={busy} onClick={async () => {
          if (!window.confirm(`Delete "${circle.name}" for everyone? This can't be undone.`)) return;
          if (await run(() => act.deleteCircle())) onClose();
        }}>Delete circle</button>
      ) : (
        <button className="btn btn-danger-soft btn-block" disabled={busy} onClick={async () => {
          if (!window.confirm('Leave this circle?')) return;
          if (await run(() => act.removeMember(me.uid))) onClose();
        }}>Leave circle</button>
      )}
    </Sheet>
  );
}
