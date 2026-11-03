// Builds the bonus clues that unlock after wrong guesses (see CLUE_SCHEDULE in config.js).
import { SPORTS, CLUE_SCHEDULE } from './config.js';

const CONFERENCE_NAMES = { East: 'Eastern Conference', West: 'Western Conference' };

function conferenceText(a, mode) {
  let where;
  if (a.sport === 'NFL' || a.sport === 'MLB') where = `${a.league} ${a.division}`;
  else where = `${CONFERENCE_NAMES[a.league] || a.league}, ${a.division} Division`;
  const isMixed = !mode.sports || mode.sports.length > 1;
  return isMixed ? `${SPORTS[a.sport]?.emoji || ''} ${a.sport} · ${where}` : where;
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter((w) => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w))
    .map((w) => w[0].toUpperCase() + '.')
    .join(' ');
}

const BUILDERS = {
  conference: (a, mode) => ({ label: 'Plays in', text: conferenceText(a, mode) }),
  team: (a) => ({ label: 'Team', text: a.team }),
  initials: (a) => ({ label: 'Initials', text: initials(a.name) }),
  number: (a) => ({ label: 'Jersey', text: `#${a.number}` }),
};

// Returns every scheduled clue with an "unlocked" flag.
export function cluesFor(answer, mode, wrongGuesses, finished) {
  return CLUE_SCHEDULE.map((c) => {
    const built = BUILDERS[c.id]?.(answer, mode) || { label: c.id, text: '' };
    return { ...built, after: c.after, unlocked: finished || wrongGuesses >= c.after };
  });
}
