// Accounts. Checking messages needs no account. Family circles need a Google account
// so they survive cleared browsers and follow the user to any device.
import {
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut as fbSignOut,
  type Auth,
  type AuthError,
  type User,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';

export interface Me {
  uid: string;
  name: string;
  firstName: string;
  photoURL: string | null;
  email: string | null;
}

export function toMe(u: User | null): Me | null {
  if (!u || u.isAnonymous) return null;
  const name = u.displayName || u.email?.split('@')[0] || 'Me';
  return { uid: u.uid, name, firstName: name.split(' ')[0], photoURL: u.photoURL, email: u.email };
}

export function watchUser(auth: Auth, cb: (me: Me | null) => void) {
  return onAuthStateChanged(auth, (u) => cb(toMe(u)));
}

export async function signInWithGoogle(auth: Auth, db: Firestore): Promise<Me> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  let user: User;
  const current = auth.currentUser;
  if (current?.isAnonymous) {
    // Upgrade the anonymous session in place so nothing it owns is lost.
    try {
      user = (await linkWithPopup(current, provider)).user;
    } catch (e) {
      const err = e as AuthError;
      if (err.code !== 'auth/credential-already-in-use') throw friendly(err);
      const cred = GoogleAuthProvider.credentialFromError(err);
      if (!cred) throw friendly(err);
      user = (await signInWithCredential(auth, cred)).user;
    }
  } else {
    try {
      user = (await signInWithPopup(auth, provider)).user;
    } catch (e) {
      throw friendly(e as AuthError);
    }
  }
  const me = toMe(user)!;
  await setDoc(
    doc(db, 'users', me.uid),
    { name: me.name, photoURL: me.photoURL, updatedAt: serverTimestamp() },
    { merge: true },
  ).catch(() => {});
  return me;
}

export function signOut(auth: Auth) {
  return fbSignOut(auth);
}

function friendly(e: AuthError): Error {
  if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return new Error('Sign-in was cancelled.');
  if (e.code === 'auth/popup-blocked') return new Error('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.');
  if (e.code === 'auth/operation-not-allowed') return new Error('Google sign-in is not turned on for this app yet.');
  return new Error(e.message || 'Sign-in failed. Please try again.');
}
