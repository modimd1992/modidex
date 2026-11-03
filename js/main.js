// App entry point: wires data, daily answers, storage and the screen together.
import { GAME, MODES, SPORTS, STATS, CLUE_SCHEDULE, CLOSE, ENABLED_SPORTS, CATCH } from './config.js';
import { TYPES, typeInfo } from './types.js';
import { loadData } from './data.js';
import { dateKey, puzzleNumber, answersForDate, poolForMode, secondsUntilNextDay } from './daily.js';
import { compareGuess, columnsFor } from './compare.js';
import { cluesFor } from './clues.js';
import { loadGame, saveGame, loadStats, recordResult, displayStreak, loadPref, savePref, loadDex } from './storage.js';
import { shareText, combinedShareText, shareOrCopy, copyText } from './share.js';
import { renderCard, esc } from './card.js';
import { attachAutocomplete } from './autocomplete.js';
import { resolveCatch, tierForGuess, ballById } from './catch.js';
import { GEN1, pad3 as dex3 } from './gen1.js';
import { cloudEnabled, initCloud, onCloudChange, currentUser, cloudStatus, pushProgress, signInWithGoogle, emailSignInLink, signOut, deleteProfile } from './cloud.js';

const $ = (sel, root = document) => root.querySelector(sel);

const S = {
  data: null,
  key: null,
  puzzleNo: 0,
  answers: {},
  mode: MODES[0],
  game: null,
  ac: null,
  compareId: null, // which guess the stat bars compare against
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
  $('#btn-dex').addEventListener('click', () => openDex());
  if (cloudEnabled()) {
    $('#btn-profile').hidden = false;
    $('#btn-profile').addEventListener('click', openProfile);
    onCloudChange((why) => {
      renderProfileButton();
      if ($('#dlg-profile').open) openProfile();
      if (why === 'synced') { renderModes(); renderMode(); }
    });
    initCloud();
  }
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
  const s = secondsUntilNextDay();
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
  S.compareId = null;
  S.justFinished = false;
  if (finished() && !S.game.catch) {
    resolveCatch(S.game, a, S.key);
    saveGame(S.mode.id, S.game);
  }
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
    showComp: true,
    compareWith: done ? null : compareTarget(),
    dexStatus: dexStatusFor(a),
  });
}

function dexStatusFor(a) {
  if (!a.comp) return null;
  const dex = loadDex();
  return dex.caught[a.comp.dex] ? 'caught' : dex.seen[a.comp.dex] ? 'seen' : 'new';
}

// The guess the stat bars compare against: the one the player tapped, else the latest.
function compareTarget() {
  const ids = S.game.guesses;
  if (!ids.length) return null;
  const id = ids.includes(S.compareId) ? S.compareId : ids[ids.length - 1];
  return S.data.byId.get(id) || null;
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
      <div class="guess-count"><span>Guess ${Math.min(used + 1, GAME.maxGuesses)} of ${GAME.maxGuesses}</span><span class="dots">${dots}</span></div>
      ${nextThrowHtml(used + 1)}`;
    const input = $('#guess-input');
    // On phones, lift the box to the top so suggestions aren't hidden by the keyboard.
    input.addEventListener('focus', () => {
      if (matchMedia('(max-width: 700px)').matches) setTimeout(() => $('#guess-form')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 250);
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

function nextThrowHtml(n) {
  const t = tierForGuess(n);
  return t
    ? `<p class="next-throw">Solve now to throw a <b>${t.icon} ${esc(t.name)}</b> · ${Math.round(t.rate * 100)}% catch</p>`
    : `<p class="next-throw">Last guess: no ball left. Solving registers it as <b>👁 Seen</b>.</p>`;
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
    el.innerHTML = `<p class="hint">Start typing a name. Each guess shows how close you are, and the card's stat bars compare against it.</p>${legendHtml()}`;
    return;
  }
  const header = `<div class="tiles tiles-head" style="--cols:${cols.length}">${cols.map((c) => `<span>${esc(c.label)}</span>`).join('')}</div>`;
  // newest guess on top so it's visible above the phone keyboard
  const body = rows.map((r, i) => ({ r, i })).reverse().map(({ r, i }) => {
    const isNew = animateLast && i === rows.length - 1;
    const correct = r.g.id === S.game.answerId;
    const cmp = compareTarget();
    const compared = !finished() && cmp && cmp.id === r.g.id;
    const tiles = r.cells.map((c, j) => {
      const arrow = c.arrow === 'up' ? '<span class="arrow" aria-label="higher">▲</span>' : c.arrow === 'down' ? '<span class="arrow" aria-label="lower">▼</span>' : '';
      const typeAttrs = c.types ? ` data-types="${esc(c.types.join(','))}" data-status="${c.status}" role="button" tabindex="0" aria-label="${esc(c.title)}: what it means"` : '';
      return `<span class="tile ${c.status}${isNew ? ' flip' : ''}${c.types ? ' tappable' : ''}" style="--d:${j * 90}ms" title="${esc(c.title || '')}"${typeAttrs}>
        <span class="tile-val">${esc(c.value)}</span>${arrow}</span>`;
    }).join('');
    return `<div class="guess${correct ? ' is-correct' : ''}${compared ? ' is-compared' : ''}" data-guess-id="${esc(r.g.id)}">
      <div class="guess-name"><span>${i + 1}. ${esc(r.g.name)}</span><span class="guess-meta">${compared ? '<span class="cmp-tag">📊 on card</span>' : ''}${isMixed(S.mode) ? `<span class="guess-sport">${SPORTS[r.g.sport]?.emoji || ''}</span>` : ''}</span></div>
      <div class="tiles" style="--cols:${cols.length}">${tiles}</div>
    </div>`;
  }).join('');
  el.innerHTML = `<h3 class="section-title">Your guesses</h3>${legendHtml()}${header}${body}`;
}

