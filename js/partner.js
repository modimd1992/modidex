// Partner: one caught creature that travels with you. Every finished puzzle gives it
// XP; it levels up and evolves along its line. Pure functions only (no DOM).
//
// Saved in the Dex as dex.partner = {
//   n,          dex number you picked
//   form,       dex number it has evolved into (starts as n)
//   sport, athleteId,  where it was caught
//   start,      level it started at
//   xp, since,  XP earned and the date it became your partner
//   done: { date, modes: [] }  puzzles already counted today
// }
import { CATCH, GAME } from './config.js';
import { familyOf } from './gen1.js';
import { hashString } from './daily.js';

export const XP_PER_LEVEL = 4;
export const MAX_LEVEL = 100;
const EEVEE = 133;
const EEVEELUTIONS = [134, 135, 136];

// The next evolution of a creature: { next: [dexNos], at: level }, or null if it doesn't evolve.
export function evolutionOf(n) {
  if (n === EEVEE) return { next: EEVEELUTIONS, at: 25 };
  const fam = familyOf(n);
  if (!fam || EEVEELUTIONS.includes(n)) return null;
  const i = fam.indexOf(n);
  if (i === fam.length - 1) return null;
  return { next: [fam[i + 1]], at: fam.length === 3 && i === 0 ? 16 : fam.length === 3 ? 36 : 25 };
}

// Level a creature starts at: base forms at 5, evolved forms at the level they evolve, legendaries at 50.
export function startLevel(n) {
  if (CATCH.legendary.includes(n)) return 50;
  if (EEVEELUTIONS.includes(n)) return 25;
  const fam = familyOf(n);
  if (!fam) return 5;
  const i = fam.indexOf(n);
  if (i === 0) return 5;
  return fam.length === 3 ? (i === 1 ? 16 : 36) : 25;
}

export function newPartner({ n, sport, athleteId }, today) {
  return { n, form: n, sport, athleteId, start: startLevel(n), xp: 0, since: today, done: { date: today, modes: [] } };
}

export const levelOf = (p) => Math.min(MAX_LEVEL, p.start + Math.floor((p.xp || 0) / XP_PER_LEVEL));

// Progress toward the next level, 0..1.
export const levelProgress = (p) => (levelOf(p) >= MAX_LEVEL ? 1 : ((p.xp || 0) % XP_PER_LEVEL) / XP_PER_LEVEL);

// XP for a finished puzzle: the leaderboard points for a solve (6 down to 1), 1 for trying.
export const xpFor = (won, guesses) => (won ? Math.max(1, GAME.maxGuesses + 1 - guesses) : 1);

// Adds XP once per puzzle. Returns { partner, gained, before, after, evolved: [from, to] | null },
// or null if this puzzle was already counted.
export function feedPartner(p, { date, modeId, won, guesses }) {
  if (!p) return null;
  const done = p.done?.date === date ? p.done.modes : [];
  if (done.includes(modeId)) return null;
  const before = levelOf(p);
  const gained = xpFor(won, guesses);
  const next = { ...p, xp: (p.xp || 0) + gained, done: { date, modes: [...done, modeId] } };
  const after = levelOf(next);
  let evolved = null;
  for (let evo = evolutionOf(next.form); evo && after >= evo.at; evo = evolutionOf(next.form)) {
    const to = evo.next.length === 1 ? evo.next[0] : evo.next[hashString(`${next.since}:${next.n}`) % evo.next.length];
    evolved = [evolved ? evolved[0] : next.form, to];
    next.form = to;
  }
  return { partner: next, gained, before, after, evolved };
}
