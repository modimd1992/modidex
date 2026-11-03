// Group leaderboard scoring. A solved puzzle is worth 6 points on the 1st guess
// down to 1 point on the 6th; a miss is worth 0.
import { GAME } from './config.js';
import { addDays } from './daily.js';

export const pointsFor = (r) => (r && (r.status === 'won' || r.s === 'won') ? Math.max(0, GAME.maxGuesses + 1 - r.n) : 0);

// Monday of the week (ET) that contains this date key.
export function weekStart(key) {
  const [y, m, d] = key.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(key, -((day + 6) % 7));
}

// Totals for the week containing `key`, from the daily history.
// history: { 'YYYY-MM-DD': { modeId: { s: 'won'|'lost', n } } }
export function weekTotals(history, key, modeIds) {
  const start = weekStart(key);
  const out = { start, pts: 0, solved: 0, played: 0 };
  for (let i = 0; i < 7; i++) {
    const day = history?.[addDays(start, i)];
    if (!day) continue;
    for (const id of modeIds) {
      const r = day[id];
      if (!r) continue;
      out.played += 1;
      if (r.s === 'won') out.solved += 1;
      out.pts += pointsFor(r);
    }
  }
  return out;
}

// All-time totals, from each mode's lifetime stats (guess distribution).
export function allTimeTotals(statsByMode) {
  const out = { pts: 0, solved: 0, played: 0 };
  for (const s of Object.values(statsByMode)) {
    out.played += s.played || 0;
    out.solved += s.wins || 0;
    (s.distribution || []).forEach((count, i) => { out.pts += (count || 0) * Math.max(0, GAME.maxGuesses - i); });
  }
  return out;
}