function legendHtml() {
  return `<div class="key-line" aria-label="Color key">
    <span><i class="sw hit"></i>match</span><span><i class="sw close"></i>close</span><span><i class="sw miss"></i>miss</span><span>▲▼ answer higher / lower</span>
  </div>`;
}

function submitGuess(athlete) {
  if (finished() || S.game.guesses.includes(athlete.id)) return;
  S.game.guesses.push(athlete.id);
  S.compareId = athlete.id;
  const won = athlete.id === S.game.answerId;
  if (won) S.game.status = 'won';
  else if (S.game.guesses.length >= GAME.maxGuesses) S.game.status = 'lost';

  if (finished() && !S.game.recorded) {
    recordResult(S.mode.id, S.puzzleNo, won, S.game.guesses.length);
    S.game.recorded = true;
    const caught = resolveCatch(S.game, answer(), S.key);
    S.justFinished = true;
    setTimeout(pushProgress, 0); // after the save below; syncs to the profile if signed in
    // Hook for future features (card collection, leaderboards).
    document.dispatchEvent(new CustomEvent('modidex:complete', {
      detail: { modeId: S.mode.id, puzzleNo: S.puzzleNo, athleteId: S.game.answerId, won, guesses: S.game.guesses.length, catch: caught },
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
function catchShareLine(c) {
  if (!c) return '';
  const ball = ballById(c.ball);
  if (c.outcome === 'caught') return `🎯 Caught with a ${ball?.icon || ''} ${ball?.name || 'ball'}!`;
  if (c.outcome === 'escaped') return `💨 It broke free from my ${ball?.icon || ''} ${ball?.name || 'ball'}`;
  if (c.outcome === 'seen') return '👁 Registered as Seen';
  return '💨 It fled';
}

function currentShareText() {
  const rows = guessRows().map((r) => r.cells);
  const cluesUsed = cluesFor(answer(), S.mode, wrongCount(), false).filter((c) => c.unlocked).length;
  const url = `${location.origin}${location.pathname}#${S.mode.id}`;
  return shareText({ mode: S.mode, puzzleNo: S.puzzleNo, won: S.game.status === 'won', rows, cluesUsed, url, catchLine: catchShareLine(S.game.catch) });
}

// Every mode's result today, for the combined share.
function todayEntries() {
  return MODES.map((m) => {
    const ans = S.answers[m.id];
    if (!ans) return { mode: m, status: 'none', rows: [] };
    const g = loadGame(m.id, S.key, ans.id);
    const rows = g.guesses.map((id) => S.data.byId.get(id)).filter(Boolean)
      .map((x) => ({ correct: x.id === ans.id, cells: compareGuess(x, ans, S.key, m) }));
    return { mode: m, status: g.guesses.length ? g.status : 'none', rows, caught: g.catch?.outcome === 'caught' };
  });
}

function finishedToday() {
  return MODES.filter((m) => ['won', 'lost'].includes(modeStatus(m))).length;
}

function combinedText() {
  return combinedShareText({ puzzleNo: S.puzzleNo, entries: todayEntries(), url: `${location.origin}${location.pathname}` });
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
      ${catchHtml(S.game.catch, S.justFinished)}
      <h2>${won ? `${praise} Scouted in ${n}/${GAME.maxGuesses}` : 'Out of guesses!'}</h2>
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
      ${finishedToday() >= 2 ? `<div class="combined">
        <h3 class="section-title">All of today's puzzles</h3>
        <pre class="share-preview" aria-label="Combined share preview">${esc(combinedText())}</pre>
        <div class="btn-row">
          <button class="btn btn-primary" id="btn-share-all">Share all</button>
          <button class="btn" id="btn-copy-all">Copy</button>
        </div>
      </div>` : ''}
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
  if ($('#btn-share-all')) {
    $('#btn-share-all').onclick = async () => {
      const r = await shareOrCopy(combinedText());
      if (r === 'copied') toast('All results copied! Paste it anywhere.');
      else if (r === 'failed') toast('Could not copy. Long-press the preview to copy.');
    };
    $('#btn-copy-all').onclick = async () => toast((await copyText(combinedText())) ? 'Copied!' : 'Could not copy.');
  }
  area.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => selectMode(b.dataset.go, true)));
}

// ---------- catching ----------
function catchHtml(c, animate) {
  if (!c) return '';
  const who = `<b>#${dex3(c.dex)} ${esc(c.name)}</b>`;
  const ball = ballById(c.ball);
  let icon, msg, cls;
  if (c.outcome === 'caught') {
    icon = ball?.icon || '🎯'; cls = 'caught';
    msg = c.newCatch ? `Caught! ${who} was added to your Dex.` : `Caught again! ${who} is already in your Dex.`;
  } else if (c.outcome === 'escaped') {
    icon = ball?.icon || '💨'; cls = 'escaped';
    msg = c.alreadyCaught ? `${who} broke free, but it's already in your Dex.` : `Argh! ${who} broke free. Registered as 👁 Seen.`;
  } else if (c.outcome === 'seen') {
    icon = '👁'; cls = 'seen';
    msg = `No ball left on the last guess. ${who} was registered as Seen.`;
  } else {
    icon = '💨'; cls = 'fled';
    msg = `${who} fled before you could identify it.`;
  }
  const throwLine = ball ? `<span class="catch-throw">You threw a ${ball.icon} ${esc(ball.name)} (${Math.round(ball.rate * 100)}%)</span>` : '';
  const dex = loadDex();
  const caughtN = Object.keys(dex.caught).length;
  const seenN = Object.keys(dex.seen).length;
  return `<div class="catch ${cls}${animate && ball ? ' animate' : ''}">
    ${throwLine}
    <span class="catch-ball" aria-hidden="true">${icon}</span>
    <p class="catch-msg">${msg}</p>
    <button class="catch-dex" type="button" data-open-dex>📕 Dex: <b>${caughtN}</b> caught · ${seenN} seen of ${CATCH.total}</button>
  </div>`;
}

function openDex(filter = 'all') {
  const dex = loadDex();
  const caughtN = Object.keys(dex.caught).length;
  const seenN = Object.keys(dex.seen).length;
  const cells = GEN1.map((name, i) => {
    const n = i + 1;
    const c = dex.caught[n];
    const s = dex.seen[n];
    const state = c ? 'caught' : s ? 'seen' : 'unknown';
    if (filter === 'caught' && !c) return '';
    if (filter === 'missing' && c) return '';
    const via = c || s ? S.data.byId.get((c || s).athleteId)?.name : '';
    const ball = c ? ballById(c.ball) : null;
    return `<li class="dex-cell ${state}" title="${esc(via ? `${state === 'caught' ? 'Caught' : 'Seen'} via ${via}` : '')}">
      <span class="dex-no">#${dex3(n)}${ball ? ` ${ball.icon}` : state === 'seen' ? ' 👁' : ''}</span>
      <span class="dex-name">${state === 'unknown' ? '???' : esc(name)}</span>
      ${via ? `<span class="dex-via">${esc(via)}</span>` : ''}
    </li>`;
  }).join('');
  const pct = Math.round((caughtN / CATCH.total) * 100);
  openDialog($('#dlg-dex'), `
    <h2 id="dex-title">Your Dex</h2>
    <p><b>${caughtN}</b> caught · ${seenN} seen · ${CATCH.total} total</p>
    <div class="dex-bar" aria-label="${pct}% caught"><span style="width:${pct}%"></span></div>
    <div class="chip-row">
      ${[['all', 'All'], ['caught', 'Caught'], ['missing', 'Missing']].map(([id, label]) =>
        `<button class="chip${filter === id ? ' is-active' : ''}" data-dex-filter="${id}">${label}</button>`).join('')}
    </div>
    <ul class="dex-grid">${cells || '<li class="small">Nothing here yet. Solve a puzzle to start catching!</li>'}</ul>
    <p class="small">Solve faster for a better ball: ${CATCH.tiers.map((t) => `${t.icon} ${t.name} ${Math.round(t.rate * 100)}%`).join(' · ')}. Your Dex is saved in this browser.</p>`);
  $('#dlg-dex').querySelectorAll('[data-dex-filter]').forEach((b) => (b.onclick = () => openDex(b.dataset.dexFilter)));
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-open-dex]')) openDex();
});

// ---------- profile ----------
function renderProfileButton() {
  const b = $('#btn-profile');
  const u = currentUser();
  b.textContent = u ? (u.displayName || u.email || '?').trim()[0].toUpperCase() : '👤';
  b.classList.toggle('signed-in', !!u);
  b.setAttribute('aria-label', u ? 'Your profile' : 'Sign in');
}

function openProfile() {
  const u = currentUser();
  const st = cloudStatus();
  const dex = loadDex();
  const caughtN = Object.keys(dex.caught).length;
  let body;
  if (st === 'loading') {
    body = '<p>Connecting…</p>';
  } else if (st === 'error') {
    body = '<p>Profiles are unavailable right now. Your progress is still saved on this device.</p>';
  } else if (u) {
    body = `
      <p>Signed in as <b>${esc(u.displayName || u.email || 'Trainer')}</b>${u.email && u.displayName ? `<br><span class="small">${esc(u.email)}</span>` : ''}</p>
      <p>✅ Your Dex (<b>${caughtN}</b> caught), stats and today's games are saved to your profile and sync on any device where you sign in.</p>
      <div class="btn-row"><button class="btn" id="btn-signout">Sign out</button></div>
      <p class="small"><button class="link-btn" id="btn-delete-profile">Delete my profile</button> removes your saved data from our server. Progress on this device stays.</p>`;
  } else {
    body = `
      <p>Sign in to save your Dex (<b>${caughtN}</b> caught so far) and stats to a profile. They'll sync on every device you use and survive clearing your browser. What you've caught on this device is kept and added to your profile.</p>
      <button class="btn btn-primary btn-block" id="btn-google">Continue with Google</button>
      <p class="or">or get a sign-in link by email</p>
      <form class="email-form" id="email-form">
        <input type="email" id="email-input" placeholder="you@example.com" required autocomplete="email" inputmode="email">
        <button class="btn" type="submit">Email me a link</button>
      </form>
      <p class="small">We only store your sign-in email and your game progress. No passwords, no ads.</p>`;
  }
  openDialog($('#dlg-profile'), `<h2 id="profile-title">Profile</h2>${body}`);
  const dlg = $('#dlg-profile');
  dlg.querySelector('#btn-google')?.addEventListener('click', async () => {
    try { await signInWithGoogle(); } catch (e) { if (e?.code !== 'auth/popup-closed-by-user') toast('Sign-in didn\'t work. Try the email link.'); }
  });
  dlg.querySelector('#email-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = dlg.querySelector('#email-input').value.trim();
    try { await emailSignInLink(email); toast('Check your email for the sign-in link.'); dlg.close(); }
    catch { toast('Could not send the email. Check the address.'); }
  });
  dlg.querySelector('#btn-signout')?.addEventListener('click', async () => { await signOut(); toast('Signed out. Progress stays on this device.'); });
  dlg.querySelector('#btn-delete-profile')?.addEventListener('click', async () => {
    if (!confirm('Delete your profile and its saved data? Progress on this device stays.')) return;
    try { await deleteProfile(); toast('Profile deleted.'); dlg.close(); }
    catch { toast('For security, sign out and back in, then try again.'); }
  });
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
    <p>Each day there's a mystery athlete for <b>${ENABLED_SPORTS.join(', ')}</b>, plus an <b>All Sports</b> puzzle. The scouting card tells you which <b>original-151 creature they play like</b>, plus their type, base stats and a field-guide bio. Name the athlete in <b>${GAME.maxGuesses} guesses</b>.</p>
    <h3>Reading your guesses</h3>
    <ul class="legend">
      <li><span class="tile hit mini">✓</span> Exact match</li>
      <li><span class="tile close mini">~</span> Close: same division (team), same position group, age within ${CLOSE.age}, number within ${CLOSE.number}, or shares one type</li>
      <li><span class="tile miss mini">✗</span> No match</li>
      <li>👆&nbsp; Tap any type to see what it means</li>
      <li><b class="nowrap">▲ ▼</b>&nbsp; The answer's age or jersey number is higher / lower</li>
    </ul>
    ${CLUE_SCHEDULE.length ? `<h3>Bonus clues</h3>
    <p>A new clue unlocks after ${CLUE_SCHEDULE.map((c) => c.after).join(', ').replace(/, (\d+)$/, ' and $1')} misses: where they play, then their team, then their initials.</p>` : ''}
    <h3>Catching</h3>
    <p>Each puzzle is a wild encounter with the creature on the card. Solve it to throw a ball. The faster you solve, the better the ball:</p>
    <ul class="legend">${CATCH.tiers.map((t) => `<li>${t.icon}&nbsp; <b>${esc(t.name)}</b>&nbsp;· guess ${t.guesses.join(' or ')} · ${Math.round(t.rate * 100)}% catch</li>`).join('')}
      <li>👁&nbsp; Guess 6 · registered as Seen</li></ul>
    <p>If it breaks free it's still registered as Seen. If you run out of guesses, it flees. Collect all ${CATCH.total} in your 📕 Dex!</p>
    <h3>Comparing stats</h3>
    <p>After each guess, the card's stat bars show a marker for your guess, and ▲ / ▼ tells you if the mystery athlete is higher or lower in each stat. Tap any earlier guess to compare against it instead.</p>
    <p>When the puzzle ends you'll also see <b>why</b> they play like that creature.</p>
    <h3>Types</h3>
    <ul class="type-list">${typeList}</ul>
    <h3>What the stats mean</h3>
    <div class="table-wrap"><table class="stat-table"><thead><tr><th></th>${sports.map((sp) => `<th>${sp.emoji} ${sp.label}</th>`).join('')}</tr></thead><tbody>${statRows}</tbody></table></div>
    <p class="small">Stats are 1–150 ratings based on real performance. New puzzles drop every day at midnight Eastern Time. Watch more on <a href="${GAME.channelUrl}" target="_blank" rel="noopener">${esc(GAME.channel)}</a>.</p>`);
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

// ---------- type info popup (tap a type tile or badge) ----------
function closeTypePop() {
  document.querySelector('.type-pop')?.remove();
}

function openTypePop(el) {
  closeTypePop();
  const names = el.dataset.types.split(',').filter(Boolean);
  const verdict = {
    hit: 'Same main type as the mystery athlete.',
    close: 'Shares one type with the mystery athlete.',
    miss: 'No types in common with the mystery athlete.',
  }[el.dataset.status] || '';
  const pop = document.createElement('div');
  pop.className = 'type-pop';
  pop.setAttribute('role', 'dialog');
  pop.innerHTML = names.map((n) => {
    const t = typeInfo(n);
    return `<div class="type-pop-row"><span class="type-badge" style="--type:${t.color}">${t.emoji} ${esc(n)}</span><span>${esc(t.fits)}</span></div>`;
  }).join('') + (verdict ? `<p class="type-pop-verdict ${el.dataset.status}">${verdict}</p>` : '');
  document.body.appendChild(pop);
  // place under the tapped element, kept inside the screen
  const r = el.getBoundingClientRect();
  const w = pop.offsetWidth;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  let top = r.bottom + 8;
  if (top + pop.offsetHeight > innerHeight - 8) top = Math.max(8, r.top - pop.offsetHeight - 8);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}

document.addEventListener('click', (e) => {
  const row = e.target.closest('[data-guess-id]');
  if (row && !e.target.closest('[data-types]') && S.game && !finished()) {
    S.compareId = row.dataset.guessId;
    renderCardArea();
    renderGuesses(false);
    $('#card-area .stats')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const el = e.target.closest('[data-types]');
  if (el && !e.target.closest('.type-pop')) openTypePop(el);
  else if (!e.target.closest('.type-pop')) closeTypePop();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeTypePop();
  const el = e.target.closest?.('[data-types]');
  if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openTypePop(el); }
});
window.addEventListener('scroll', closeTypePop, { passive: true });

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
