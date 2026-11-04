// Badges: collection sets (catch every creature in a group) and play milestones.
// Pure functions only (no DOM). Earned badges are saved in the Dex as
// dex.badges = { [id]: 'YYYY-MM-DD' }, with gold set badges as `${id}.gold`.
import { GAME, MODES, ENABLED_SPORTS } from './config.js';
import { addDays } from './daily.js';
import { GYMS } from './gyms.js';

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// Catch every creature in the set, from any sport. All in every sport = gold.
export const SET_BADGES = [
  { id: 'starters', icon: '🌱', name: 'Starter Trio', set: [1, 4, 7] },
  { id: 'mice', icon: '⚡', name: 'Electric Mice', set: [25, 26] },
  { id: 'nidos', icon: '💜', name: 'Nido Royalty', set: range(29, 34) },
  { id: 'trade', icon: '🔁', name: 'Trade Evolutions', set: [65, 68, 76, 94] },
  { id: 'ghosts', icon: '👻', name: 'Ghost Hunter', set: [92, 93, 94] },
  { id: 'fighting', icon: '🥊', name: 'Fighting Brothers', set: [106, 107] },
  { id: 'giants', icon: '🗻', name: 'Gentle Giants', set: [95, 130, 131, 143] },
  { id: 'eevee', icon: '🦊', name: 'Eevee Family', set: range(133, 136) },
  { id: 'fossils', icon: '🦴', name: 'Fossil Digger', set: range(138, 142) },
  { id: 'birds', icon: '🐦', name: 'Legendary Birds', set: [144, 145, 146] },
  { id: 'dragons', icon: '🐉', name: 'Dragon Tamer', set: [147, 148, 149] },
  { id: 'mythic', icon: '🧬', name: 'Mythic Pair', set: [150, 151] },
];

// Milestones. progress(facts) returns [current, goal].
export const PLAY_BADGES = [
  { id: 'first-ballot', icon: '🏆', name: 'First Ballot', hint: 'Solve a puzzle on your 1st guess', progress: (f) => [f.dist[0] ? 1 : 0, 1] },
  { id: 'clutch', icon: '😅', name: 'Clutch', hint: `Solve a puzzle on your last (${GAME.maxGuesses}th) guess`, progress: (f) => [f.dist[GAME.maxGuesses - 1] ? 1 : 0, 1] },
  { id: 'sweep', icon: '🧹', name: 'Clean Sweep', hint: `Catch in all ${MODES.length} modes on the same day`, progress: (f) => [f.bestSweep, MODES.length] },
  { id: 'perfect-week', icon: '📅', name: 'Perfect Week', hint: 'Solve every mode 7 days in a row', progress: (f) => [f.bestPerfectRun, 7] },
  { id: 'streak-7', icon: '🔥', name: 'Hot Streak', hint: 'Win 7 days in a row in any mode', progress: (f) => [f.maxStreak, 7] },
  { id: 'streak-30', icon: '🌋', name: 'On Fire', hint: 'Win 30 days in a row in any mode', progress: (f) => [f.maxStreak, 30] },
  { id: 'streak-100', icon: '☄️', name: 'Unstoppable', hint: 'Win 100 days in a row in any mode', progress: (f) => [f.maxStreak, 100] },
  { id: 'shiny-1', icon: '✨', name: 'Shiny Hunter', hint: 'Catch a shiny', progress: (f) => [f.shinies, 1] },
  { id: 'shiny-5', icon: '💎', name: 'Shiny Collector', hint: 'Catch 5 shinies', progress: (f) => [f.shinies, 5] },
  { id: 'triple', icon: '👑', name: 'Triple Crown', hint: `Catch the same creature in ${ENABLED_SPORTS.join(', ').replace(/, ([^,]*)$/, ' and $1')}`, progress: (f) => [f.triple ? 1 : 0, 1] },
  { id: 'dex-25', icon: '📗', name: 'Rookie Collector', hint: 'Catch 25 different creatures', progress: (f) => [f.caughtAny.size, 25] },
  { id: 'dex-50', icon: '📘', name: 'Pro Collector', hint: 'Catch 50 different creatures', progress: (f) => [f.caughtAny.size, 50] },
  { id: 'dex-100', icon: '📙', name: 'All-Star Collector', hint: 'Catch 100 different creatures', progress: (f) => [f.caughtAny.size, 100] },
  { id: 'dex-151', icon: '📕', name: 'Hall of Fame Collector', hint: 'Complete the Total Dex: all 151', progress: (f) => [f.caughtAny.size, 151] },
  { id: 'champ', icon: '🥇', name: 'Top of the Table', hint: "Lead a group's weekly leaderboard", progress: () => [0, 1] },
];

