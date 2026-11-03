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

// Each mode walks through a shuffled deck of its athletes, one per day,
// so nobody repeats until the whole pool has been used. Then it reshuffles.
// schedule.json can pin a specific athlete to a date (great for video tie-ins).
export function pickDaily({ pool, modeId, key, schedule = {}, exclude = new Set() }) {
  if (!pool.length) return null;
  const pinnedId = schedule[key]?.[modeId];
  if (pinnedId) {
    const pinned = pool.find((a) => a.id === pinnedId);
    if (pinned) return pinned;
  }
  const sorted = [...pool].sort((a, b) => (a.id < b.id ? -1 : 1));
  const idx = puzzleNumber(key) - 1;
  const len = sorted.length;
  const cycle = Math.floor(idx / len);
  const pos = ((idx % len) + len) % len;
  const deck = seededShuffle(sorted, hashString(`${GAME.name}:${modeId}:${cycle}`));
  for (let i = 0; i < len; i++) {
    const candidate = deck[(pos + i) % len];
    if (!exclude.has(candidate.id)) return candidate;
  }
  return deck[pos];
}

// Answers for every mode on a date. The mixed mode avoids repeating
// any of that day's single-sport answers.
export function answersForDate(athletes, key, schedule = {}) {
  const answers = {};
  const used = new Set();
  const singles = MODES.filter((m) => m.sports);
  const mixed = MODES.filter((m) => !m.sports);
  for (const mode of singles) {
    const a = pickDaily({ pool: poolForMode(athletes, mode), modeId: mode.id, key, schedule });
    answers[mode.id] = a;
    if (a) used.add(a.id);
  }
  for (const mode of mixed) {
    answers[mode.id] = pickDaily({
      pool: poolForMode(athletes, mode), modeId: mode.id, key, schedule, exclude: used,
    });
  }
  return answers;
}
