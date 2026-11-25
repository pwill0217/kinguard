// Family circles. Data model (all enforced by firestore.rules):
//
//   circles/{circleId}                 { name, ownerUid, memberUids[], createdAt }      max 8 members
//   circles/{circleId}/members/{uid}   { name, photoURL, role, protected, joinedAt, lastCheck, inviteCode? }
//   circles/{circleId}/alerts/{id}     redacted verdict only (never the message)
//   invites/{code}                     { circleId, circleName, createdBy, createdByName, asProtected, expiresAt, revoked }
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type { CheckResult, Verdict } from '../ai/types';
import type { Me } from './account';

export const MAX_MEMBERS = 8;
export const INVITE_HOURS = 48;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export type Role = 'owner' | 'admin' | 'member';

export interface Circle {
  id: string;
  name: string;
  ownerUid: string;
  memberUids: string[];
}

export interface Member {
  uid: string;
  name: string;
  photoURL: string | null;
  role: Role;
  protected: boolean;
  joinedAt: Date | null;
  lastCheck: { at: Date; verdict: Verdict } | null;
}

export interface Invite {
  code: string;
  circleId: string;
  circleName: string;
  createdBy: string;
  createdByName: string;
  asProtected: boolean;
  expiresAt: Date;
  revoked: boolean;
}

export interface FamilyAlert {
  id: string;
  fromUid: string;
  fromName: string;
  verdict: Verdict;
  riskScore: number;
  category: string;
  headline: string;
  explanation: string;
  createdAt: Date | null;
  ackBy: string[];
  ackNames: string[];
}

const toDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);

export function newCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export const canManage = (role: Role | undefined) => role === 'owner' || role === 'admin';

// ---------- live data ----------

export function watchMyCircles(db: Firestore, uid: string, cb: (c: Circle[]) => void, onErr: (e: Error) => void) {
  const q = query(collection(db, 'circles'), where('memberUids', 'array-contains', uid));
  return onSnapshot(
    q,
    (s) =>
      cb(
        s.docs
          .map((d) => ({ id: d.id, name: d.data().name, ownerUid: d.data().ownerUid, memberUids: d.data().memberUids ?? [] }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    onErr,
  );
}

export function watchMembers(db: Firestore, circleId: string, cb: (m: Member[]) => void, onErr: (e: Error) => void) {
  return onSnapshot(
    collection(db, 'circles', circleId, 'members'),
    (s) => {
      const order: Record<Role, number> = { owner: 0, admin: 1, member: 2 };
      cb(
        s.docs
          .map((d) => {
            const v = d.data();
            return {
              uid: d.id,
              name: v.name ?? 'Member',
              photoURL: v.photoURL ?? null,
              role: (v.role ?? 'member') as Role,
              protected: !!v.protected,
              joinedAt: toDate(v.joinedAt),
              lastCheck: v.lastCheck?.at ? { at: toDate(v.lastCheck.at) ?? new Date(), verdict: v.lastCheck.verdict } : null,
            };
          })
          .sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name)),
      );
    },
    onErr,
  );
}

export function watchInvites(db: Firestore, circleId: string, cb: (i: Invite[]) => void, onErr: (e: Error) => void) {
  const q = query(collection(db, 'invites'), where('circleId', '==', circleId), where('revoked', '==', false));
  return onSnapshot(
    q,
    (s) =>
      cb(
        s.docs
          .map((d) => inviteFrom(d.id, d.data()))
          .filter((i) => i.expiresAt > new Date())
          .sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime()),
      ),
    onErr,
  );
}

export function watchAlerts(db: Firestore, circleId: string, cb: (a: FamilyAlert[]) => void, onErr: (e: Error) => void) {
  const q = query(collection(db, 'circles', circleId, 'alerts'), orderBy('createdAt', 'desc'), limit(30));
  return onSnapshot(
    q,
    (s) =>
      cb(
        s.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            fromUid: v.fromUid,
            fromName: v.fromName,
            verdict: v.verdict,
            riskScore: v.riskScore,
            category: v.category,
            headline: v.headline,
            explanation: v.explanation,
            createdAt: toDate(v.createdAt),
            ackBy: v.ackBy ?? [],
            ackNames: v.ackNames ?? [],
          };
        }),
      ),
    onErr,
  );
}

function inviteFrom(code: string, v: Record<string, unknown>): Invite {
  return {
    code,
    circleId: v.circleId as string,
    circleName: (v.circleName as string) ?? 'Family',
    createdBy: v.createdBy as string,
    createdByName: (v.createdByName as string) ?? 'A family member',
    asProtected: !!v.asProtected,
    expiresAt: toDate(v.expiresAt) ?? new Date(0),
    revoked: !!v.revoked,
  };
}

// ---------- actions ----------

export async function createCircle(db: Firestore, me: Me, name: string, iAmProtected: boolean): Promise<string> {
  const ref = doc(collection(db, 'circles'));
  const batch = writeBatch(db);
  batch.set(ref, { name: name.slice(0, 40), ownerUid: me.uid, memberUids: [me.uid], createdAt: serverTimestamp() });
  batch.set(doc(db, 'circles', ref.id, 'members', me.uid), {
    name: me.name.slice(0, 60),
    photoURL: me.photoURL,
    role: 'owner',
    protected: iAmProtected,
    joinedAt: serverTimestamp(),
    lastCheck: null,
  });
  await batch.commit();
  return ref.id;
}

