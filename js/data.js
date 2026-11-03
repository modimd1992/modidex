// Loads athlete data (and the optional date schedule) in the browser.
import { validateAthletes } from './validate.js';
import { isSportEnabled } from './config.js';

async function getJson(url, fallback) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}

export async function loadData() {
  const [athleteFile, scheduleFile] = await Promise.all([
    getJson('./data/athletes.json'),
    getJson('./data/schedule.json', {}),
  ]);
  const all = athleteFile.athletes || [];
  const { errors, warnings } = validateAthletes(all);
  if (errors.length) console.warn(`[athletes.json] ${errors.length} problem(s) — those athletes are skipped:\n` + errors.join('\n'));
  if (warnings.length) console.info(`[athletes.json] notes:\n` + warnings.join('\n'));

  const badNames = new Set(errors.map((e) => e.split(':')[0]));
  const athletes = all.filter((a) => isSportEnabled(a.sport) && !badNames.has(a.name) && !badNames.has(a.id));
  const byId = new Map(athletes.map((a) => [a.id, a]));
  const { _readme, ...schedule } = scheduleFile;
  return { athletes, byId, schedule, dataAsOf: athleteFile.dataAsOf };
}
