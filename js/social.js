// Friends and groups, built on profiles (cloud.js).
//
// Firestore layout:
//   handles/{username}         -> { uid }                      who owns a username
//   profiles/{uid}             -> public summary, readable only by friends and
//                                 people in a shared group (see firestore.rules)
//   friendRequests/{to}_{from} -> { from, to, fromName, status }
//   groups/{gid}               -> { name, owner, code, members: [uid] }
//   groupCodes/{CODE}          -> { gid }                      join codes
//   trades/{id}                -> { from, to, fromName, toName, give, get, status }
//                                 give/get = { sport, n, athleteId } (get may be null: a gift)
import { cloudApi, onAfterPush, onBeforeDelete } from './cloud.js';
import { SPORTS } from './config.js';

export const HANDLE_RE = /^[a-z0-9_]{3,15}$/;
export const MAX_GROUP = 50;
let mine = null; // cached own profile
let summaryBuilder = () => ({});

const api = () => {
  const a = cloudApi();
  if (!a) throw new Error('not-signed-in');
  return a;
};
const ref = (a, ...path) => a.fsM.doc(a.db, ...path);

// main.js supplies the public summary (Dex, streaks, today's results).
export function setSummaryBuilder(fn) { summaryBuilder = fn; }

export async function loadMyProfile(force = false) {
  const a = cloudApi();
  if (!a) { mine = null; return null; }
  if (mine && mine.uid === a.user.uid && !force) return mine;
  const snap = await a.fsM.getDoc(ref(a, 'profiles', a.user.uid));
  mine = snap.exists() ? { uid: a.user.uid, ...snap.data() } : { uid: a.user.uid, friends: [], groups: [] };
  return mine;
}
export const myHandle = () => mine?.handle || null;
export function forgetProfile() { mine = null; }

// Claim a username (or change it). Throws 'invalid' or 'taken'.
export async function claimHandle(raw) {
  const a = api();
  const handle = String(raw || '').trim().toLowerCase();
  if (!HANDLE_RE.test(handle)) throw new Error('invalid');
  const me = a.user.uid;
  const prof = await loadMyProfile();
  if (prof.handle === handle) return handle;
  await a.fsM.runTransaction(a.db, async (tx) => {
    const h = await tx.get(ref(a, 'handles', handle));
    const p = await tx.get(ref(a, 'profiles', me));
    if (h.exists() && h.data().uid !== me) throw new Error('taken');
    if (!h.exists()) tx.set(ref(a, 'handles', handle), { uid: me });
    const old = p.exists() ? p.data().handle : null;
    if (old && old !== handle) tx.delete(ref(a, 'handles', old));
    // Only the basics here; the Dex and scores are published right after, separately,
    // so a problem with those can never block saving a username. Friends and groups
    // are never rewritten here (another device may have changed them).
    tx.set(ref(a, 'profiles', me), p.exists()
      ? { handle, name: handle, updatedAt: a.fsM.serverTimestamp() }
      : { handle, name: handle, friends: [], groups: [], updatedAt: a.fsM.serverTimestamp() }, { merge: true });
  });
  mine = { ...prof, handle, name: handle };
  try { await publishProfile(); } catch (e) { console.warn('[profiles] publish after username failed:', e); }
  return handle;
}

// Publish the latest Dex / results so friends see them. Runs after every save.
export async function publishProfile() {
  const a = cloudApi();
  if (!a) return;
  const prof = await loadMyProfile();
  if (!prof.handle) return;
  const doc = { ...summaryBuilder(), handle: prof.handle, name: prof.handle, updatedAt: a.fsM.serverTimestamp() };
  // merge: friends/groups are changed only by their own actions, never overwritten here
  // If the Firebase rules haven't been updated for newer fields yet, publish without them
  // (newest first).
  const { partner, ...noPartner } = doc;
  const { badges, ...noBadges } = noPartner;
  const { week, alltime, ...basic } = noBadges;
  const attempts = [doc, noPartner, noBadges, basic];
  for (const [i, attempt] of attempts.entries()) {
    try {
      await a.fsM.setDoc(ref(a, 'profiles', a.user.uid), attempt, { merge: true });
      break;
    } catch (e) {
      if (e?.code !== 'permission-denied' || i === attempts.length - 1) throw e;
    }
  }
  await processAnsweredRequests();
}
onAfterPush(publishProfile);

async function addToMine(field, value, remove = false) {
  const a = api();
  const op = remove ? a.fsM.arrayRemove(value) : a.fsM.arrayUnion(value);
  await a.fsM.updateDoc(ref(a, 'profiles', a.user.uid), { [field]: op });
  const prof = await loadMyProfile();
  const list = new Set(prof[field] || []);
  remove ? list.delete(value) : list.add(value);
  prof[field] = [...list];
}

