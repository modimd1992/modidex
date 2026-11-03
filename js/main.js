// App entry point: wires data, daily answers, storage and the screen together.
import { GAME, MODES, SPORTS, STATS, CLUE_SCHEDULE, CLOSE, ENABLED_SPORTS } from './config.js';
import { TYPES } from './types.js';
import { loadData } from './data.js';
import { dateKey, puzzleNumber, answersForDate, poolForMode } from './daily.js';
import { compareGuess, columnsFor } from './compare.js';
import { cluesFor } from './clues.js';
import { loadGame, saveGame, loadStats, recordResult, displayStreak, loadPref, savePref } from './storage.js';
import { shareText, shareOrCopy, copyText } from './share.js';
import { renderCard, esc } from './card.js';
import { attachAutocomplete } from './autocomplete.js';

const $ = (sel, root = document) => root.querySelector(sel);

const S = {
  data: null,
  key: null,
  puzzleNo: 0,
  answers: {},
  mode: MODES[0],
  game: null,
  ac: null,
};

const isMixed = (mode) => !mode.sports || mode.sports.length > 1;
const answer = () => S.answers[S.mode.id];
const finished = () => S.game.status !== 'playing';
const wrongCount = () => S.game.guesses.filter((id) => id !== S.game.answerId).length;
const pad3 = (n) => String(n).padStart(3, '0');

// ---------- boot ----------
async function init() {
  try {
    S.data = await loadData();
  } catch (e) {
    $('#app').innerHTML = `<div class="panel error"><h2>Couldn't load the athlete data</h2>
      <p>If you opened index.html straight from your files, start a local server instead (see README).</p>
      <p class="small">${esc(e.message)}</p></div>`;
    return;
  }
  if (S.data.dataAsOf) $('#data-asof').textContent = `Rosters as of ${S.data.dataAsOf}.`;
  setDay();
  const fromHash = MODES.find((m) => m.id === location.hash.slice(1));
  const fromPref = MODES.find((m) => m.id === loadPref('mode', null));
  S.mode = fromHash || fromPref || MODES[0];

  $('#btn-help').addEventListener('click', openHelp);
  $('#btn-stats').addEventListener('click', () => openStats(S.mode.id));
  window.addEventListener('hashchange', () => {
    const m = MODES.find((x) => x.id === location.hash.slice(1));
    if (m && m.id !== S.mode.id) selectMode(m.id, false);
  });
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick());

  renderModes();
  renderMode();
  if (!loadPref('seenHelp', false)) {
    openHelp();
    savePref('seenHelp', true);
  }
}

function setDay() {
  S.key = dateKey();
  S.puzzleNo = puzzleNumber(S.key);
  S.answers = answersForDate(S.data.athletes, S.key, S.data.schedule);
}

// New day while the tab is open: reload puzzles.
function tick() {
  if (!S.data) return;
  if (dateKey() !== S.key) {
    setDay();
    renderModes();
    renderMode();
    toast('A new day of puzzles is here!');
    return;
  }
  const cd = $('#countdown');
  if (cd) cd.textContent = timeToMidnight();
}

function timeToMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  const s = Math.max(0, Math.floor((next - now) / 1000));
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

// ---------- mode tabs ----------
function modeStatus(mode) {
  const a = S.answers[mode.id];
  if (!a) return 'none';
  return loadGame(mode.id, S.key, a.id).status;
}

function renderModes() {
  $('#modes').style.setProperty('--n', MODES.length);
  $('#modes').innerHTML = MODES.map((m) => {
    const st = modeStatus(m);
    const mark = st === 'won' ? '<span class="mark won">✓</span>' : st === 'lost' ? '<span class="mark lost">✗</span>' : '';
    return `<button class="mode-tab${m.id === S.mode.id ? ' is-active' : ''}" data-mode="${m.id}" aria-pressed="${m.id === S.mode.id}">
      <span class="mode-emoji">${m.emoji}</span><span class="mode-label">${esc(m.short)}</span>${mark}</button>`;
  }).join('');
  $('#modes').onclick = (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) selectMode(b.dataset.mode, true);
  };
}

