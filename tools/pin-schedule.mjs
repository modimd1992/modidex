// Freezes the daily answers: writes every day's answer, from launch through the next
// few days, into data/schedule.json. The automatic pick reshuffles when athletes are
// added or removed, so run this BEFORE editing data/athletes.json. Past puzzles,
// today's puzzle and saved games then stay the same after the roster change.
//   node tools/pin-schedule.mjs        -> pin through 7 days from today
//   node tools/pin-schedule.mjs 14     -> pin through 14 days from today
// Dates you pinned by hand are kept as they are.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateAthletes } from '../js/validate.js';
import { GAME, MODES, isSportEnabled } from '../js/config.js';
import { answersForDate, dateKey, addDays } from '../js/daily.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const days = Number(process.argv[2] || 7);
const file = JSON.parse(readFileSync(join(root, 'data/athletes.json'), 'utf8'));
const all = file.athletes || [];
// Same athlete list the game uses (js/data.js).
const { errors } = validateAthletes(all);
const bad = new Set(errors.map((e) => e.split(':')[0]));
const athletes = all.filter((a) => isSportEnabled(a.sport) && !bad.has(a.name) && !bad.has(a.id));

const schedPath = join(root, 'data/schedule.json');
const { _readme, ...schedule } = JSON.parse(readFileSync(schedPath, 'utf8'));
const before = JSON.stringify(schedule);

const last = addDays(dateKey(), days);
let added = 0;
for (let key = GAME.launchDate; key <= last; key = addDays(key, 1)) {
  const answers = answersForDate(athletes, key, schedule);
  for (const m of MODES) {
    const a = answers[m.id];
    if (!a || schedule[key]?.[m.id]) continue;
    (schedule[key] ||= {})[m.id] = a.id;
    added++;
  }
}

// Safety check: pinning must not change any answer up to `last`.
// (Fresh copies, so daily.js's cache recomputes each schedule.)
const wasSched = JSON.parse(before);
const nowSched = JSON.parse(JSON.stringify(schedule));
for (let key = GAME.launchDate; key <= last; key = addDays(key, 1)) {
  const was = answersForDate(athletes, key, wasSched);
  const now = answersForDate(athletes, key, nowSched);
  for (const m of MODES) {
    if (was[m.id]?.id !== now[m.id]?.id) {
      console.error(`✗ Pinning would change ${key} ${m.id} (${was[m.id]?.id} -> ${now[m.id]?.id}). Nothing written.`);
      process.exit(1);
    }
  }
}

const sorted = Object.fromEntries(Object.keys(schedule).sort().map((k) => [k, schedule[k]]));
writeFileSync(schedPath, `${JSON.stringify({ _readme, ...sorted }, null, 2)}\n`);
console.log(`✓ Pinned ${added} answers from ${GAME.launchDate} through ${last}. Now it's safe to edit data/athletes.json.`);
