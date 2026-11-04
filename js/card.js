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
      return `<span class="type-badge" style="--type:${info.color}" data-types="${esc(t)}" role="button" tabindex="0" aria-label="${esc(t)} type: what it means">${info.emoji} ${esc(t)}</span>`;
    })
    .join('');
}

// The headline Gen 1 comparison. The "why" line stays hidden until the puzzle ends.
export function compBanner(athlete, { revealWhy = true, status = null, rare = {} } = {}) {
  if (!athlete.comp) return '';
  return `<div class="comp-banner">
    ${rare.legendary || rare.shiny ? `<span class="rare-line">${rare.legendary ? '👑 Legendary encounter' : ''}${rare.legendary && rare.shiny ? ' · ' : ''}${rare.shiny ? '✨ Shiny encounter' : ''}</span>` : ''}
    <span class="comp-label">Plays like${status ? ` <span class="dex-chip ${status}">${{ caught: '✅ In your Dex', seen: '👁 Seen', new: '🆕 New' }[status]}</span>` : ''}</span>
    <span class="comp-name"><span class="comp-dex">#${String(athlete.comp.dex).padStart(3, '0')}</span> ${esc(athlete.comp.name)}</span>
    ${revealWhy ? `<span class="comp-why">${esc(athlete.comp.why)}</span>` : ''}
  </div>`;
}

function arrowFor(answerVal, guessVal) {
  const diff = answerVal - guessVal;
  if (diff === 0) return '<span class="stat-cmp hit" aria-label="same">=</span>';
  const cls = Math.abs(diff) <= 5 ? 'close' : 'miss';
  return diff > 0
    ? `<span class="stat-cmp ${cls}" aria-label="higher than your guess">▲</span>`
    : `<span class="stat-cmp ${cls}" aria-label="lower than your guess">▼</span>`;
}

/** Stat bars. With `compare` (another athlete), each bar gets a marker for that
 *  athlete's value and an arrow showing whether this athlete is higher or lower. */
export function statBars(athlete, compare = null) {
  const sum = (a) => STATS.reduce((t, s) => t + (a.stats[s.key] || 0), 0);
  const total = sum(athlete);
  const rows = STATS.map((s) => {
    const v = athlete.stats[s.key] || 0;
    const pct = Math.round((v / STAT_MAX) * 100);
    const cv = compare ? compare.stats[s.key] || 0 : null;
    const marker = compare ? `<span class="stat-marker" style="left:${Math.round((cv / STAT_MAX) * 100)}%" title="Your guess: ${cv}"></span>` : '';
    return `<div class="stat-row${compare ? ' has-cmp' : ''}" title="${esc(SPORTS[athlete.sport]?.statHints?.[s.key] || '')}">
      <span class="stat-label">${s.label}</span>
      <span class="stat-val">${v}</span>
      <span class="stat-track"><span class="stat-fill" style="width:${pct}%"></span>${marker}</span>
      ${compare ? arrowFor(v, cv) : ''}
    </div>`;
  }).join('');
  const head = compare
    ? `<div class="stat-cmp-head"><span>vs. <b>${esc(compare.name)}</b></span><span class="stat-cmp-key"><span class="key-marker"></span> your guess · ▲▼ mystery is higher / lower</span></div>`
    : '';
  const totalCmp = compare ? ` ${arrowFor(total, sum(compare))}` : '';
  // These are the athlete's own ratings, not the creature's stats.
  const label = '<div class="stat-heading">Athlete ratings <span>1–150</span></div>';
  return `<div class="stats">${label}${head}${rows}<div class="stat-total">TOTAL <b>${total}</b>${totalCmp}</div></div>`;
}

/**
 * @param athlete  one entry from athletes.json
 * @param opts.hidden       hide the name (daily puzzle mode)
 * @param opts.showSport    show the sport badge (false in All Sports until revealed)
 * @param opts.label        text in the top-left corner, e.g. "No. 012"
 * @param opts.showComp     show the Gen 1 comparison banner
 * @param opts.compareWith  another athlete whose stats are marked on the bars
 */
export function renderCard(athlete, { hidden = false, showSport = true, label = '', showComp = true, compareWith = null, dexStatus = null, rare = {} } = {}) {
  const primary = typeInfo(athlete.type).color;
  const sport = SPORTS[athlete.sport];
  const sportBadge = showSport ? `${sport?.emoji || ''} ${esc(athlete.sport)}` : '❔ ???';
  return `
  <article class="card ${hidden ? 'is-hidden' : 'is-revealed'}${rare.shiny ? ' is-shiny' : ''}${rare.legendary ? ' is-legendary' : ''}" style="--type:${primary}">
    <div class="card-top">
      <span class="card-no">${esc(label)}</span>
      <span class="card-sport">${sportBadge}</span>
    </div>
    ${showComp ? compBanner(athlete, { revealWhy: !hidden, status: dexStatus, rare }) : ''}
    <div class="card-hero">
      ${emblemSvg(athlete, { hidden })}
      <div class="card-id">
        <h2 class="card-name">${hidden ? '??????' : esc(athlete.name)}</h2>
        <p class="card-category">${esc(athlete.category)} Athlete</p>
        ${hidden ? '' : `<p class="card-team">${esc(athlete.team)} · #${athlete.number} · ${esc(athlete.position)}</p>`}
        <div class="types">${typeBadges(athlete)}</div>
      </div>
    </div>
    ${statBars(athlete, compareWith)}
    <p class="bio">${esc(athlete.bio)}</p>
  </article>`;
}
