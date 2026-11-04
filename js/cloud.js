// Profiles: optional sign-in (Google or emailed link) that saves the Dex, stats and
// today's games to Firebase, so they follow the player across devices.
// Does nothing until FIREBASE_CONFIG is filled in (js/firebase-config.js).
import { FIREBASE_CONFIG } from './firebase-config.js';
import { exportProgress, importProgress, mergeProgress, clearProgress } from './storage.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const EMAIL_KEY = 'modidex:v1:pref:signInEmail';
const LAST_UID_KEY = 'modidex:v1:pref:lastUid'; // who this device's progress belongs to
let fb = null;
let user = null;
let status = 'off'; // off | loading | ready | error
const listeners = new Set();

export const cloudEnabled = () => !!FIREBASE_CONFIG;
// For social.js: the loaded Firebase modules/instances, or null.
export const cloudApi = () => (fb && user ? { ...fb, user } : null);
// Hooks so other modules can react after a save or before the profile is deleted.
const afterPush = new Set();
const beforeDelete = new Set();
export const onAfterPush = (fn) => afterPush.add(fn);
export const onBeforeDelete = (fn) => beforeDelete.add(fn);
export const currentUser = () => user;
export const cloudStatus = () => status;
export function onCloudChange(fn) { listeners.add(fn); }
const notify = (why) => listeners.forEach((fn) => fn(why));

export async function initCloud() {
  if (!FIREBASE_CONFIG) return;
  status = 'loading';
  try {
    const [appM, authM, fsM] = await Promise.all([
      import(`${SDK}firebase-app.js`), import(`${SDK}firebase-auth.js`), import(`${SDK}firebase-firestore.js`),
    ]);
    const app = appM.initializeApp(FIREBASE_CONFIG);
    const auth = authM.getAuth(app);
    fb = { authM, fsM, auth, db: fsM.getFirestore(app) };
    status = 'ready';

    // Finish an emailed sign-in link if that's how we got here.
    if (authM.isSignInWithEmailLink(auth, location.href)) {
      let email = null;
      try { email = localStorage.getItem(EMAIL_KEY); } catch { /* ignore */ }
      if (!email) email = prompt('Confirm your email to finish signing in:');
      if (email) {
        await authM.signInWithEmailLink(auth, email, location.href);
        try { localStorage.removeItem(EMAIL_KEY); } catch { /* ignore */ }
      }
      history.replaceState(null, '', location.pathname + location.hash);
    }

    authM.onAuthStateChanged(auth, async (u) => {
      user = u;
      if (u) await pullAndMerge();
      notify('auth');
    });
  } catch (e) {
    console.warn('[profiles] could not start:', e);
    status = 'error';
    notify('error');
  }
}

const userDoc = () => fb.fsM.doc(fb.db, 'users', user.uid);

const readLastUid = () => { try { return localStorage.getItem(LAST_UID_KEY); } catch { return null; } };
const writeLastUid = (uid) => { try { localStorage.setItem(LAST_UID_KEY, uid); } catch { /* ignore */ } };

async function pullAndMerge() {
  try {
    // Progress on this device from a different account must not leak into this one:
    // start from the cloud copy instead. (First sign-in on a device keeps guest progress.)
    const last = readLastUid();
    if (last && last !== user.uid) clearProgress();
    writeLastUid(user.uid);
    await pushProgress({ fromSignIn: true });
  } catch (e) {
    console.warn('[profiles] sync failed:', e);
  }
}

// Save this device's progress to the profile, merged with what's already there,
// so another device's newer catches are never overwritten. Safe to call anytime.
export async function pushProgress({ fromSignIn = false } = {}) {
  if (!fb || !user) return;
  let changed = false;
  try {
    await fb.fsM.runTransaction(fb.db, async (tx) => {
      const snap = await tx.get(userDoc());
      const local = exportProgress();
      const merged = mergeProgress(local, snap.exists() ? snap.data() : {});
      changed = JSON.stringify(mergeProgress(local, {})) !== JSON.stringify(merged);
      importProgress(merged);
      const { dex, stats, games, history } = merged;
      tx.set(userDoc(), {
        dex, stats, games, history,
        name: user.displayName || (user.email || '').split('@')[0] || 'Trainer',
        updatedAt: fb.fsM.serverTimestamp(),
      });
    });
  } catch (e) {
    console.warn('[profiles] save failed:', e);
  }
  // Another device had progress this one didn't: let the screen catch up.
  if (fromSignIn || changed) notify('synced');
  for (const fn of afterPush) {
    try { await fn(); } catch (e) { console.warn('[profiles] after-save step failed:', e); }
  }
}

export async function signInWithGoogle() {
  const provider = new fb.authM.GoogleAuthProvider();
  await fb.authM.signInWithPopup(fb.auth, provider);
}

export async function emailSignInLink(email) {
  await fb.authM.sendSignInLinkToEmail(fb.auth, email, {
    url: location.origin + location.pathname,
    handleCodeInApp: true,
  });
  try { localStorage.setItem(EMAIL_KEY, email); } catch { /* ignore */ }
}

export async function signOut() {
  await fb.authM.signOut(fb.auth);
}

// Removes the cloud copy and the account. Progress on this device stays.
export async function deleteProfile() {
  for (const fn of beforeDelete) {
    try { await fn(); } catch (e) { console.warn('[profiles] cleanup failed:', e); }
  }
  await fb.fsM.deleteDoc(userDoc());
  await fb.authM.deleteUser(user);
}
