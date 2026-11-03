// Catching: solving a puzzle lets you throw a ball at that athlete's Gen 1 creature.
// The faster you solve, the better the ball. Results are rolled once and saved.
import { CATCH } from './config.js';
import { loadDex, saveDex } from './storage.js';

export function tierForGuess(n) {
  return CATCH.tiers.find((t) => t.guesses.includes(n)) || null;
}

/**
 * Decides the catch for a finished game (once) and updates the Dex.
 * Returns the saved result: { outcome: 'caught' | 'escaped' | 'seen' | 'fled', ... }
 */
export function resolveCatch(game, answer, key) {
  if (game.catch) return game.catch;
  const comp = answer.comp;
  if (!comp) return null;
  const dex = loadDex();
  const was = { caught: !!dex.caught[comp.dex], seen: !!dex.seen[comp.dex] };
  const n = game.guesses.length;
  let result;

  if (game.status !== 'won') {
    result = { outcome: 'fled' };
  } else {
    const tier = tierForGuess(n);
    if (!tier) {
      result = { outcome: 'seen' };
    } else {
      const caught = Math.random() < tier.rate;
      result = { outcome: caught ? 'caught' : 'escaped', ball: tier.id };
    }
  }

  const entry = { date: key, athleteId: answer.id };
  if (result.outcome === 'caught' && !was.caught) dex.caught[comp.dex] = { ...entry, ball: result.ball };
  if (result.outcome !== 'fled' && !was.seen) dex.seen[comp.dex] = entry;
  saveDex(dex);

  game.catch = {
    ...result,
    dex: comp.dex,
    name: comp.name,
    newCatch: result.outcome === 'caught' && !was.caught,
    newSeen: result.outcome !== 'fled' && !was.seen && !(result.outcome === 'caught'),
    alreadyCaught: was.caught,
  };
  return game.catch;
}

export function ballById(id) {
  return CATCH.tiers.find((t) => t.id === id) || null;
}
