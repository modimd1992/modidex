// Picks the same puzzle for everyone on a given date. No server needed.
// Pure functions only (no DOM), so Node tools can import this file too.
import { GAME, MODES } from './config.js';

// Calendar date as "YYYY-MM-DD" in the game's time zone (Eastern Time by default),
// so every player everywhere gets new puzzles at the same moment.
function partsIn(d, tz) {
  const out = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)) out[p.type] = p.value;
  return out;
}

export function dateKey(d = new Date(), tz = GAME.timeZone) {
  const p = partsIn(d, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

// Seconds until the next puzzle (next midnight in the game's time zone).
// Adjusts for daylight-saving days, which are 23 or 25 hours long.
export function secondsUntilNextDay(now = new Date(), tz = GAME.timeZone) {
  const p = partsIn(now, tz);
  const today = `${p.year}-${p.month}-${p.day}`;
  let s = 86400 - (Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second));
  const at = (sec) => dateKey(new Date(now.getTime() + sec * 1000), tz);
  if (at(s - 1) !== today) s -= 3600;      // short day (clocks spring forward)
  else if (at(s) === today) s += 3600;     // long day (clocks fall back)
  return Math.max(0, s);
}

function dayIndex(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function puzzleNumber(key) {
  return dayIndex(key) - dayIndex(GAME.launchDate) + 1;
}

export function addDays(key, n) {
  const ms = (dayIndex(key) + n) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

// Whole years between birthDate and the given date key.
export function ageOn(birthDate, key) {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = key.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age;
}

// FNV-1a string hash -> 32-bit seed.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Small seeded random number generator.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(list, seed) {
  const out = [...list];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function poolForMode(athletes, mode) {
  return mode.sports ? athletes.filter((a) => mode.sports.includes(a.sport)) : athletes;
}

// The daily schedule is built day by day from the launch date, so it's identical for
// every player and needs no server.
//  - Each sport walks through a shuffled deck of its athletes: nobody repeats until
//    the whole pool has been used, then it reshuffles.
//  - All Sports also walks its own deck, but skips (for now) anyone who is a
//    single-sport answer within SPACING days, so the same answer never shows up in
//    two modes close together.
//  - schedule.json can pin an athlete to a date; a pinned athlete is taken out of
//    that mode's current deck so they don't repeat later in the cycle.
export const SPACING = 10;
// When a deck reshuffles, anyone used this recently in the same mode goes to the back.
const RECENT = 15;

const cache = new Map();

function refill(sorted, modeId, cycle, recentIds) {
  const deck = seededShuffle(sorted, hashString(`${GAME.name}:${modeId}:${cycle}`));
  return [...deck.filter((a) => !recentIds.has(a.id)), ...deck.filter((a) => recentIds.has(a.id))];
}

const recentIn = (out, modeId, i) => {
  const ids = new Set();
  for (let j = Math.max(0, i - RECENT); j < i; j++) if (out[j][modeId]) ids.add(out[j][modeId].id);
  return ids;
};

function buildSchedule(athletes, schedule, days) {
  const hit = cache.get(athletes);
  if (hit && hit.days >= days && hit.schedule === schedule) return hit.out;

  const horizon = days + SPACING;
  const out = Array.from({ length: horizon }, () => ({}));
  const keyOf = (i) => addDays(GAME.launchDate, i);

  // Athletes pinned (schedule.json) in another mode within SPACING days of day i.
  const pinnedNear = (i, modeId) => {
    const ids = new Set();
    for (let j = Math.max(0, i - SPACING); j <= i + SPACING; j++) {
      for (const [mid, id] of Object.entries(schedule[keyOf(j)] || {})) if (mid !== modeId) ids.add(id);
    }
    return ids;
  };

  // 1) Single-sport modes.
  for (const mode of MODES.filter((m) => m.sports)) {
    const pool = poolForMode(athletes, mode);
    if (!pool.length) continue;
    const sorted = [...pool].sort((a, b) => (a.id < b.id ? -1 : 1));
    const byId = new Map(pool.map((a) => [a.id, a]));
    let deck = [];
    let cycle = 0;
    for (let i = 0; i < horizon; i++) {
      if (!deck.length) deck = refill(sorted, mode.id, cycle++, recentIn(out, mode.id, i));
      const pinned = byId.get(schedule[keyOf(i)]?.[mode.id]);
      let pick;
      if (pinned) {
        pick = pinned;
        deck = deck.filter((a) => a.id !== pinned.id);
      } else {
        // Skip anyone pinned in another mode nearby (they go to the back of the deck).
        const near = pinnedNear(i, mode.id);
        const k = deck.findIndex((a) => !near.has(a.id));
        if (k > 0) deck = [...deck.slice(k), ...deck.slice(0, k)];
        pick = deck.shift();
      }
      out[i][mode.id] = pick;
    }
  }

  // 2) Mixed modes (All Sports), spaced away from nearby single-sport answers.
  for (const mode of MODES.filter((m) => !m.sports)) {
    const pool = poolForMode(athletes, mode);
    if (!pool.length) continue;
    const sorted = [...pool].sort((a, b) => (a.id < b.id ? -1 : 1));
    const byId = new Map(pool.map((a) => [a.id, a]));
    // Days between day i and this athlete's nearest single-sport appearance.
    const distance = (i) => {
      const d = new Map();
      for (let j = Math.max(0, i - SPACING); j <= i + SPACING && j < horizon; j++) {
        for (const [mid, a] of Object.entries(out[j])) {
          if (mid === mode.id || !a) continue;
          const gap = Math.abs(j - i);
          if (!d.has(a.id) || gap < d.get(a.id)) d.set(a.id, gap);
        }
      }
      return d;
    };
    let deck = [];
    let cycle = 0;
    const borrowed = new Set(); // taken early from the next deck; skipped when it's dealt
    for (let i = 0; i < days; i++) {
      if (!deck.length) {
        deck = refill(sorted, mode.id, cycle++, recentIn(out, mode.id, i)).filter((a) => !borrowed.has(a.id));
        borrowed.clear();
        if (!deck.length) deck = refill(sorted, mode.id, cycle++, recentIn(out, mode.id, i));
      }
      const pinned = byId.get(schedule[keyOf(i)]?.[mode.id]);
      let pick;
      if (pinned) {
        pick = pinned;
        deck = deck.filter((a) => a.id !== pinned.id);
      } else {
        const near = distance(i);
        if (!deck.some((a) => !near.has(a.id))) {
          // Everyone left in this deck is near a single-sport answer. Borrow someone
          // well-spaced from the next deck instead (they won't be dealt again then).
          const inDeck = new Set(deck.map((a) => a.id));
          const recent = recentIn(out, mode.id, i);
          const next = seededShuffle(sorted, hashString(`${GAME.name}:${mode.id}:${cycle}`));
          const extra = next.find((a) => !inDeck.has(a.id) && !borrowed.has(a.id) && !near.has(a.id) && !recent.has(a.id));
          if (extra) {
            borrowed.add(extra.id);
            out[i][mode.id] = extra;
            continue;
          }
        }
        let k = deck.findIndex((a) => !near.has(a.id));
        if (k < 0) {
          // Everyone left is near a single-sport answer: take whoever is furthest away.
          k = 0;
          deck.forEach((a, idx) => { if (near.get(a.id) > near.get(deck[k].id)) k = idx; });
        } else if (k > 0) {
          // Send the skipped players to the back of the deck. Keeping them at the front
          // would bring them back the first day they're allowed, a guessable pattern.
          deck = [...deck.slice(k), ...deck.slice(0, k)];
          k = 0;
        }
        pick = deck.splice(k, 1)[0];
      }
      out[i][mode.id] = pick;
    }
  }

  cache.set(athletes, { days, schedule, out });
  return out;
}

// Answers for every mode on a date.
export function answersForDate(athletes, key, schedule = {}) {
  const n = Math.max(1, puzzleNumber(key)); // dates before launch use puzzle #1
  const day = buildSchedule(athletes, schedule, n)[n - 1];
  const answers = {};
  for (const m of MODES) answers[m.id] = day[m.id] || null;
  return answers;
}