// ---------- friends ----------
export async function sendFriendRequest(rawHandle) {
  const a = api();
  const prof = await loadMyProfile();
  if (!prof.handle) throw new Error('no-handle');
  const handle = String(rawHandle || '').trim().toLowerCase().replace(/^@/, '');
  const h = await a.fsM.getDoc(ref(a, 'handles', handle));
  if (!h.exists()) throw new Error('not-found');
  const to = h.data().uid;
  if (to === a.user.uid) throw new Error('self');
  if ((prof.friends || []).includes(to)) throw new Error('already');
  // A request between these two people may already be in progress.
  const theirs = await tryGet(ref(a, 'friendRequests', `${a.user.uid}_${to}`));
  if (theirs?.status === 'pending') { // they already asked: accept it
    await answerRequest({ id: `${a.user.uid}_${to}`, from: to }, true);
    return { handle, result: 'friends' };
  }
  const mineRef = ref(a, 'friendRequests', `${to}_${a.user.uid}`);
  const mine = await tryGet(mineRef);
  if (mine?.status === 'pending') throw new Error('pending');
  if (mine?.status === 'accepted') { // they accepted: finish the handshake
    await addToMine('friends', to);
    await a.fsM.deleteDoc(mineRef);
    return { handle, result: 'friends' };
  }
  if (mine) await a.fsM.deleteDoc(mineRef); // declined earlier: ask again
  await a.fsM.setDoc(mineRef, {
    from: a.user.uid, to, fromName: prof.handle, toName: handle, status: 'pending', createdAt: a.fsM.serverTimestamp(),
  });
  return { handle, result: 'sent' };
}

