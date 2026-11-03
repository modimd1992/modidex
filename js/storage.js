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
