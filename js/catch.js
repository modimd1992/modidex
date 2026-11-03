// Catching: solving a puzzle lets you throw a ball at that athlete's Gen 1 creature.
// The faster you solve, the better the ball. Results are rolled once and saved.
import { CATCH, GAME } from './config.js';
import { loadDex, saveDex, sportDex } from './storage.js';
import { hashString } from './daily.js';
import { familyOf } from './gen1.js';

export function tierForGuess(n) {
  return CATCH.tiers.find((t) => t.guesses.includes(n)) || null;
}

export function ballById(id) {
  return CATCH.tiers.find((t) => t.id === id) || null;
}

export const isLegendary = (athlete) => !!athlete?.comp && CATCH.legendary.includes(athlete.comp.dex);

// Same answer for every player: decided by the date and mode.
export const isShiny = (modeId, key) => hashString(`${GAME.name}:shiny:${key}:${modeId}`) % CATCH.shinyOdds === 0;

export const catchRate = (tier, legendary) => (legendary ? tier.legendaryRate : tier.rate);

// sd = one sport's Dex.
export function lineProgress(sd, n) {
  const fam = familyOf(n);
  if (!fam) return null;
  return { family: fam, caught: fam.filter((d) => sd.caught[d]).length, total: fam.length };
}

/**
 * Decides the catch for a finished game (once) and updates the Dex.
 * Returns the saved result: { outcome: 'caught' | 'escaped' | 'seen' | 'fled', ... }
 */
export function resolveCatch(game, answer, key, { shiny = false, legendary = false } = {}) {
  if (game.catch) return game.catch;
  const comp = answer.comp;
  if (!comp) return null;
  const all = loadDex();
  const dex = sportDex(all, answer.sport); // each sport has its own Dex
  const was = { caught: !!dex.caught[comp.dex], seen: !!dex.seen[comp.dex], shiny: !!dex.shiny[comp.dex] };
  const n = game.guesses.length;
  let result;

  if (game.status !== 'won') {
    result = { outcome: 'fled' };
  } else {
    const tier = tierForGuess(n);
    if (!tier) {
      result = { outcome: 'seen' };
    } else {
      const rate = catchRate(tier, legendary);
      result = { outcome: Math.random() < rate ? 'caught' : 'escaped', ball: tier.id, rate };
    }
  }

  const entry = { date: key, athleteId: answer.id };
  const caught = result.outcome === 'caught';
  if (caught && !was.caught) dex.caught[comp.dex] = { ...entry, ball: result.ball };
  if (caught && shiny && !was.shiny) dex.shiny[comp.dex] = entry;
  if (result.outcome !== 'fled' && !was.seen) dex.seen[comp.dex] = entry;
  saveDex(all);

  const line = caught && !was.caught ? lineProgress(dex, comp.dex) : null;
  game.catch = {
    ...result,
    dex: comp.dex,
    name: comp.name,
    sport: answer.sport,
    shiny,
    legendary,
    newCatch: caught && !was.caught,
    newShiny: caught && shiny && !was.shiny,
    alreadyCaught: was.caught,
    line: line ? { first: line.family[0], caught: line.caught, total: line.total } : null,
  };
  return game.catch;
}
