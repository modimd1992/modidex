// Checks data/athletes.json and data/schedule.json.
//   node tools/validate.mjs              -> check the data
//   node tools/validate.mjs --upcoming 7 -> also list the next 7 days of answers (spoilers!)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateAthletes } from '../js/validate.js';
import { MODES, SPORTS, isSportEnabled } from '../js/config.js';
import { answersForDate, dateKey, addDays, puzzleNumber } from '../js/daily.js';
import { GEN1 } from '../js/gen1.js';
import { isShiny, isLegendary } from '../js/catch.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

let file;
try {
  file = readJson('data/athletes.json');
} catch (e) {
  console.error(`✗ data/athletes.json is not valid JSON:\n  ${e.message}\n  (Usually a missing comma or quote near that spot.)`);
  process.exit(1);
}
const all = file.athletes || [];
const { errors, warnings } = validateAthletes(all);

let schedule = {};
try {
  const { _readme, ...s } = readJson('data/schedule.json');
  schedule = s;
} catch (e) {
  errors.push(`schedule.json: ${e.message}`);
}
const ids = new Set(all.map((a) => a.id));
const modeIds = new Set(MODES.map((m) => m.id));
for (const [date, picks] of Object.entries(schedule)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push(`schedule.json: "${date}" should look like 2026-12-25`);
  for (const [mode, id] of Object.entries(picks)) {
    if (!modeIds.has(mode)) warnings.push(`schedule.json ${date}: mode "${mode}" is not active`);
    if (!ids.has(id)) errors.push(`schedule.json ${date}: no athlete with id "${id}"`);
  }
}

// Every one of the 151 creatures must be catchable from an active sport.
const activeComps = new Set(all.filter((a) => isSportEnabled(a.sport) && a.comp).map((a) => a.comp.dex));
const uncatchable = GEN1.map((name, i) => ({ dex: i + 1, name })).filter((c) => !activeComps.has(c.dex));
if (uncatchable.length) warnings.push(`${uncatchable.length} of 151 creatures can't be caught yet (no active athlete has them as a comp): ${uncatchable.map((c) => `#${c.dex} ${c.name}`).join(', ')}`);
for (const a of all) if (a.comp && GEN1[a.comp.dex - 1] !== a.comp.name) errors.push(`${a.name}: comp "${a.comp.name}" doesn't match Dex #${a.comp.dex} (${GEN1[a.comp.dex - 1]})`);

console.log(`\nModiDex data check (rosters as of ${file.dataAsOf || 'unknown'})`);
for (const [sport, cfg] of Object.entries(SPORTS)) {
  const n = all.filter((a) => a.sport === sport).length;
  console.log(`  ${cfg.emoji} ${sport.padEnd(4)} ${String(n).padStart(3)} athletes${isSportEnabled(sport) ? '' : '  (turned off)'}`);
}
if (warnings.length) console.log(`\nNotes (${warnings.length}):\n  - ` + warnings.join('\n  - '));
if (errors.length) {
  console.log(`\n✗ ${errors.length} problem(s) to fix:\n  - ` + errors.join('\n  - '));
} else {
  console.log('\n✓ No problems found.');
}

const i = process.argv.indexOf('--upcoming');
if (i > -1) {
  const days = Number(process.argv[i + 1]) || 7;
  const active = all.filter((a) => isSportEnabled(a.sport));
  console.log(`\nUpcoming answers (SPOILERS):`);
  let key = dateKey();
  for (let d = 0; d < days; d++) {
    const ans = answersForDate(active, key, schedule);
    const row = MODES.map((m) => `${m.short}: ${ans[m.id]?.name || '-'}${isShiny(m.id, key) ? ' ✨' : ''}${isLegendary(ans[m.id]) ? ' 👑' : ''}`).join(' | ');
    console.log(`  ${key} #${puzzleNumber(key)}  ${row}`);
    key = addDays(key, 1);
  }
}
console.log('');
process.exit(errors.length ? 1 : 0);