function selectMode(id, pushHash) {
  S.mode = MODES.find((m) => m.id === id) || MODES[0];
  savePref('mode', S.mode.id);
  if (pushHash) history.replaceState(null, '', `#${S.mode.id}`);
  renderModes();
  renderMode();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- main screen ----------
function renderMode() {
  const a = answer();
  if (!a) {
    $('#app').innerHTML = `<div class="panel"><h2>No athletes yet for ${esc(S.mode.label)}</h2><p>Add some to data/athletes.json.</p></div>`;
    return;
  }
  S.game = loadGame(S.mode.id, S.key, a.id);
  $('#app').innerHTML = `
    <section id="card-area" aria-live="polite"></section>
    <section id="play-area"></section>
    <section id="clues" class="clues"></section>
    <section id="guesses" class="guesses" aria-label="Your guesses"></section>`;
  renderCardArea();
  renderClues();
  renderPlayArea();
  renderGuesses(false);
}

function renderCardArea() {
  const a = answer();
  const done = finished();
  const clueSportShown = CLUE_SCHEDULE.length > 0 && wrongCount() >= CLUE_SCHEDULE[0].after;
  $('#card-area').innerHTML = renderCard(a, {
    hidden: !done,
    showSport: !isMixed(S.mode) || done || clueSportShown,
    label: `${S.mode.short} No. ${pad3(S.puzzleNo)}`,
    showComp: done,
  });
}

function renderClues() {
  const list = cluesFor(answer(), S.mode, wrongCount(), finished());
  if (!list.length) { $('#clues').innerHTML = ''; return; }
  $('#clues').innerHTML = `<h3 class="section-title">Bonus clues</h3><ul>${list.map((c) =>
    c.unlocked
      ? `<li class="clue is-open"><span class="clue-label">${esc(c.label)}</span><span class="clue-text">${esc(c.text)}</span></li>`
      : `<li class="clue"><span class="clue-label">🔒 Locked</span><span class="clue-text">Unlocks after ${c.after} misses</span></li>`
  ).join('')}</ul>`;
}

function renderPlayArea() {
  const area = $('#play-area');
  if (!finished()) {
    const used = S.game.guesses.length;
    const dots = Array.from({ length: GAME.maxGuesses }, (_, i) => `<span class="dot${i < used ? ' used' : ''}"></span>`).join('');
    area.innerHTML = `
      <form class="guess-form" id="guess-form" autocomplete="off">
        <label for="guess-input" class="sr-only">Guess an athlete</label>
        <div class="ac-wrap">
          <input id="guess-input" type="text" inputmode="search" enterkeyhint="go" placeholder="Name the ${isMixed(S.mode) ? 'athlete' : esc(S.mode.label) + ' player'}…"
            role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ac-list" spellcheck="false" autocapitalize="words">
          <ul id="ac-list" class="ac-list" role="listbox" hidden></ul>
        </div>
        <button type="submit" class="btn btn-primary">Guess</button>
      </form>
      <div class="guess-count"><span>Guess ${Math.min(used + 1, GAME.maxGuesses)} of ${GAME.maxGuesses}</span><span class="dots">${dots}</span></div>`;
    const input = $('#guess-input');
    // On phones, lift the box to the top so suggestions aren't hidden by the keyboard.
    input.addEventListener('focus', () => {
      if (matchMedia('(max-width: 700px)').matches) setTimeout(() => $('#guess-form').scrollIntoView({ block: 'start', behavior: 'smooth' }), 250);
    });
    S.ac = attachAutocomplete({
      input,
      list: $('#ac-list'),
      getPool: () => poolForMode(S.data.athletes, S.mode),
      getExclude: () => new Set(S.game.guesses),
      onPick: submitGuess,
    });
    $('#guess-form').addEventListener('submit', (e) => {
      e.preventDefault();
      S.ac.submitTop();
    });
  } else {
    renderResult(area);
  }
}

function guessRows() {
  const a = answer();
  return S.game.guesses.map((id) => {
    const g = S.data.byId.get(id);
    return g ? { g, cells: compareGuess(g, a, S.key, S.mode) } : null;
  }).filter(Boolean);
}

function renderGuesses(animateLast) {
  const rows = guessRows();
  const cols = columnsFor(S.mode);
  const el = $('#guesses');
  if (!rows.length) {
    el.innerHTML = `<p class="hint">Start typing a name. Each guess shows how close you are: 🟩 match · 🟨 close · ⬛ miss.</p>`;
    return;
  }
  const header = `<div class="tiles tiles-head" style="--cols:${cols.length}">${cols.map((c) => `<span>${esc(c.label)}</span>`).join('')}</div>`;
  // newest guess on top so it's visible above the phone keyboard
  const body = rows.map((r, i) => ({ r, i })).reverse().map(({ r, i }) => {
    const isNew = animateLast && i === rows.length - 1;
    const correct = r.g.id === S.game.answerId;
    const tiles = r.cells.map((c, j) => {
      const arrow = c.arrow === 'up' ? '<span class="arrow" aria-label="higher">▲</span>' : c.arrow === 'down' ? '<span class="arrow" aria-label="lower">▼</span>' : '';
      return `<span class="tile ${c.status}${isNew ? ' flip' : ''}" style="--d:${j * 90}ms" title="${esc(c.title || '')}">
        <span class="tile-val">${esc(c.value)}</span>${arrow}</span>`;
    }).join('');
    return `<div class="guess${correct ? ' is-correct' : ''}">
      <div class="guess-name"><span>${i + 1}. ${esc(r.g.name)}</span>${isMixed(S.mode) ? `<span class="guess-sport">${SPORTS[r.g.sport]?.emoji || ''}</span>` : ''}</div>
      <div class="tiles" style="--cols:${cols.length}">${tiles}</div>
    </div>`;
  }).join('');
  el.innerHTML = `<h3 class="section-title">Your guesses</h3>${header}${body}`;
}

function submitGuess(athlete) {
  if (finished() || S.game.guesses.includes(athlete.id)) return;
  S.game.guesses.push(athlete.id);
  const won = athlete.id === S.game.answerId;
  if (won) S.game.status = 'won';
  else if (S.game.guesses.length >= GAME.maxGuesses) S.game.status = 'lost';

  if (finished() && !S.game.recorded) {
    recordResult(S.mode.id, S.puzzleNo, won, S.game.guesses.length);
    S.game.recorded = true;
    // Hook for future features (card collection, leaderboards).
    document.dispatchEvent(new CustomEvent('modidex:complete', {
      detail: { modeId: S.mode.id, puzzleNo: S.puzzleNo, athleteId: S.game.answerId, won, guesses: S.game.guesses.length },
    }));
  }
  saveGame(S.mode.id, S.game);

  const before = cluesFor(answer(), S.mode, wrongCount() - (won ? 0 : 1), false).filter((c) => c.unlocked).length;
  renderGuesses(true);
  renderClues();
  renderCardArea();
  if (finished()) {
    renderPlayArea();
    renderModes();
    setTimeout(() => $('#card-area').scrollIntoView({ behavior: 'smooth', block: 'start' }), 650);
  } else {
    renderPlayArea();
    const after = cluesFor(answer(), S.mode, wrongCount(), false).filter((c) => c.unlocked).length;
    if (after > before) toast('🔎 New clue unlocked!');
    $('#guess-input')?.focus({ preventScroll: true });
  }
}

// ---------- result ----------
function currentShareText() {
  const rows = guessRows().map((r) => r.cells);
  const cluesUsed = cluesFor(answer(), S.mode, wrongCount(), false).filter((c) => c.unlocked).length;
  const url = `${location.origin}${location.pathname}#${S.mode.id}`;
  return shareText({ mode: S.mode, puzzleNo: S.puzzleNo, won: S.game.status === 'won', rows, cluesUsed, url });
}

function renderResult(area) {
  const won = S.game.status === 'won';
  const a = answer();
  const n = S.game.guesses.length;
  const stats = loadStats(S.mode.id);
  const streak = displayStreak(stats, S.puzzleNo);
  const nextModes = MODES.filter((m) => m.id !== S.mode.id && modeStatus(m) === 'playing');
  const praise = ['Legendary!', 'Incredible!', 'Clutch!', 'Nice scouting!', 'Got it!', 'Phew!'][n - 1] || 'Got it!';
  area.innerHTML = `
    <div class="panel result ${won ? 'won' : 'lost'}">
      <h2>${won ? `${praise} Scouted in ${n}/${GAME.maxGuesses}` : 'It got away!'}</h2>
      <p>${won ? 'You named' : 'The mystery athlete was'} <b>${esc(a.name)}</b>${a.comp ? `, whose Gen 1 comp is <b>${esc(a.comp.name)}</b>` : ''}.</p>
      <div class="result-stats">
        <div><b>${stats.played}</b><span>Played</span></div>
        <div><b>${stats.played ? Math.round((stats.wins / stats.played) * 100) : 0}%</b><span>Win %</span></div>
        <div><b>${streak}</b><span>Streak</span></div>
        <div><b>${stats.maxStreak}</b><span>Best</span></div>
      </div>
      <pre class="share-preview" aria-label="Share preview">${esc(currentShareText())}</pre>
      <div class="btn-row">
        <button class="btn btn-primary" id="btn-share">Share result</button>
        <button class="btn" id="btn-copy">Copy</button>
      </div>
      <p class="next">Next ${esc(S.mode.label)} puzzle in <b id="countdown">${timeToMidnight()}</b></p>
      ${nextModes.length ? `<div class="next-modes"><span>Play another:</span>${nextModes.map((m) =>
        `<button class="chip" data-go="${m.id}">${m.emoji} ${esc(m.label)}</button>`).join('')}</div>` : '<p class="small">You finished every puzzle today. See you tomorrow!</p>'}
    </div>`;
  $('#btn-share').onclick = async () => {
    const r = await shareOrCopy(currentShareText());
    if (r === 'copied') toast('Result copied! Paste it anywhere.');
    else if (r === 'failed') toast('Could not copy. Long-press the preview to copy.');
  };
  $('#btn-copy').onclick = async () => toast((await copyText(currentShareText())) ? 'Copied!' : 'Could not copy.');
  area.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => selectMode(b.dataset.go, true)));
}

