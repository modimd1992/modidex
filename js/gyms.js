// Gym challenge: 8 original gym leaders in the classic Gen 1 type order.
// One challenge per week (Monday–Sunday ET). Pure functions only (no DOM).
//
// Saved in the Dex as dex.gyms = {
//   beaten: { [gymNo]: 'YYYY-MM-DD' },
//   week:   Monday of the week of your last challenge,
//   last:   { gym, won, date },
//   team:   [athleteId, ...]  your last lineup
// }
import { typesOf, fighter } from './battle.js';
import { hashString, seededShuffle } from './daily.js';

export const GYMS = [
  { no: 1, pct: 0.15, foeBonus: 2, type: 'Rock', leader: 'Coach Boulder', badge: { name: 'Bedrock Badge', icon: '🪨' }, size: 3, level: 14,
    taunt: "My lineup doesn't move. You'll have to go through it.", win: 'Solid. You cracked the wall.', lose: 'Bounced off the wall. Come back stronger.' },
  { no: 2, pct: 0.3, foeBonus: 1, type: 'Water', leader: 'Coach Rapids', badge: { name: 'Riptide Badge', icon: '🌊' }, size: 3, level: 20,
    taunt: 'We play smooth and we never stop flowing.', win: "You rode the wave. Didn't think you had it.", lose: 'Swept out to sea. Try again next week.' },
  { no: 3, pct: 0.35, foeBonus: -1, type: 'Electric', leader: 'Coach Voltage', badge: { name: 'Surge Badge', icon: '⚡' }, size: 4, level: 26,
    taunt: 'Blink and the play is already over.', win: 'Shocking. You kept up with us.', lose: 'Too slow! Recharge and come back.' },
  { no: 4, pct: 0.4, foeBonus: 2, type: 'Grass', leader: 'Coach Greenway', badge: { name: 'Sprout Badge', icon: '🌿' }, size: 4, level: 32,
    taunt: 'My young squad grows stronger every quarter.', win: 'You outgrew us. Well played.', lose: 'Rooted in place. Next week, then.' },
  { no: 5, pct: 0.55, foeBonus: 1, type: 'Poison', leader: 'Coach Venom', badge: { name: 'Toxin Badge', icon: '🧪' }, size: 5, level: 38,
    taunt: "We'll get in your head and stay there.", win: "Ugh. You didn't even flinch.", lose: 'Wore you down, just like I said.' },
  { no: 6, pct: 0.7, foeBonus: 3, type: 'Psychic', leader: 'Coach Mindgame', badge: { name: 'Insight Badge', icon: '🔮' }, size: 5, level: 44,
    taunt: "I've studied the film. I know your next move.", win: "I didn't see that coming. Truly.", lose: 'Predictable. Study up and return.' },
  { no: 7, pct: 0.7, foeBonus: 2, type: 'Fire', leader: 'Coach Blaze', badge: { name: 'Inferno Badge', icon: '🔥' }, size: 6, level: 50,
    taunt: "My team doesn't cool off. Ever.", win: 'You put out the fire. Respect.', lose: 'Burned! Come back when you can take the heat.' },
  { no: 8, pct: 0.8, foeBonus: 5, type: 'Ground', leader: 'The Commissioner', badge: { name: 'Tectonic Badge', icon: '🌋' }, size: 6, level: 56,
    taunt: 'Seven badges. Impressive. This is where it ends.', win: 'The final badge is yours, champion.', lose: 'Not today. The Commissioner always wins.' },
];
export const gymByNo = (no) => GYMS.find((g) => g.no === no) || null;

// The next gym to beat, or null once all 8 are done.
export function currentGym(state) {
  return GYMS.find((g) => !state?.beaten?.[g.no]) || null;
}

export const statTotal = (a) => Object.values(a.stats || {}).reduce((t, v) => t + (v || 0), 0);
const isType = (a, type) => typesOf(a).includes(type);

// A leader's lineup: athletes of the gym's type whose overall rating sits near the gym's
// target (pct = percentile among all athletes), ace last. The same for everyone.
export function leaderTeam(gym, athletes) {
  const rated = athletes.filter((a) => a.stats);
  const totals = rated.map(statTotal).sort((x, y) => x - y);
  const target = totals[Math.round(gym.pct * (totals.length - 1))];
  const near = rated.filter((a) => isType(a, gym.type))
    .sort((x, y) => Math.abs(statTotal(x) - target) - Math.abs(statTotal(y) - target) || (x.id < y.id ? -1 : 1))
    .slice(0, gym.size * 2);
  const picks = seededShuffle(near, hashString(`gym:${gym.no}`)).slice(0, gym.size).sort((x, y) => statTotal(x) - statTotal(y));
  return picks.map((a, i) => fighter(a, gym.level + (gym.foeBonus || 0) + (i === picks.length - 1 ? 1 : 0)));
}

// Your fighters: everyone at the gym's level; your partner gets up to +5 levels from its own level.
export function playerTeam(gym, athletes, partner = null, partnerLevel = 0) {
  return athletes.map((a) => {
    const bonus = partner && a.id === partner.athleteId ? Math.max(0, Math.min(5, partnerLevel - gym.level)) : 0;
    return fighter(a, gym.level + bonus, { partner: bonus > 0 || (partner && a.id === partner.athleteId) });
  });
}

// A random "wild" lineup for practice battles.
export function practiceTeam(gym, athletes, seed) {
  const pool = athletes.filter((a) => a.stats);
  return seededShuffle(pool, hashString(`practice:${seed}`)).slice(0, gym.size).map((a) => fighter(a, gym.level));
}

// One challenge per calendar week (weekKey = Monday's date).
export const canChallenge = (state, weekKey) => (state?.week || '') !== weekKey;
