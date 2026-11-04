// Game-wide settings. Most things you'd want to tweak live here.

export const GAME = {
  name: 'ModiDex',
  tagline: 'Daily Athlete Scouting Game',
  hashtag: '#ModiDex',
  // Where the footer's Feedback link goes: a form URL or 'mailto:you@example.com'. null hides it.
  feedbackUrl: null,
  // Puzzle #1 is this date. Changing it renumbers every puzzle.
  launchDate: '2026-11-02',
  // New puzzles for everyone at midnight in this time zone (handles daylight saving).
  timeZone: 'America/New_York',
  maxGuesses: 6,
  storagePrefix: 'modidex:v1',
};

// Bonus clues that unlock after wrong guesses. Turned off (empty) for now.
// To bring them back, add entries like { after: 3, id: 'conference' }.
// Available ids (see clues.js): 'conference', 'team', 'number', 'initials'.
export const CLUE_SCHEDULE = [];

// Catching: which ball you throw depends on the guess you solve it on.
// rate = chance to catch. Solving on the last guess only registers it as Seen; a loss means it flees.
export const CATCH = {
  tiers: [
    { id: 'hof', guesses: [1], name: 'Hall of Fame Ball', icon: '🏆', rate: 1, legendaryRate: 1 },
    { id: 'allstar', guesses: [2], name: 'All-Star Ball', icon: '⭐', rate: 0.75, legendaryRate: 0.5 },
    { id: 'pro', guesses: [3], name: 'Pro Ball', icon: '🎖️', rate: 0.5, legendaryRate: 0.3 },
    { id: 'rookie', guesses: [4, 5], name: 'Rookie Ball', icon: '🔰', rate: 0.3, legendaryRate: 0.15 },
  ],
  total: 151,
  // Legendary creatures are tougher to catch (legendaryRate above).
  legendary: [144, 145, 146, 150, 151],
  // About 1 in this many puzzles is a shiny encounter (same for every player that day).
  shinyOdds: 25,
};

// Stats shown on every profile. Same six keys for every sport so mixed mode works.
export const STATS = [
  { key: 'hp', label: 'HP' },
  { key: 'atk', label: 'ATK' },
  { key: 'def', label: 'DEF' },
  { key: 'skl', label: 'SKL' },
  { key: 'iq', label: 'IQ' },
  { key: 'spe', label: 'SPD' },
];
export const STAT_MAX = 150;

// Every sport the game knows about. To add a sport (e.g. WNBA, MLS):
// 1) add an entry here, 2) add athletes with that "sport" value, 3) add a mode in ALL_MODES.
// Set enabled: false to hide a sport (its athletes stay in the JSON file).
export const SPORTS = {
  NFL: {
    label: 'NFL', emoji: '🏈',
    leagueLabel: 'Conf', // what "league" means for this sport
    leagues: { AFC: ['East', 'North', 'South', 'West'], NFC: ['East', 'North', 'South', 'West'] },
    // Positions in the same group show yellow ("close").
    positionGroups: {
      QB: 'QB', RB: 'RB', FB: 'RB', WR: 'REC', TE: 'REC',
      OT: 'OL', OG: 'OL', C: 'OL', DE: 'DL', DT: 'DL', EDGE: 'DL',
      LB: 'LB', CB: 'DB', S: 'DB', K: 'ST', P: 'ST',
    },
    statHints: {
      hp: 'Durability and availability', atk: 'Big-play power: yards, TDs, sacks',
      def: 'Defense, ball security, pass blocking', skl: 'Accuracy, hands, route running, technique',
      iq: 'Reads, vision, decision-making', spe: 'Straight-line speed and burst',
    },
  },
  NBA: {
    label: 'NBA', emoji: '🏀',
    leagueLabel: 'Conf',
    leagues: { East: ['Atlantic', 'Central', 'Southeast'], West: ['Northwest', 'Pacific', 'Southwest'] },
    positionGroups: { PG: 'G', SG: 'G', G: 'G', SF: 'F', PF: 'F', F: 'F', C: 'C' },
    statHints: {
      hp: 'Durability, minutes, motor', atk: 'Scoring volume and power',
      def: 'On-ball defense, rim protection, rebounding', skl: 'Shooting touch and ball skills',
      iq: 'Playmaking and court vision', spe: 'Quickness and athleticism',
    },
  },
  MLB: {
    label: 'MLB', emoji: '⚾',
    leagueLabel: 'League',
    leagues: { AL: ['East', 'Central', 'West'], NL: ['East', 'Central', 'West'] },
    // TWP = two-way player; it counts as both pitcher and hitter.
    positionGroups: {
      SP: 'P', RP: 'P', CP: 'P', C: 'C', '1B': 'IF', '2B': 'IF', '3B': 'IF', SS: 'IF',
      LF: 'OF', CF: 'OF', RF: 'OF', DH: 'DH', TWP: ['P', 'DH'],
    },
    statHints: {
      hp: 'Durability and innings / games played', atk: 'Power: home runs, exit velo, or pitch velocity',
      def: 'Fielding (hitters) or run prevention (pitchers)', skl: 'Contact (hitters) or command (pitchers)',
      iq: 'Plate discipline or pitch mix / sequencing', spe: 'Sprint speed and baserunning',
    },
  },
  NHL: {
    enabled: false, // turned off for now. Set to true (or delete this line) to bring hockey back.
    label: 'NHL', emoji: '🏒',
    leagueLabel: 'Conf',
    leagues: { East: ['Atlantic', 'Metropolitan'], West: ['Central', 'Pacific'] },
    positionGroups: { C: 'F', LW: 'F', RW: 'F', F: 'F', D: 'D', G: 'G' },
    statHints: {
      hp: 'Durability and ice time', atk: 'Goal scoring and shot power',
      def: 'Defensive play (skaters) or save ability (goalies)', skl: 'Stickhandling, passing, puck skills',
      iq: 'Hockey sense and playmaking', spe: 'Skating speed and edgework',
    },
  },
};

export const isSportEnabled = (sport) => !!SPORTS[sport] && SPORTS[sport].enabled !== false;
export const ENABLED_SPORTS = Object.keys(SPORTS).filter(isSportEnabled);

// Daily modes the player can pick. "sports: null" means every enabled sport.
const ALL_MODES = [
  { id: 'all', label: 'All Sports', short: 'ALL', emoji: '🌐', sports: null },
  { id: 'nfl', label: 'NFL', short: 'NFL', emoji: '🏈', sports: ['NFL'] },
  { id: 'nba', label: 'NBA', short: 'NBA', emoji: '🏀', sports: ['NBA'] },
  { id: 'mlb', label: 'MLB', short: 'MLB', emoji: '⚾', sports: ['MLB'] },
  { id: 'nhl', label: 'NHL', short: 'NHL', emoji: '🏒', sports: ['NHL'] },
];
// Modes whose sports are turned off are hidden automatically.
export const MODES = ALL_MODES.filter((m) => !m.sports || m.sports.every(isSportEnabled));

// Wordle-style "close" thresholds for number comparisons.
export const CLOSE = { age: 2, number: 3 };