// One per gym leader beaten (see gyms.js).
export const GYM_BADGES = GYMS.map((g) => ({ id: `gym-${g.no}`, gym: g.no, icon: g.badge.icon, name: g.badge.name, hint: `Beat ${g.leader}, the ${g.type} gym leader` }));

export const ALL_BADGES = [...SET_BADGES, ...PLAY_BADGES, ...GYM_BADGES];
export const badgeById = (id) => ALL_BADGES.find((b) => b.id === id.replace(/\.gold$/, '')) || null;

// What the badges look at, from a save: dex (normalized), each mode's stats, daily history.
export function badgeFacts(dex, statsList, history) {
  const perSport = ENABLED_SPORTS.map((sp) => dex.sports?.[sp] || { caught: {}, seen: {}, shiny: {} });
  const caughtAny = new Set();
  for (const sd of perSport) for (const n of Object.keys(sd.caught || {})) caughtAny.add(Number(n));
  const triple = perSport.length > 1 && [...caughtAny].some((n) => perSport.every((sd) => sd.caught?.[n]));
  const shinies = perSport.reduce((t, sd) => t + Object.keys(sd.shiny || {}).length, 0);
  const dist = Array(GAME.maxGuesses).fill(0);
  let maxStreak = 0;
  for (const s of statsList) {
    (s?.distribution || []).forEach((c, i) => { dist[i] += c || 0; });
    maxStreak = Math.max(maxStreak, s?.maxStreak || 0);
  }

  // Clean Sweep: most catches on one day (history marks catches with c: 1; older days
  // fall back to the Dex, which records a creature's first catch date).
  const modeIds = MODES.map((m) => m.id);
  let bestSweep = 0;
  for (const day of Object.values(history || {})) bestSweep = Math.max(bestSweep, modeIds.filter((id) => day?.[id]?.c).length);
  const byDate = {};
  for (const sd of perSport) for (const e of Object.values(sd.caught || {})) if (e?.date && e.ball !== 'trade') byDate[e.date] = (byDate[e.date] || 0) + 1;
  bestSweep = Math.min(MODES.length, Math.max(bestSweep, ...Object.values(byDate), 0));

  // Perfect Week: longest run of consecutive days with every mode solved.
  let bestPerfectRun = 0;
  let run = 0;
  let prev = null;
  for (const d of Object.keys(history || {}).sort()) {
    if (prev && addDays(prev, 1) !== d) run = 0;
    run = modeIds.every((id) => history[d]?.[id]?.s === 'won') ? run + 1 : 0;
    bestPerfectRun = Math.max(bestPerfectRun, run);
    prev = d;
  }

  return { perSport, caughtAny, triple, shinies, dist, maxStreak, bestSweep, bestPerfectRun, gymsBeaten: dex.gyms?.beaten || {} };
}

// Every badge with its state: { ...badge, kind, cur, goal, earned, gold, date }.
// Once saved in `stored`, a badge stays earned.
export function badgeStatus(facts, stored = {}) {
  const sets = SET_BADGES.map((b) => {
    const have = b.set.filter((n) => facts.caughtAny.has(n));
    const cur = have.length;
    const perSport = facts.perSport.map((sd) => b.set.filter((n) => sd.caught?.[n]).length);
    const gold = facts.perSport.length > 1 && perSport.every((c) => c === b.set.length);
    return {
      ...b, kind: 'set', cur, goal: b.set.length, have, perSport,
      earned: cur === b.set.length || !!stored[b.id], gold: gold || !!stored[`${b.id}.gold`],
      date: stored[b.id] || null, goldDate: stored[`${b.id}.gold`] || null,
    };
  });
  const play = PLAY_BADGES.map((b) => {
    const [cur, goal] = b.progress(facts);
    return { ...b, kind: 'play', cur: Math.min(cur, goal), goal, earned: cur >= goal || !!stored[b.id], gold: false, date: stored[b.id] || null };
  });
  const gyms = GYM_BADGES.map((b) => {
    const earned = !!facts.gymsBeaten[b.gym] || !!stored[b.id];
    return { ...b, kind: 'gym', cur: earned ? 1 : 0, goal: 1, earned, gold: false, date: stored[b.id] || facts.gymsBeaten[b.gym] || null };
  });
  return [...sets, ...play, ...gyms];
}
