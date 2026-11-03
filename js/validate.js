// Checks athletes.json for mistakes. Used by the browser (console warnings)
// and by `node tools/validate.mjs`.
import { SPORTS, STATS, STAT_MAX } from './config.js';
import { TYPES } from './types.js';

const REQUIRED = ['id', 'name', 'sport', 'league', 'division', 'team', 'teamAbbr',
  'position', 'number', 'birthDate', 'type', 'category', 'stats', 'bio'];

export function validateAthletes(list) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const names = new Map();
  const comps = new Map();

  list.forEach((a, i) => {
    const who = a?.name || a?.id || `athlete #${i + 1}`;
    const err = (msg) => errors.push(`${who}: ${msg}`);

    for (const f of REQUIRED) if (a[f] === undefined || a[f] === '') err(`missing "${f}"`);

    if (a.id) {
      if (!/^[a-z0-9-]+$/.test(a.id)) err(`id "${a.id}" should be lowercase letters, numbers and dashes`);
      if (ids.has(a.id)) err(`duplicate id "${a.id}"`);
      ids.add(a.id);
    }

    const sport = SPORTS[a.sport];
    if (!sport) err(`unknown sport "${a.sport}" (add it to SPORTS in js/config.js)`);
    else {
      const divisions = sport.leagues[a.league];
      if (!divisions) err(`league "${a.league}" not valid for ${a.sport}. Use one of: ${Object.keys(sport.leagues).join(', ')}`);
      else if (!divisions.includes(a.division)) err(`division "${a.division}" not valid for ${a.sport} ${a.league}. Use one of: ${divisions.join(', ')}`);
      if (!(a.position in sport.positionGroups)) err(`position "${a.position}" not known for ${a.sport}. Use one of: ${Object.keys(sport.positionGroups).join(', ')}`);
    }

    if (!Number.isInteger(a.number) || a.number < 0 || a.number > 99) err(`number should be a whole number 0-99`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.birthDate || '') || isNaN(Date.parse(a.birthDate))) err(`birthDate should look like 1995-09-17`);

    if (a.type && !TYPES[a.type]) err(`unknown type "${a.type}". Use one of: ${Object.keys(TYPES).join(', ')}`);
    if (a.type2 && !TYPES[a.type2]) err(`unknown type2 "${a.type2}"`);
    if (a.type2 && a.type2 === a.type) err(`type2 is the same as type`);

    if (a.stats) {
      for (const { key } of STATS) {
        const v = a.stats[key];
        if (typeof v !== 'number' || v < 1 || v > STAT_MAX) err(`stat "${key}" should be a number from 1 to ${STAT_MAX}`);
      }
    }

    if (a.bio && a.name) {
      const last = a.name.split(' ').filter((w) => w.length > 3).pop();
      if (last && a.bio.toLowerCase().includes(last.toLowerCase())) warnings.push(`${who}: bio mentions "${last}", which gives away the answer`);
    }

    if (a.bio && /\d/.test(a.bio)) warnings.push(`${who}: bio contains a number, which can give the answer away`);

    if (a.comp) {
      if (!a.comp.name) err(`comp is missing "name"`);
      if (!Number.isInteger(a.comp.dex) || a.comp.dex < 1 || a.comp.dex > 151) err(`comp.dex must be 1-151 (original 151 only)`);
      if (a.comp.name) {
        if (comps.has(a.comp.name)) warnings.push(`${who}: comp "${a.comp.name}" is also used by ${comps.get(a.comp.name)}`);
        comps.set(a.comp.name, who);
      }
    } else {
      warnings.push(`${who}: no Gen 1 comp yet`);
    }

    if (a.name) {
      const k = a.name.toLowerCase();
      if (names.has(k)) warnings.push(`${who}: same name as another athlete (${names.get(k)})`);
      names.set(k, a.id);
    }
  });

  return { errors, warnings };
}
