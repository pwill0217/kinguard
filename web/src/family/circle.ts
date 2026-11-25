// Family circle: a protected person and their trusted helpers share a 6-character code.
// Only the REDACTED verdict is ever written to Firestore.
import { signInAnonymously, type Auth } from 'firebase/auth';
import {
  addDoc,
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
  updateDoc,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';
import type { CheckResult } from '../ai/types';

export interface Membership {
  code: string;
  myName: string;
  role: 'protected' | 'helper';
  autoAlert: boolean;
}

export interface FamilyAlert {
  id: string;
  fromUid: string;
  fromName: string;
  verdict: CheckResult['shareable']['verdict'];
  riskScore: number;
  category: string;
  headline: string;
  explanation: string;
  createdAt: Date | null;
  ackBy: string[];
  ackNames: string[];
}

const KEY = 'kinguard.circle';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function loadMembership(): Membership | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Membership) : null;
  } catch {
    return null;
  }
}

export function saveMembership(m: Membership | null) {
  try {
    if (m) localStorage.setItem(KEY, JSON.stringify(m));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

export async function ensureUser(auth: Auth): Promise<string> {
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

export function newCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export async function createCircle(db: Firestore, uid: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const ref = doc(db, 'circles', code);
    try {
      await setDoc(ref, { createdBy: uid, members: [uid], createdAt: serverTimestamp() });
      return code;
    } catch (e) {
      // Collision with an existing circle (rules reject overwrite) -> try another code.
      if (attempt === 4) throw e;
    }
  }
  throw new Error('Could not create a circle');
}

export async function joinCircle(db: Firestore, uid: string, code: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'circles', code), { members: arrayUnion(uid) });
  } catch (e) {
    const msg = (e as { code?: string }).code;
    if (msg === 'not-found' || msg === 'permission-denied') {
      // permission-denied also covers "already a member" (no change) -> check membership.
      const snap = await getDoc(doc(db, 'circles', code)).catch(() => null);
      if (snap?.exists() && (snap.data().members as string[]).includes(uid)) return;
      throw new Error('That code was not found. Check the letters and try again.');
    }
    throw e;
  }
}

export async function sendAlert(db: Firestore, uid: string, m: Membership, result: CheckResult): Promise<void> {
  const s = result.shareable;
  await addDoc(collection(db, 'circles', m.code, 'alerts'), {
    fromUid: uid,
    fromName: m.myName.slice(0, 40),
    verdict: s.verdict,
    riskScore: s.riskScore,
    category: s.category,
    headline: s.headline.slice(0, 200),
    explanation: s.explanation.slice(0, 1000),
    createdAt: serverTimestamp(),
    ackBy: [],
    ackNames: [],
  });
}

export async function acknowledge(db: Firestore, uid: string, name: string, code: string, alertId: string) {
  await updateDoc(doc(db, 'circles', code, 'alerts', alertId), {
    ackBy: arrayUnion(uid),
    ackNames: arrayUnion(name.slice(0, 40)),
  });
}

export function watchAlerts(db: Firestore, code: string, cb: (alerts: FamilyAlert[]) => void, onError: (e: Error) => void) {
  const q = query(collection(db, 'circles', code, 'alerts'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (snap) =>
      cb(
        snap.docs.map((d) => {
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
            createdAt: (v.createdAt as Timestamp | null)?.toDate?.() ?? null,
            ackBy: v.ackBy ?? [],
            ackNames: v.ackNames ?? [],
          };
        }),
      ),
    (e) => onError(e),
  );
}
