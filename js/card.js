// Reusable athlete card. The daily game uses it with hidden: true.
// A future card generator or card collection can call renderCard(athlete) as-is.
import { STATS, STAT_MAX, SPORTS } from './config.js';
import { typeInfo, athleteTypes } from './types.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function initialsOf(name) {
  return name.split(/\s+/).filter((w) => !/^(jr\.?|sr\.?|ii|iii)$/i.test(w)).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
}

// Original emblem: a faceted hex badge tinted with the athlete's type colors.
export function emblemSvg(athlete, { hidden = true, size = 112 } = {}) {
  const [t1, t2] = athleteTypes(athlete).map((t) => typeInfo(t).color);
  const c2 = t2 || t1;
  const gid = `g-${athlete.id}-${hidden ? 'h' : 'r'}`;
  const glyph = hidden ? '?' : initialsOf(athlete.name);
  const fontSize = glyph.length > 2 ? 30 : glyph.length > 1 ? 38 : 54;
  return `
  <svg class="emblem" width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${t1}"/><stop offset="1" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <polygon points="60,4 110,32 110,88 60,116 10,88 10,32" fill="url(#${gid})" opacity="0.95"/>
    <polygon points="60,16 99,38 99,82 60,104 21,82 21,38" fill="rgba(8,12,28,0.82)"/>
    <polyline points="21,38 60,60 99,38" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="2"/>
    <line x1="60" y1="60" x2="60" y2="104" stroke="rgba(255,255,255,0.10)" stroke-width="2"/>
    <text x="60" y="${60 + fontSize * 0.36}" text-anchor="middle" font-family="'Russo One', system-ui, sans-serif"
      font-size="${fontSize}" fill="#fff">${esc(glyph)}</text>
  </svg>`;
}

export function typeBadges(athlete) {
  return athleteTypes(athlete)
    .map((t) => {
      const info = typeInfo(t);
      return `<span class="type-badge" style="--type:${info.color}">${info.emoji} ${esc(t)}</span>`;
    })
    .join('');
}

export function statBars(athlete) {
  const total = STATS.reduce((sum, s) => sum + (athlete.stats[s.key] || 0), 0);
  const rows = STATS.map((s) => {
    const v = athlete.stats[s.key] || 0;
    const pct = Math.round((v / STAT_MAX) * 100);
    return `<div class="stat-row" title="${esc(SPORTS[athlete.sport]?.statHints?.[s.key] || '')}">
      <span class="stat-label">${s.label}</span>
      <span class="stat-val">${v}</span>
      <span class="stat-track"><span class="stat-fill" style="width:${pct}%"></span></span>
    </div>`;
  }).join('');
  return `<div class="stats">${rows}<div class="stat-total">TOTAL <b>${total}</b></div></div>`;
}

/**
 * @param athlete  one entry from athletes.json
 * @param opts.hidden     hide the name (daily puzzle mode)
 * @param opts.showSport  show the sport badge (false in All Sports until revealed)
 * @param opts.label      text in the top-left corner, e.g. "No. 012"
 * @param opts.showComp   show the Gen 1 comparison
 */
export function renderCard(athlete, { hidden = false, showSport = true, label = '', showComp = !hidden } = {}) {
  const primary = typeInfo(athlete.type).color;
  const sport = SPORTS[athlete.sport];
  const sportBadge = showSport ? `${sport?.emoji || ''} ${esc(athlete.sport)}` : '❔ ???';
  const comp = showComp && athlete.comp
    ? `<div class="comp"><span class="comp-label">Gen 1 Comp</span>
         <span class="comp-name">#${String(athlete.comp.dex).padStart(3, '0')} ${esc(athlete.comp.name)}</span>
         <span class="comp-why">${esc(athlete.comp.why)}</span></div>`
    : '';
  return `
  <article class="card ${hidden ? 'is-hidden' : 'is-revealed'}" style="--type:${primary}">
    <div class="card-top">
      <span class="card-no">${esc(label)}</span>
      <span class="card-sport">${sportBadge}</span>
    </div>
    <div class="card-hero">
      ${emblemSvg(athlete, { hidden })}
      <div class="card-id">
        <h2 class="card-name">${hidden ? '??????' : esc(athlete.name)}</h2>
        <p class="card-category">${esc(athlete.category)} Athlete</p>
        ${hidden ? '' : `<p class="card-team">${esc(athlete.team)} · #${athlete.number} · ${esc(athlete.position)}</p>`}
        <div class="types">${typeBadges(athlete)}</div>
      </div>
    </div>
    ${statBars(athlete)}
    <p class="bio">${esc(athlete.bio)}</p>
    ${comp}
  </article>`;
}
