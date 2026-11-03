// Profiles: optional sign-in (Google or emailed link) that saves the Dex, stats and
// today's games to Firebase, so they follow the player across devices.
// Does nothing until FIREBASE_CONFIG is filled in (js/firebase-config.js).
import { FIREBASE_CONFIG } from './firebase-config.js';
import { exportProgress, importProgress, mergeProgress } from './storage.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const EMAIL_KEY = 'modidex:v1:pref:signInEmail';
let fb = null;
let user = null;
let status = 'off'; // off | loading | ready | error
const listeners = new Set();

export const cloudEnabled = () => !!FIREBASE_CONFIG;
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

async function pullAndMerge() {
  try {
    const snap = await fb.fsM.getDoc(userDoc());
    const remote = snap.exists() ? snap.data() : {};
    const merged = mergeProgress(exportProgress(), remote);
    importProgress(merged);
    await pushProgress();
    notify('synced');
  } catch (e) {
    console.warn('[profiles] sync failed:', e);
  }
}

// Save this device's progress to the profile. Safe to call anytime.
export async function pushProgress() {
  if (!fb || !user) return;
  try {
    const { dex, stats, games } = exportProgress();
    await fb.fsM.setDoc(userDoc(), {
      dex, stats, games,
      name: user.displayName || (user.email || '').split('@')[0] || 'Trainer',
      updatedAt: fb.fsM.serverTimestamp(),
    });
  } catch (e) {
    console.warn('[profiles] save failed:', e);
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
  await fb.fsM.deleteDoc(userDoc());
  await fb.authM.deleteUser(user);
}