export async function createInvite(db: Firestore, me: Me, circle: Circle, asProtected: boolean): Promise<Invite> {
  if (circle.memberUids.length >= MAX_MEMBERS) throw new Error(`A circle can have up to ${MAX_MEMBERS} people.`);
  const expiresAt = new Date(Date.now() + INVITE_HOURS * 3600_000);
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = newCode();
    try {
      await setDoc(doc(db, 'invites', code), {
        circleId: circle.id,
        circleName: circle.name,
        createdBy: me.uid,
        createdByName: me.firstName,
        asProtected,
        expiresAt: Timestamp.fromDate(expiresAt),
        revoked: false,
        createdAt: serverTimestamp(),
      });
      return { code, circleId: circle.id, circleName: circle.name, createdBy: me.uid, createdByName: me.firstName, asProtected, expiresAt, revoked: false };
    } catch (e) {
      if (attempt === 3) throw e; // collision with an existing code is rejected by the rules
    }
  }
  throw new Error('Could not create an invite');
}

export async function revokeInvite(db: Firestore, code: string) {
  await updateDoc(doc(db, 'invites', code), { revoked: true });
}

export async function previewInvite(db: Firestore, code: string): Promise<Invite> {
  const snap = await getDoc(doc(db, 'invites', code)).catch(() => null);
  if (!snap?.exists()) throw new Error('That code was not found. Check the letters and try again.');
  const inv = inviteFrom(snap.id, snap.data());
  if (inv.revoked) throw new Error('That invite was cancelled. Ask for a new code.');
  if (inv.expiresAt < new Date()) throw new Error('That invite has expired. Ask for a new code.');
  return inv;
}

export async function joinWithInvite(db: Firestore, me: Me, inv: Invite) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'circles', inv.circleId, 'members', me.uid), {
    name: me.name.slice(0, 60),
    photoURL: me.photoURL,
    role: 'member',
    protected: inv.asProtected,
    joinedAt: serverTimestamp(),
    lastCheck: null,
    inviteCode: inv.code,
  });
  batch.update(doc(db, 'circles', inv.circleId), { memberUids: arrayUnion(me.uid) });
  try {
    await batch.commit();
  } catch (e) {
    if ((e as { code?: string }).code === 'permission-denied') {
      throw new Error(`Couldn't join. The circle may be full (${MAX_MEMBERS} people max), or you're already in it.`);
    }
    throw e;
  }
}

/** Leave a circle yourself, or (owner/admin) remove someone else. */
export async function removeMember(db: Firestore, circleId: string, uid: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'circles', circleId, 'members', uid));
  batch.update(doc(db, 'circles', circleId), { memberUids: arrayRemove(uid) });
  await batch.commit();
}

export async function deleteCircle(db: Firestore, circle: Circle) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'circles', circle.id));
  await batch.commit();
}

export async function renameCircle(db: Firestore, circleId: string, name: string) {
  await updateDoc(doc(db, 'circles', circleId), { name: name.slice(0, 40) });
}

export async function setRole(db: Firestore, circleId: string, uid: string, role: 'admin' | 'member') {
  await updateDoc(doc(db, 'circles', circleId, 'members', uid), { role });
}

export async function setProtected(db: Firestore, circleId: string, uid: string, value: boolean) {
  await updateDoc(doc(db, 'circles', circleId, 'members', uid), { protected: value });
}

/** Share only that a check happened and its verdict, so the circle sees "All clear · 2h ago". */
export async function recordMyCheck(db: Firestore, me: Me, circles: Circle[], verdict: Verdict) {
  await Promise.all(
    circles.map((c) =>
      updateDoc(doc(db, 'circles', c.id, 'members', me.uid), { lastCheck: { at: serverTimestamp(), verdict } }).catch(() => {}),
    ),
  );
}

export async function sendAlert(db: Firestore, me: Me, circleIds: string[], result: CheckResult) {
  const s = result.shareable;
  await Promise.all(
    circleIds.map((id) =>
      setDoc(doc(collection(db, 'circles', id, 'alerts')), {
        fromUid: me.uid,
        fromName: me.firstName.slice(0, 40),
        verdict: s.verdict,
        riskScore: s.riskScore,
        category: s.category,
        headline: s.headline.slice(0, 200),
        explanation: s.explanation.slice(0, 1000),
        createdAt: serverTimestamp(),
        ackBy: [],
        ackNames: [],
      }),
    ),
  );
}

export async function acknowledge(db: Firestore, me: Me, circleId: string, alertId: string) {
  await updateDoc(doc(db, 'circles', circleId, 'alerts', alertId), {
    ackBy: arrayUnion(me.uid),
    ackNames: arrayUnion(me.firstName.slice(0, 40)),
  });
}

/** Circles in which I'm marked as protected (where my high-risk alerts go). */
export async function circlesWhereProtected(db: Firestore, uid: string, circles: Circle[]): Promise<string[]> {
  const snaps = await Promise.all(circles.map((c) => getDoc(doc(db, 'circles', c.id, 'members', uid)).catch(() => null)));
  return circles.filter((_, i) => snaps[i]?.data()?.protected).map((c) => c.id);
}
