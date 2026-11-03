// Type registry: original names-for-playstyles, original colors and emoji icons.
// "fits" explains what kind of athlete gets the type, shown in the help screen.
// Future type-matchup battles can add an effectiveness chart here.

export const TYPES = {
  Normal:   { emoji: '⭐', color: '#9a9a8c', fits: 'Do-it-all, well-rounded players' },
  Fire:     { emoji: '🔥', color: '#ff6a2b', fits: 'Hot-hand scorers, flamethrower arms' },
  Water:    { emoji: '💧', color: '#3a8dff', fits: 'Smooth, fluid shooters and skaters' },
  Electric: { emoji: '⚡', color: '#ffd21f', fits: 'Speedsters and explosive athletes' },
  Grass:    { emoji: '🌱', color: '#4cc95a', fits: 'Young risers still growing' },
  Ice:      { emoji: '❄️', color: '#7fe3f2', fits: 'Ice-in-the-veins clutch performers' },
  Fighting: { emoji: '🥊', color: '#d2412f', fits: 'Physical power players' },
  Poison:   { emoji: '☠️', color: '#a24bd1', fits: 'Agitators and pests who wear you down' },
  Ground:   { emoji: '⛰️', color: '#c9a35a', fits: 'Gritty grinders with great footwork' },
  Flying:   { emoji: '🪽', color: '#8fa6ff', fits: 'High-flyers, deep threats, rangy fielders' },
  Psychic:  { emoji: '🔮', color: '#ff5c9a', fits: 'High-IQ playmakers and masterminds' },
  Bug:      { emoji: '🐝', color: '#a6c51e', fits: 'Relentless motors who never stop' },
  Rock:     { emoji: '🪨', color: '#b49a5e', fits: 'Big, immovable bodies' },
  Ghost:    { emoji: '👻', color: '#7660b8', fits: 'Elusive, slippery, hard to catch' },
  Dragon:   { emoji: '🐉', color: '#6d4dff', fits: 'Generational, one-of-a-kind talents' },
  Dark:     { emoji: '🌙', color: '#5b4c45', fits: 'Crafty tricksters and deceivers' },
  Steel:    { emoji: '🛡️', color: '#a7b6c7', fits: 'Lockdown defenders and walls' },
  Fairy:    { emoji: '✨', color: '#f39ad9', fits: 'Fan favorites with flair and charisma' },
};

export function typeInfo(name) {
  return TYPES[name] || { emoji: '❔', color: '#777', fits: '' };
}

export function athleteTypes(a) {
  return [a.type, a.type2].filter(Boolean);
}