// ---------- dialogs ----------
function openDialog(dlg, html) {
  dlg.innerHTML = `<div class="dialog-inner"><button class="dialog-x" aria-label="Close" autofocus>✕</button>${html}<button class="btn dialog-close">Let's play</button></div>`;
  dlg.querySelectorAll('.dialog-close, .dialog-x').forEach((b) => (b.onclick = () => dlg.close()));
  dlg.onclick = (e) => { if (e.target === dlg) dlg.close(); };
  dlg.showModal();
  dlg.scrollTop = 0;
}

function openHelp() {
  const typeList = Object.entries(TYPES).map(([name, t]) =>
    `<li><span class="type-badge" style="--type:${t.color}">${t.emoji} ${esc(name)}</span><span>${esc(t.fits)}</span></li>`).join('');
  const sports = ENABLED_SPORTS.map((k) => SPORTS[k]);
  const statRows = STATS.map((s) => `<tr><th>${s.label}</th>${sports.map((sp) => `<td>${esc(sp.statHints[s.key])}</td>`).join('')}</tr>`).join('');
  openDialog($('#dlg-help'), `
    <h2 id="help-title">How to play ModiDex</h2>
    <p>Each day there's a mystery athlete for <b>${ENABLED_SPORTS.join(', ')}</b>, plus an <b>All Sports</b> puzzle. You get a creature-style scouting card: type, base stats and a field-guide bio. Name the athlete in <b>${GAME.maxGuesses} guesses</b>.</p>
    <h3>Reading your guesses</h3>
    <ul class="legend">
      <li><span class="tile hit mini">✓</span> Exact match</li>
      <li><span class="tile close mini">~</span> Close: same division (team), same position group, age within ${CLOSE.age}, number within ${CLOSE.number}, or shares one type</li>
      <li><span class="tile miss mini">✗</span> No match</li>
      <li><b class="nowrap">▲ ▼</b>&nbsp; The answer's age or jersey number is higher / lower</li>
    </ul>
    ${CLUE_SCHEDULE.length ? `<h3>Bonus clues</h3>
    <p>A new clue unlocks after ${CLUE_SCHEDULE.map((c) => c.after).join(', ').replace(/, (\d+)$/, ' and $1')} misses: where they play, then their team, then their initials.</p>` : ''}
    <p>After the puzzle ends you'll see the athlete's <b>Gen 1 comp</b>: the original-151 creature they play like.</p>
    <h3>Types</h3>
    <ul class="type-list">${typeList}</ul>
    <h3>What the stats mean</h3>
    <div class="table-wrap"><table class="stat-table"><thead><tr><th></th>${sports.map((sp) => `<th>${sp.emoji} ${sp.label}</th>`).join('')}</tr></thead><tbody>${statRows}</tbody></table></div>
    <p class="small">Stats are 1–150 ratings based on real performance. New puzzles drop at midnight your time. Watch more on <a href="${GAME.channelUrl}" target="_blank" rel="noopener">${esc(GAME.channel)}</a>.</p>`);
}

