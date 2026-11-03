// Everything saved in the browser (localStorage). Wrapped in try/catch so the
// game still works in private browsing or when storage is blocked.
import { GAME } from './config.js';

const P = GAME.storagePrefix;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(`${P}:${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(`${P}:${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable: progress just won't persist */
  }
}

// ---- Today's game per mode ----
export function loadGame(modeId, key, answerId) {
  const saved = read(`game:${modeId}`, null);
  if (saved && saved.date === key && saved.answerId === answerId) return saved;
  return { date: key, answerId, guesses: [], status: 'playing', recorded: false };
}

export function saveGame(modeId, game) {
  write(`game:${modeId}`, game);
}

// ---- Lifetime stats per mode ----
function emptyStats() {
  return {
    played: 0, wins: 0, currentStreak: 0, maxStreak: 0,
    distribution: Array(GAME.maxGuesses).fill(0), lastPlayed: null, lastWon: null,
  };
}

export function loadStats(modeId) {
  return { ...emptyStats(), ...read(`stats:${modeId}`, {}) };
}

export function recordResult(modeId, puzzleNo, won, guessCount) {
  const s = loadStats(modeId);
  if (s.lastPlayed === puzzleNo) return s; // already counted today
  s.played += 1;
  if (won) {
    s.wins += 1;
    s.currentStreak = s.lastWon === puzzleNo - 1 ? s.currentStreak + 1 : 1;
    s.maxStreak = Math.max(s.maxStreak, s.currentStreak);
    s.distribution[guessCount - 1] = (s.distribution[guessCount - 1] || 0) + 1;
    s.lastWon = puzzleNo;
  } else {
    s.currentStreak = 0;
  }
  s.lastPlayed = puzzleNo;
  write(`stats:${modeId}`, s);
  return s;
}

// A streak shown on screen is broken if the player skipped yesterday.
export function displayStreak(stats, puzzleNo) {
  if (stats.lastWon == null) return 0;
  return stats.lastWon >= puzzleNo - 1 ? stats.currentStreak : 0;
}

// ---- Small preferences ----
export function loadPref(name, fallback) {
  return read(`pref:${name}`, fallback);
}
export function savePref(name, value) {
  write(`pref:${name}`, value);
}

// ---- Dex (collection): one per sport ----
// { sports: { NFL: { caught: { [dexNo]: { date, athleteId, ball } }, seen: {...}, shiny: {...} }, NBA: {...}, ... } }
const PARTS = ['caught', 'seen', 'shiny'];
const sportOfAthleteId = (id) => (typeof id === 'string' && id.includes('-') ? id.split('-')[0].toUpperCase() : null);

// Accepts the current shape or the old single-Dex shape and returns the current shape.
// Old entries are sorted into the sport of the athlete they were caught from.
export function normalizeDex(d) {
  const out = { sports: {} };
  if (!d) return out;
  if (d.sports) {
    for (const [sp, sd] of Object.entries(d.sports)) {
      out.sports[sp] = { caught: { ...(sd?.caught || {}) }, seen: { ...(sd?.seen || {}) }, shiny: { ...(sd?.shiny || {}) } };
    }
    return out;
  }
  for (const part of PARTS) {
    for (const [n, entry] of Object.entries(d[part] || {})) {
      const sp = sportOfAthleteId(entry?.athleteId);
      if (!sp) continue;
      out.sports[sp] ||= { caught: {}, seen: {}, shiny: {} };
      out.sports[sp][part][n] = entry;
    }
  }
  return out;
}

export function loadDex() {
  return normalizeDex(read('dex', null));
}
export function saveDex(dex) {
  write('dex', dex);
}
// The Dex for one sport (created empty if needed).
export function sportDex(dex, sport) {
  dex.sports[sport] ||= { caught: {}, seen: {}, shiny: {} };
  return dex.sports[sport];
}
export const dexCounts = (sd) => ({
  caught: Object.keys(sd?.caught || {}).length, seen: Object.keys(sd?.seen || {}).length, shiny: Object.keys(sd?.shiny || {}).length,
});

// ---- Whole save (for syncing to a profile) ----
const MODE_IDS = ['all', 'nfl', 'nba', 'mlb', 'nhl'];

export function exportProgress() {
  const stats = {};
  const games = {};
  for (const id of MODE_IDS) {
    const s = read(`stats:${id}`, null);
    if (s) stats[id] = s;
    const g = read(`game:${id}`, null);
    if (g) games[id] = g;
  }
  return { dex: loadDex(), stats, games };
}

export function importProgress({ dex, stats = {}, games = {} }) {
  if (dex) saveDex(dex);
  for (const [id, s] of Object.entries(stats)) write(`stats:${id}`, s);
  for (const [id, g] of Object.entries(games)) write(`game:${id}`, g);
}

// Combine two saves without losing anything: union of the Dex,
// the more-played stats per mode, and the further-along game for the same day.
export function mergeProgress(a = {}, b = {}) {
  const dex = { sports: {} };
  for (const src of [normalizeDex(a.dex), normalizeDex(b.dex)]) {
    for (const [sp, sd] of Object.entries(src.sports)) {
      const target = sportDex(dex, sp);
      for (const part of PARTS) {
        for (const [n, entry] of Object.entries(sd[part] || {})) {
          const cur = target[part][n];
          if (!cur || (entry.date && entry.date < cur.date)) target[part][n] = entry; // keep the earliest
        }
      }
    }
  }
  const stats = {};
  for (const id of new Set([...Object.keys(a.stats || {}), ...Object.keys(b.stats || {})])) {
    const x = a.stats?.[id];
    const y = b.stats?.[id];
    stats[id] = !x ? y : !y ? x : ((y.played > x.played || (y.played === x.played && (y.lastPlayed || 0) > (x.lastPlayed || 0))) ? y : x);
  }
  const games = {};
  const rank = (g) => (g.status !== 'playing' ? 100 : 0) + g.guesses.length;
  for (const id of new Set([...Object.keys(a.games || {}), ...Object.keys(b.games || {})])) {
    const x = a.games?.[id];
    const y = b.games?.[id];
    if (!x || !y) { games[id] = x || y; continue; }
    if (x.date !== y.date) games[id] = x.date > y.date ? x : y;
    else games[id] = rank(y) > rank(x) ? y : x;
  }
  return { dex, stats, games };
}
