// Wordle-style feedback: compares a guessed athlete with the answer.
// Status values: 'hit' (green), 'close' (yellow), 'miss' (gray).
import { SPORTS, CLOSE } from './config.js';
import { ageOn } from './daily.js';
import { typeInfo, athleteTypes } from './types.js';

function groupsOf(a) {
  const g = SPORTS[a.sport]?.positionGroups?.[a.position];
  return g == null ? [] : [].concat(g);
}

function numeric(guessVal, answerVal, closeBy) {
  if (guessVal === answerVal) return { status: 'hit', arrow: null };
  return {
    status: Math.abs(guessVal - answerVal) <= closeBy ? 'close' : 'miss',
    arrow: answerVal > guessVal ? 'up' : 'down', // which way the answer is
  };
}

// Column definitions. "mixedOnly" columns only show in the All Sports mode.
export const COLUMNS = [
  { id: 'sport', label: 'Sport', mixedOnly: true },
  { id: 'league', label: 'Conf' },
  { id: 'team', label: 'Team' },
  { id: 'position', label: 'Pos' },
  { id: 'age', label: 'Age' },
  { id: 'number', label: '#' },
  { id: 'type', label: 'Type' },
];

export function columnsFor(mode) {
  const single = mode.sports?.length === 1 ? SPORTS[mode.sports[0]] : null;
  return COLUMNS.filter((c) => !c.mixedOnly || !single)
    // MLB calls it a League (AL/NL); the other sports call it a Conference.
    .map((c) => (c.id === 'league' && single?.leagueLabel ? { ...c, label: single.leagueLabel === 'League' ? 'Lg' : single.leagueLabel } : c));
}

export function compareGuess(guess, answer, key, mode) {
  const sameSport = guess.sport === answer.sport;
  const sameLeague = sameSport && guess.league === answer.league;
  const cells = {};

  cells.sport = {
    value: SPORTS[guess.sport]?.emoji || guess.sport,
    status: sameSport ? 'hit' : 'miss',
  };

  cells.league = { value: guess.league, status: sameLeague ? 'hit' : 'miss' };

  let teamStatus = 'miss';
  if (sameSport && guess.team === answer.team) teamStatus = 'hit';
  else if (sameLeague && guess.division === answer.division) teamStatus = 'close';
  cells.team = { value: guess.teamAbbr, status: teamStatus, title: guess.team };

  let posStatus = 'miss';
  if (sameSport && guess.position === answer.position) posStatus = 'hit';
  else if (sameSport && groupsOf(guess).some((g) => groupsOf(answer).includes(g))) posStatus = 'close';
  cells.position = { value: guess.position, status: posStatus };

  const gAge = ageOn(guess.birthDate, key);
  const aAge = ageOn(answer.birthDate, key);
  cells.age = { value: gAge, ...numeric(gAge, aAge, CLOSE.age) };

  cells.number = { value: guess.number, ...numeric(guess.number, answer.number, CLOSE.number) };

  const gTypes = athleteTypes(guess);
  const aTypes = athleteTypes(answer);
  let typeStatus = 'miss';
  if (guess.type === answer.type) typeStatus = 'hit';
  else if (gTypes.some((t) => aTypes.includes(t))) typeStatus = 'close';
  cells.type = {
    value: gTypes.map((t) => typeInfo(t).emoji).join(''),
    status: typeStatus,
    title: gTypes.join(' / '),
    types: gTypes,
  };

  return columnsFor(mode).map((c) => ({ id: c.id, label: c.label, ...cells[c.id] }));
}