function openStats(modeId) {
  const mode = MODES.find((m) => m.id === modeId) || MODES[0];
  const s = loadStats(mode.id);
  const max = Math.max(1, ...s.distribution);
  const tabs = MODES.map((m) => `<button class="chip${m.id === mode.id ? ' is-active' : ''}" data-stats="${m.id}">${m.emoji} ${esc(m.short)}</button>`).join('');
  const bars = s.distribution.map((v, i) =>
    `<div class="dist-row"><span>${i + 1}</span><span class="dist-bar" style="width:${Math.max(8, (v / max) * 100)}%">${v}</span></div>`).join('');
  openDialog($('#dlg-stats'), `
    <h2 id="stats-title">Your stats</h2>
    <div class="chip-row">${tabs}</div>
    <div class="result-stats">
      <div><b>${s.played}</b><span>Played</span></div>
      <div><b>${s.played ? Math.round((s.wins / s.played) * 100) : 0}%</b><span>Win %</span></div>
      <div><b>${displayStreak(s, S.puzzleNo)}</b><span>Streak</span></div>
      <div><b>${s.maxStreak}</b><span>Best</span></div>
    </div>
    <h3>Guess distribution</h3>
    <div class="dist">${bars}</div>
    <p class="small">Stats are saved in this browser only.</p>`);
  $('#dlg-stats').querySelectorAll('[data-stats]').forEach((b) => (b.onclick = () => openStats(b.dataset.stats)));
}

// ---------- toast ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

init();