// A friend request's data, or null if there isn't one (reading a missing one is refused).
async function tryGet(r) {
  const a = api();
  try {
    const snap = await a.fsM.getDoc(r);
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

export async function incomingRequests() {
  const a = api();
  const q = a.fsM.query(a.fsM.collection(a.db, 'friendRequests'),
    a.fsM.where('to', '==', a.user.uid), a.fsM.where('status', '==', 'pending'));
  return (await a.fsM.getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function outgoingRequests() {
  const a = api();
  const q = a.fsM.query(a.fsM.collection(a.db, 'friendRequests'), a.fsM.where('from', '==', a.user.uid));
  return (await a.fsM.getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function answerRequest(req, accept) {
  const a = api();
  if (accept) await addToMine('friends', req.from);
  await a.fsM.updateDoc(ref(a, 'friendRequests', req.id), { status: accept ? 'accepted' : 'declined' });
}

// The sender finishes the handshake: add accepted friends, clear answered requests.
export async function processAnsweredRequests() {
  const a = cloudApi();
  if (!a) return;
  for (const r of await outgoingRequests()) {
    if (r.status === 'accepted') await addToMine('friends', r.to);
    if (r.status !== 'pending') await a.fsM.deleteDoc(ref(a, 'friendRequests', r.id));
  }
}

// ---------- trades ----------
// The sender offers one of their catches (give), optionally asking for one of the
// friend's (get). The friend accepts and adds `give` to their own Dex; the sender's
// game then adds `get` to theirs (like friend requests, each side writes only its own save).
export async function sendTrade({ to, toName, give, get = null }) {
  const a = api();
  const prof = await loadMyProfile();
  if (!prof.handle) throw new Error('no-handle');
  if (!(prof.friends || []).includes(to)) throw new Error('not-friends');
  const r = a.fsM.doc(a.fsM.collection(a.db, 'trades'));
  await a.fsM.setDoc(r, {
    from: a.user.uid, to, fromName: prof.handle, toName, give, get, status: 'offered', createdAt: a.fsM.serverTimestamp(),
  });
  return r.id;
}

export async function incomingTrades() {
  const a = api();
  const q = a.fsM.query(a.fsM.collection(a.db, 'trades'), a.fsM.where('to', '==', a.user.uid), a.fsM.where('status', '==', 'offered'));
  return (await a.fsM.getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function outgoingTrades() {
  const a = api();
  const q = a.fsM.query(a.fsM.collection(a.db, 'trades'), a.fsM.where('from', '==', a.user.uid));
  return (await a.fsM.getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function answerTrade(t, accept) {
  const a = api();
  await a.fsM.updateDoc(ref(a, 'trades', t.id), { status: accept ? 'accepted' : 'declined' });
}

// Withdraws an offer. If the friend accepted it in the meantime, it's not deleted:
// throws 'trade-accepted' so the caller can finish it instead.
export async function cancelTrade(t) {
  const a = api();
  const r = ref(a, 'trades', t.id);
  const snap = await a.fsM.getDoc(r);
  if (!snap.exists()) return;
  if (snap.data().status === 'accepted') throw new Error('trade-accepted');
  await a.fsM.deleteDoc(r);
}

// The sender finishes accepted trades: receive(trade) adds `get` to the Dex. Answered trades are cleared.
let finishing = null; // one run at a time (sync and the Friends tab can both ask)
export function processAnsweredTrades(receive) {
  finishing ||= (async () => {
    const a = cloudApi();
    if (!a) return [];
    const done = [];
    for (const t of await outgoingTrades()) {
      if (t.status === 'offered') continue;
      if (t.status === 'accepted' && t.get) { receive(t); done.push(t); }
      await a.fsM.deleteDoc(ref(a, 'trades', t.id));
    }
    return done;
  })().finally(() => { finishing = null; });
  return finishing;
}

export async function removeFriend(uid) {
  await addToMine('friends', uid, true);
}

// Another player's profile can contain anything they wrote, so keep only the
// expected shapes: numbers as numbers, known sports and modes, safe short strings.
const num = (v, max = 1e7) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0; };
const word = (v, re, len = 40) => (typeof v === 'string' && re.test(v) ? v.slice(0, len) : '');
const dexNums = (v) => (Array.isArray(v) ? [...new Set(v.map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= 151))] : []);
const MODE_RE = /^[a-z]{2,4}$/;
export function cleanProfile(uid, d = {}) {
  const dex = {};
  const src = d.dex && typeof d.dex === 'object' ? d.dex : {};
  if (Array.isArray(src.caught)) dex.All = { caught: dexNums(src.caught), seen: dexNums(src.seen), shiny: dexNums(src.shiny) };
  for (const sp of Object.keys(SPORTS)) {
    const x = src[sp];
    if (x && typeof x === 'object') dex[sp] = { caught: dexNums(x.caught), seen: dexNums(x.seen), shiny: dexNums(x.shiny) };
  }
  const lines = typeof d.lines === 'object' && d.lines
    ? Object.fromEntries(Object.keys(SPORTS).filter((sp) => sp in d.lines).map((sp) => [sp, num(d.lines[sp], 54)]))
    : num(d.lines, 54);
  const streaks = {};
  for (const [k, v] of Object.entries(d.streaks || {})) if (MODE_RE.test(k)) streaks[k] = num(v, 10000);
  const results = {};
  for (const [k, r] of Object.entries(d.today?.results || {})) {
    if (!MODE_RE.test(k) || !r) continue;
    results[k] = { status: r.status === 'won' ? 'won' : 'lost', n: num(r.n, 6), squares: String(r.squares || '').replace(/[^🟩🟨⬛]/gu, '').slice(0, 12), caught: !!r.caught, shiny: !!r.shiny };
  }
  const date = (v) => word(v, /^\d{4}-\d{2}-\d{2}$/, 10);
  const totals = (t) => (t && typeof t === 'object' ? { pts: num(t.pts), solved: num(t.solved), played: num(t.played) } : undefined);
  return {
    uid,
    handle: word(d.handle, HANDLE_RE, 15),
    name: word(d.handle, HANDLE_RE, 15),
    friends: Array.isArray(d.friends) ? d.friends.filter((x) => typeof x === 'string') : [],
    groups: Array.isArray(d.groups) ? d.groups.filter((x) => typeof x === 'string') : [],
    dex, lines, streaks,
    today: d.today ? { date: date(d.today.date), puzzleNo: num(d.today.puzzleNo), results } : undefined,
    week: d.week ? { start: date(d.week.start), ...totals(d.week) } : undefined,
    alltime: totals(d.alltime),
    badges: Array.isArray(d.badges) ? d.badges.filter((x) => typeof x === 'string' && /^[a-z0-9.-]{1,24}$/.test(x)) : [],
    partner: d.partner && typeof d.partner === 'object'
      ? { n: num(d.partner.n, 151), name: word(d.partner.name, /^[A-Za-z0-9 .'♀♂-]{1,20}$/u, 20), level: num(d.partner.level, 100) }
      : null,
  };
}

// A profile you're allowed to see, or null (not a friend yet / no longer shared).
export async function readProfile(uid) {
  const a = api();
  try {
    const snap = await a.fsM.getDoc(ref(a, 'profiles', uid));
    return snap.exists() ? cleanProfile(uid, snap.data()) : null;
  } catch {
    return null;
  }
}

export async function listFriends() {
  const prof = await loadMyProfile(true);
  return Promise.all((prof.friends || []).map(async (uid) => (await readProfile(uid)) || { uid, pending: true }));
}

// ---------- groups ----------
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export async function createGroup(rawName) {
  const a = api();
  const prof = await loadMyProfile();
  if (!prof.handle) throw new Error('no-handle');
  const name = String(rawName || '').trim().slice(0, 30);
  if (name.length < 2) throw new Error('group-name');
  if ((prof.groups || []).length >= 20) throw new Error('too-many');
  const gref = a.fsM.doc(a.fsM.collection(a.db, 'groups'));
  for (let tries = 0; tries < 5; tries++) {
    const code = newCode();
    if ((await a.fsM.getDoc(ref(a, 'groupCodes', code))).exists()) continue;
    const batch = a.fsM.writeBatch(a.db);
    batch.set(gref, { name, owner: a.user.uid, code, members: [a.user.uid], createdAt: a.fsM.serverTimestamp() });
    batch.set(ref(a, 'groupCodes', code), { gid: gref.id });
    batch.update(ref(a, 'profiles', a.user.uid), { groups: a.fsM.arrayUnion(gref.id) });
    await batch.commit();
    prof.groups = [...new Set([...(prof.groups || []), gref.id])];
    return { id: gref.id, name, code };
  }
  throw new Error('try-again');
}

export async function joinGroup(rawCode) {
  const a = api();
  const prof = await loadMyProfile();
  if (!prof.handle) throw new Error('no-handle');
  const code = String(rawCode || '').trim().toUpperCase();
  const c = await a.fsM.getDoc(ref(a, 'groupCodes', code));
  if (!c.exists()) throw new Error('not-found');
  const gid = c.data().gid;
  const g = await a.fsM.getDoc(ref(a, 'groups', gid));
  if (!g.exists()) throw new Error('not-found');
  const data = g.data();
  if (data.members.includes(a.user.uid)) {
    if (!(prof.groups || []).includes(gid)) await addToMine('groups', gid);
    return { id: gid, name: data.name, already: true };
  }
  if (data.members.length >= MAX_GROUP) throw new Error('full');
  const batch = a.fsM.writeBatch(a.db);
  batch.update(ref(a, 'groups', gid), { members: a.fsM.arrayUnion(a.user.uid) });
  batch.update(ref(a, 'profiles', a.user.uid), { groups: a.fsM.arrayUnion(gid) });
  await batch.commit();
  prof.groups = [...new Set([...(prof.groups || []), gid])];
  return { id: gid, name: data.name };
}

export async function leaveGroup(gid) {
  const a = api();
  const g = await a.fsM.getDoc(ref(a, 'groups', gid));
  const batch = a.fsM.writeBatch(a.db);
  if (g.exists()) {
    const data = g.data();
    if (data.members.length <= 1 && data.owner === a.user.uid) {
      batch.delete(ref(a, 'groups', gid));
      batch.delete(ref(a, 'groupCodes', data.code));
    } else {
      batch.update(ref(a, 'groups', gid), { members: a.fsM.arrayRemove(a.user.uid) });
    }
  }
  batch.update(ref(a, 'profiles', a.user.uid), { groups: a.fsM.arrayRemove(gid) });
  await batch.commit();
  const prof = await loadMyProfile();
  prof.groups = (prof.groups || []).filter((x) => x !== gid);
}

export async function listGroups() {
  const a = api();
  const prof = await loadMyProfile(true);
  const out = [];
  for (const gid of prof.groups || []) {
    const g = await a.fsM.getDoc(ref(a, 'groups', gid));
    if (g.exists()) out.push({ id: gid, ...g.data() });
  }
  return out;
}

export async function groupMembers(group) {
  return Promise.all(group.members.map(async (uid) => (await readProfile(uid)) || { uid, pending: true }));
}

// Remove usernames, profile and memberships when someone deletes their profile.
onBeforeDelete(async () => {
  const a = cloudApi();
  if (!a) return;
  const prof = await loadMyProfile(true);
  for (const gid of prof.groups || []) { try { await leaveGroup(gid); } catch { /* ignore */ } }
  if (prof.handle) { try { await a.fsM.deleteDoc(ref(a, 'handles', prof.handle)); } catch { /* ignore */ } }
  try { await a.fsM.deleteDoc(ref(a, 'profiles', a.user.uid)); } catch { /* ignore */ }
  mine = null;
});
