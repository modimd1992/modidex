// Battle engine for gym challenges. Pure functions only (no DOM), so Node can run it.
// Two teams of athletes fight one at a time in lineup order. Each turn the faster
// athlete acts first and uses the better of its types against the opponent.
import { hashString, mulberry32 } from './daily.js';

// Type effectiveness: TYPE_CHART[attacker][defender] = multiplier (missing = 1).
// "No effect" matchups are softened to 0.25 so auto-battles can't stall.
const NONE = 0.25;
export const TYPE_CHART = {
  Normal: { Rock: 0.5, Ghost: NONE, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: NONE, Flying: 2, Dragon: 0.5 },
  Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: NONE, Dark: 2, Steel: 2, Fairy: 0.5 },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: NONE, Fairy: 2 },
  Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: NONE, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: NONE, Steel: 0.5 },
  Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: NONE, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: NONE },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
  Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};

// Original move names, one per type.
export const MOVES = {
  Normal: 'Fundamentals', Fire: 'Heat Check', Water: 'Smooth Stroke', Electric: 'Fast Break',
  Grass: 'Growth Spurt', Ice: 'Ice Cold', Fighting: 'Power Drive', Poison: 'Trash Talk',
  Ground: 'Ground Game', Flying: 'Deep Shot', Psychic: 'Film Study', Bug: 'Full-Court Press',
  Rock: 'Brick Wall', Ghost: 'Ankle Breaker', Dragon: 'Generational Play', Dark: 'Trick Play',
  Steel: 'Lockdown', Fairy: 'Crowd Pleaser',
};

export const typesOf = (a) => a.types || [a.type, a.type2].filter(Boolean);

// Multiplier for an attack of `type` against a defender's types.
export function effectiveness(type, defTypes) {
  return defTypes.reduce((m, d) => m * (TYPE_CHART[type]?.[d] ?? 1), 1);
}

// The attacker's best type against this defender (ties go to its main type).
export function bestMove(attacker, defender) {
  let best = null;
  for (const t of typesOf(attacker)) {
    const m = effectiveness(t, typesOf(defender));
    if (!best || m > best.mult) best = { type: t, mult: m, name: MOVES[t] || 'Big Play' };
  }
  return best || { type: 'Normal', mult: 1, name: MOVES.Normal };
}

// Scales a 1-150 rating to a battle stat at a level (same shape as classic creature games).
const stat = (base, level) => Math.floor((2 * base * level) / 100) + 5;
const hpStat = (base, level) => Math.floor((2 * base * level) / 100) + level + 10;

// One battler from an athlete at a level.
export function fighter(athlete, level, extra = {}) {
  const s = athlete.stats || {};
  return {
    id: athlete.id, name: athlete.name, sport: athlete.sport, types: typesOf(athlete), level,
    maxHp: hpStat(s.hp || 80, level),
    atk: stat(0.6 * (s.atk || 80) + 0.4 * (s.skl || 80), level),
    def: stat(s.def || 80, level),
    spe: stat(s.spe || 80, level),
    crit: 0.04 + (s.iq || 80) / 1500,
    ...extra,
  };
}

const POWER = 70;

/**
 * Runs a whole battle. Same inputs + seed = same result.
 * Returns { winner: 'me' | 'foe', events, turns } where events drive the playback:
 *   { t: 'send', side, i }          a battler comes in
 *   { t: 'move', side, move, type, mult, crit, dmg, hp }   an attack (hp = target's hp after)
 *   { t: 'faint', side, i }         a battler is knocked out
 */
export function runBattle(meTeam, foeTeam, seed) {
  const rand = mulberry32(hashString(String(seed)));
  const teams = {
    me: meTeam.map((f) => ({ ...f, hp: f.maxHp })),
    foe: foeTeam.map((f) => ({ ...f, hp: f.maxHp })),
  };
  const idx = { me: 0, foe: 0 };
  const events = [{ t: 'send', side: 'foe', i: 0 }, { t: 'send', side: 'me', i: 0 }];
  const other = (side) => (side === 'me' ? 'foe' : 'me');
  let turns = 0;

  while (idx.me < teams.me.length && idx.foe < teams.foe.length && turns < 300) {
    turns++;
    const a = teams.me[idx.me];
    const b = teams.foe[idx.foe];
    const order = a.spe > b.spe || (a.spe === b.spe && rand() < 0.5) ? ['me', 'foe'] : ['foe', 'me'];
    for (const side of order) {
      const atk = teams[side][idx[side]];
      const defSide = other(side);
      const def = teams[defSide][idx[defSide]];
      if (!atk || !def || atk.hp <= 0) continue;
      const mv = bestMove(atk, def);
      const crit = rand() < atk.crit;
      const roll = 0.85 + rand() * 0.15;
      const base = (((2 * atk.level) / 5 + 2) * POWER * (atk.atk / def.def)) / 50 + 2;
      const dmg = Math.max(1, Math.floor(base * mv.mult * (crit ? 1.5 : 1) * roll));
      def.hp = Math.max(0, def.hp - dmg);
      events.push({ t: 'move', side, move: mv.name, type: mv.type, mult: mv.mult, crit, dmg, hp: def.hp });
      if (def.hp === 0) {
        events.push({ t: 'faint', side: defSide, i: idx[defSide] });
        idx[defSide]++;
        if (idx[defSide] < teams[defSide].length) events.push({ t: 'send', side: defSide, i: idx[defSide] });
        break; // the knocked-out side's replacement waits for the next turn
      }
    }
  }
  const winner = idx.foe >= teams.foe.length ? 'me' : 'foe';
  return { winner, events, turns };
}
