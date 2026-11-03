// App entry point: wires data, daily answers, storage and the screen together.
import { GAME, MODES, SPORTS, STATS, CLUE_SCHEDULE, CLOSE, ENABLED_SPORTS, CATCH } from './config.js';
import { TYPES, typeInfo } from './types.js';
import { loadData } from './data.js';
import { dateKey, puzzleNumber, answersForDate, poolForMode, secondsUntilNextDay } from './daily.js';
import { compareGuess, columnsFor } from './compare.js';
import { cluesFor } from './clues.js';
import { loadGame, saveGame, loadStats, recordResult, displayStreak, loadPref, savePref, loadDex, saveDex, sportDex, dexCounts, loadHistory, recordHistory } from './storage.js';
import { pointsFor, weekTotals, weekStart, allTimeTotals } from './leaderboard.js';
import { shareText, combinedShareText, shareOrCopy, copyText, guessSquares } from './share.js';
import { renderCard, esc } from './card.js';
import { attachAutocomplete } from './autocomplete.js';
import { resolveCatch, tierForGuess, ballById, isShiny, isLegendary, catchRate, lineProgress } from './catch.js';
import { GEN1, FAMILIES, pad3 as dex3 } from './gen1.js';
import { cloudEnabled, initCloud, onCloudChange, currentUser, cloudStatus, pushProgress, signInWithGoogle, emailSignInLink, signOut, deleteProfile } from './cloud.js';
import {
  setSummaryBuilder, loadMyProfile, myHandle, forgetProfile, claimHandle, sendFriendRequest, incomingRequests,
  answerRequest, listFriends, removeFriend, createGroup, joinGroup, leaveGroup, listGroups, groupMembers, HANDLE_RE,
} from './social.js';

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
  const link = location.hash.match(/^#(add|join)=([A-Za-z0-9_]+)/);
  if (link) {
    pendingLink = { kind: link[1], value: link[2] };
    history.replaceState(null, '', location.pathname);
  }
  const fromHash = MODES.find((m) => m.id === location.hash.slice(1));
  const fromPref = MODES.find((m) => m.id === loadPref('mode', null));
  S.mode = fromHash || fromPref || MODES[0];

  $('#btn-help').addEventListener('click', openHelp);
  $('#btn-stats').addEventListener('click', () => openStats(S.mode.id));
  $('#btn-dex').addEventListener('click', () => openDex());
  if (cloudEnabled()) {
    $('#btn-profile').hidden = false;
    $('#btn-profile').addEventListener('click', openProfile);
    setSummaryBuilder(publicSummary);
    onCloudChange(async (why) => {
      if (why === 'auth') {
        if (currentUser()) { try { await loadMyProfile(true); } catch { /* rules not published yet */ } } else forgetProfile();
      }
      renderProfileButton();
      if ($('#dlg-profile').open) openProfile();
      if (why === 'synced') { backfillHistory(); renderModes(); renderMode(); }
      if (why === 'auth' || why === 'synced') handlePendingLink();
    });
    initCloud();
    if (pendingLink) toast(pendingLink.kind === 'add' ? 'Opening friend invite…' : 'Opening group invite…');
  }
  window.addEventListener('hashchange', () => {
    const m = MODES.find((x) => x.id === location.hash.slice(1));
    if (m && m.id !== S.mode.id) selectMode(m.id, false);
  });
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick());

  backfillHistory();
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

// New day while the tab is open: reload the page, so the new puzzles also get
// the latest version of the game and its data.
function tick() {
  if (!S.data) return;
  if (dateKey() !== S.key) {
    S.key = dateKey(); // only reload once
    location.reload();
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
    const r = rareFor(m);
    const rareMark = st === 'playing' && (r.legendary || r.shiny) ? `<span class="mark rare" title="Rare encounter">${r.legendary ? '👑' : '✨'}</span>` : '';
    const mark = st === 'won' ? '<span class="mark won">✓</span>' : st === 'lost' ? '<span class="mark lost">✗</span>' : rareMark;
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
    resolveCatch(S.game, a, S.key, rareFor(S.mode));
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
    rare: rareFor(S.mode),
  });
}

function dexStatusFor(a) {
  if (!a.comp) return null;
  const sd = sportDex(loadDex(), a.sport);
  return sd.caught[a.comp.dex] ? 'caught' : sd.seen[a.comp.dex] ? 'seen' : 'new';
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

// Is today's puzzle in this mode a shiny and/or legendary encounter?
function rareFor(mode) {
  const a = S.answers[mode.id];
  return { shiny: !!a && isShiny(mode.id, S.key), legendary: isLegendary(a) };
}

function nextThrowHtml(n) {
  const t = tierForGuess(n);
  const { legendary } = rareFor(S.mode);
  return t
    ? `<p class="next-throw">Solve now to throw a <b>${t.icon} ${esc(t.name)}</b> · ${Math.round(catchRate(t, legendary) * 100)}% catch${legendary && t.rate !== catchRate(t, true) ? ' <span class="legend-note">(legendary)</span>' : ''}</p>`
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
    recordHistory(S.key, S.mode.id, S.game.status, S.game.guesses.length);
    S.game.recorded = true;
    const caught = resolveCatch(S.game, answer(), S.key, rareFor(S.mode));
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
  const rare = [c.legendary ? '👑 Legendary encounter!' : '', c.shiny ? '✨ Shiny encounter!' : ''].filter(Boolean).join(' ');
  const base = catchShareBase(c);
  return rare ? `${rare}\n${base}` : base;
}

function catchShareBase(c) {
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
    return { mode: m, status: g.guesses.length ? g.status : 'none', rows, caught: g.catch?.outcome === 'caught', shiny: g.catch?.outcome === 'caught' && !!g.catch?.shiny };
  });
}

// Make sure today's finished games are in the daily history, and that every
// creature today's games caught or saw is in the Dex (repairs saves from old tabs).
function backfillHistory() {
  for (const e of todayEntries()) {
    if (e.status === 'won' || e.status === 'lost') recordHistory(S.key, e.mode.id, e.status, e.rows.length);
  }
  const all = loadDex();
  let changed = false;
  for (const m of MODES) {
    const ans = S.answers[m.id];
    if (!ans) continue;
    const c = loadGame(m.id, S.key, ans.id).catch;
    if (!c?.dex || c.outcome === 'fled') continue;
    const sd = sportDex(all, c.sport || ans.sport);
    const entry = { date: S.key, athleteId: ans.id };
    if (!sd.seen[c.dex]) { sd.seen[c.dex] = entry; changed = true; }
    if (c.outcome === 'caught' && !sd.caught[c.dex]) { sd.caught[c.dex] = { ...entry, ball: c.ball }; changed = true; }
    if (c.outcome === 'caught' && c.shiny && !sd.shiny[c.dex]) { sd.shiny[c.dex] = entry; changed = true; }
  }
  if (changed) {
    saveDex(all);
    setTimeout(pushProgress, 0);
  }
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
    const kind = c.shiny ? '✨ Shiny ' : c.legendary ? '👑 Legendary ' : '';
    const yourDex = `your ${esc(c.sport || '')} Dex`;
    msg = c.newCatch ? `${kind ? `${kind}catch! ` : 'Caught! '}${who} was added to ${yourDex}.`
      : c.newShiny ? `✨ Shiny catch! ${who} now sparkles in ${yourDex}.`
      : `Caught again! ${who} is already in ${yourDex}.`;
    if (c.line && c.line.caught === c.line.total) msg += `<br><span class="line-done">🏅 Evolution line complete: the ${esc(GEN1[c.line.first - 1])} line!</span>`;
    else if (c.line) msg += `<br><span class="small">${esc(GEN1[c.line.first - 1])} line: ${c.line.caught}/${c.line.total} caught</span>`;
  } else if (c.outcome === 'escaped') {
    icon = ball?.icon || '💨'; cls = 'escaped';
    msg = c.alreadyCaught ? `${who} broke free, but it's already in your ${esc(c.sport || '')} Dex.` : `Argh! ${who} broke free. Registered as 👁 Seen.`;
  } else if (c.outcome === 'seen') {
    icon = '👁'; cls = 'seen';
    msg = `No ball left on the last guess. ${who} was registered as Seen.`;
  } else {
    icon = '💨'; cls = 'fled';
    msg = `${who} fled before you could identify it.`;
  }
  const rateNow = ball ? catchRate(ball, c.legendary) : 0;
  const rareTag = c.legendary ? '<span class="rare-tag legendary">👑 Legendary encounter</span>' : '';
  const shinyTag = c.shiny ? '<span class="rare-tag shiny">✨ Shiny encounter</span>' : '';
  const throwLine = `${rareTag}${shinyTag}${ball ? `<span class="catch-throw">You threw a ${ball.icon} ${esc(ball.name)} (${Math.round(rateNow * 100)}%)</span>` : ''}`;
  const sport = c.sport || answer()?.sport;
  const cnt = dexCounts(sportDex(loadDex(), sport));
  return `<div class="catch ${cls}${c.shiny ? ' is-shiny' : ''}${c.legendary ? ' is-legendary' : ''}${animate && ball ? ' animate' : ''}">
    ${throwLine}
    <span class="catch-ball" aria-hidden="true">${icon}</span>
    <p class="catch-msg">${msg}</p>
    <button class="catch-dex" type="button" data-open-dex="${esc(sport)}">📕 ${esc(sport)} Dex: <b>${cnt.caught}</b> caught · ${cnt.seen} seen of ${CATCH.total}</button>
  </div>`;
}

let dexSport = null;
function openDex(filter = 'all', sport = dexSport) {
  if (!sport || !ENABLED_SPORTS.includes(sport)) sport = S.mode.sports?.length === 1 ? S.mode.sports[0] : ENABLED_SPORTS[0];
  dexSport = sport;
  const all = loadDex();
  const dex = sportDex(all, sport);
  const caughtN = Object.keys(dex.caught).length;
  const seenN = Object.keys(dex.seen).length;
  const shinyN = Object.keys(dex.shiny).length;
  const linesDone = FAMILIES.filter((f) => f.every((n) => dex.caught[n])).length;
  const sportTabs = ENABLED_SPORTS.map((sp) => {
    const n = dexCounts(all.sports[sp]).caught;
    return `<button class="chip sport-chip${sp === sport ? ' is-active' : ''}" data-dex-sport="${sp}">${SPORTS[sp].emoji} ${sp} <b>${n}</b></button>`;
  }).join('');
  const cells = GEN1.map((name, i) => {
    const n = i + 1;
    const c = dex.caught[n];
    const s = dex.seen[n];
    const state = c ? 'caught' : s ? 'seen' : 'unknown';
    if (filter === 'caught' && !c) return '';
    if (filter === 'missing' && c) return '';
    if (filter === 'shiny' && !dex.shiny[n]) return '';
    const via = c || s ? S.data.byId.get((c || s).athleteId)?.name : '';
    const ball = c ? ballById(c.ball) : null;
    const shinyMark = dex.shiny[n] ? ' ✨' : '';
    return `<li class="dex-cell ${state}${dex.shiny[n] ? ' shiny' : ''}${CATCH.legendary.includes(n) ? ' legendary' : ''}" title="${esc(via ? `${state === 'caught' ? 'Caught' : 'Seen'} via ${via}` : '')}">
      <span class="dex-no">#${dex3(n)}${ball ? ` ${ball.icon}` : state === 'seen' ? ' 👁' : ''}${shinyMark}</span>
      <span class="dex-name">${state === 'unknown' ? '???' : esc(name)}</span>
      ${via ? `<span class="dex-via">${esc(via)}</span>` : ''}
    </li>`;
  }).join('');
  const pct = Math.round((caughtN / CATCH.total) * 100);
  openDialog($('#dlg-dex'), `
    <h2 id="dex-title">Your ${SPORTS[sport].emoji} ${sport} Dex</h2>
    <div class="chip-row">${sportTabs}</div>
    <p><b>${caughtN}</b> caught · ${seenN} seen · ${CATCH.total} total<br><span class="small">✨ ${shinyN} shiny · 🏅 ${linesDone}/${FAMILIES.length} evolution lines complete</span></p>
    <div class="dex-bar" aria-label="${pct}% caught"><span style="width:${pct}%"></span></div>
    <div class="chip-row">
      ${[['all', 'All'], ['caught', 'Caught'], ['missing', 'Missing'], ['shiny', '✨ Shiny'], ['lines', '🏅 Lines']].map(([id, label]) =>
        `<button class="chip${filter === id ? ' is-active' : ''}" data-dex-filter="${id}">${label}</button>`).join('')}
    </div>
    ${filter === 'lines' ? linesHtml(dex) : `<ul class="dex-grid">${cells || '<li class="small">Nothing here yet. Solve a puzzle to start catching!</li>'}</ul>`}
    <p class="small">Each sport has its own Dex of ${CATCH.total}. Catches from All Sports go to that athlete's sport. Solve faster for a better ball: ${CATCH.tiers.map((t) => `${t.icon} ${t.name} ${Math.round(t.rate * 100)}%`).join(' · ')}.</p>`);
  $('#dlg-dex').querySelectorAll('[data-dex-filter]').forEach((b) => (b.onclick = () => openDex(b.dataset.dexFilter, sport)));
  $('#dlg-dex').querySelectorAll('[data-dex-sport]').forEach((b) => (b.onclick = () => openDex(filter, b.dataset.dexSport)));
}

// Evolution lines: each family with members caught, unknown ones as ???.
function linesHtml(dex) {
  const rows = FAMILIES.map((f) => {
    const p = lineProgress(dex, f[0]);
    const done = p.caught === p.total;
    const members = f.map((n) => {
      const st = dex.caught[n] ? 'caught' : dex.seen[n] ? 'seen' : 'unknown';
      return `<span class="line-member ${st}">${st === 'unknown' ? '???' : esc(GEN1[n - 1])}</span>`;
    }).join('<span class="line-arrow">›</span>');
    return { done, p, html: `<li class="line-row${done ? ' done' : ''}">
      <span class="line-head">${done ? '🏅' : `${p.caught}/${p.total}`}</span>
      <span class="line-members">${members}</span></li>` };
  });
  rows.sort((a, b) => b.done - a.done || b.p.caught / b.p.total - a.p.caught / a.p.total);
  return `<ul class="line-list">${rows.map((r) => r.html).join('')}</ul>`;
}

document.addEventListener('click', (e) => {
  const od = e.target.closest('[data-open-dex]');
  if (od) openDex('all', od.dataset.openDex || null);
});

// ---------- profile, friends & groups ----------
let profileTab = 'me';
let pendingLink = null; // { kind: 'add' | 'join', value } from an invite link

// What friends and group members can see about you (never the answers).
function publicSummary() {
  if (!S.data) return {};
  const all = loadDex();
  const nums = (o) => Object.keys(o || {}).map(Number).sort((x, y) => x - y);
  const results = {};
  for (const e of todayEntries()) {
    if (e.status === 'won' || e.status === 'lost') {
      results[e.mode.id] = { status: e.status, n: e.rows.length, squares: guessSquares(e.rows), caught: e.caught, shiny: e.shiny };
    }
  }
  const streaks = {};
  for (const m of MODES) streaks[m.id] = displayStreak(loadStats(m.id), S.puzzleNo);
  return {
    dex: Object.fromEntries(ENABLED_SPORTS.map((sp) => {
      const sd = sportDex(all, sp);
      return [sp, { caught: nums(sd.caught), seen: nums(sd.seen), shiny: nums(sd.shiny) }];
    })),
    lines: Object.fromEntries(ENABLED_SPORTS.map((sp) => [sp, FAMILIES.filter((f) => f.every((n) => sportDex(all, sp).caught[n])).length])),
    streaks,
    today: { date: S.key, puzzleNo: S.puzzleNo, results },
    week: weekTotals(loadHistory(), S.key, MODES.map((m) => m.id)),
    alltime: allTimeTotals(Object.fromEntries(MODES.map((m) => [m.id, loadStats(m.id)]))),
  };
}

function renderProfileButton() {
  const b = $('#btn-profile');
  const u = currentUser();
  const label = myHandle() || u?.displayName || u?.email || '?';
  b.textContent = u ? label.trim()[0].toUpperCase() : '👤';
  b.classList.toggle('signed-in', !!u);
  b.setAttribute('aria-label', u ? 'Your profile' : 'Sign in');
}

const siteUrl = () => `${location.origin}${location.pathname}`;

function socialError(e) {
  const map = {
    invalid: 'Usernames are 3–15 letters, numbers or _.', taken: 'That username is taken.',
    'not-found': 'No one found. Check the spelling.', self: "That's you!", already: "You're already friends.",
    'no-handle': 'Pick a username first (Me tab).', 'group-name': 'Group names need at least 2 characters.', full: 'That group is full.', 'too-many': "You're in the maximum number of groups.",
  };
  const m = map[e?.message];
  if (m) return m;
  if (e?.code === 'permission-denied') return 'Friends & groups need the updated Firebase rules (see README).';
  return 'Something went wrong. Try again.';
}

function todayLine(p, compact = false) {
  const t = p.today;
  if (!t || t.date !== S.key || !Object.keys(t.results || {}).length) return '<span class="small">Hasn\'t played today</span>';
  return MODES.filter((m) => t.results[m.id]).map((m) => {
    const r = t.results[m.id];
    const score = r.status === 'won' ? `${r.n}/${GAME.maxGuesses}` : `X/${GAME.maxGuesses}`;
    return `<span class="today-chip">${m.emoji} ${score}${compact ? '' : ` ${r.squares}`}${r.caught ? (r.shiny ? ' ✨' : ' 🎯') : ''}</span>`;
  }).join(' ');
}

// A friend's Dex per sport. Older app versions published one shared Dex; show that as "All".
function personDexes(p) {
  if (!p.dex) return {};
  if (Array.isArray(p.dex.caught)) return { All: p.dex };
  return p.dex;
}
const dexCount = (p) => Object.values(personDexes(p)).reduce((t, d) => t + (d?.caught?.length || 0), 0);

async function openProfile(tab = profileTab) {
  profileTab = tab;
  const u = currentUser();
  const st = cloudStatus();
  const caughtN = Object.values(loadDex().sports).reduce((t, sd) => t + dexCounts(sd).caught, 0);
  const dlg = $('#dlg-profile');
  if (st === 'loading') return openDialog(dlg, '<h2 id="profile-title">Profile</h2><p>Connecting…</p>');
  if (st === 'error') return openDialog(dlg, '<h2 id="profile-title">Profile</h2><p>Profiles are unavailable right now. Your progress is still saved on this device.</p>');
  if (!u) {
    openDialog(dlg, `<h2 id="profile-title">Profile</h2>
      ${pendingLink ? `<p class="invite-note">${pendingLink.kind === 'add' ? `👋 <b>@${esc(pendingLink.value)}</b> wants to be friends.` : `👥 You've been invited to a group.`} Sign in to continue.</p>` : ''}
      <p>Sign in to save your Dex (<b>${caughtN}</b> caught so far), add friends and join groups. Your progress syncs on every device, and what you've caught on this device is kept.</p>
      <button class="btn btn-primary btn-block" id="btn-google">Continue with Google</button>
      <p class="or">or get a sign-in link by email</p>
      <form class="email-form" id="email-form">
        <input type="email" id="email-input" placeholder="you@example.com" required autocomplete="email" inputmode="email">
        <button class="btn" type="submit">Email me a link</button>
      </form>
      <p class="small">We only store your sign-in email and your game progress. No passwords, no ads.</p>`);
    dlg.querySelector('#btn-google').addEventListener('click', async () => {
      try { await signInWithGoogle(); } catch (e) { if (e?.code !== 'auth/popup-closed-by-user') toast('Sign-in didn\'t work. Try the email link.'); }
    });
    dlg.querySelector('#email-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await emailSignInLink(dlg.querySelector('#email-input').value.trim()); toast('Check your email for the sign-in link.'); dlg.close(); }
      catch { toast('Could not send the email. Check the address.'); }
    });
    return;
  }
  const tabs = [['me', '👤 Me'], ['friends', '🤝 Friends'], ['groups', '👥 Groups']];
  openDialog(dlg, `<h2 id="profile-title">Profile</h2>
    <div class="chip-row">${tabs.map(([id, l]) => `<button class="chip${id === tab ? ' is-active' : ''}" data-ptab="${id}">${l}</button>`).join('')}</div>
    <div id="profile-body"><p class="small">Loading…</p></div>`);
  dlg.querySelectorAll('[data-ptab]').forEach((b) => (b.onclick = () => openProfile(b.dataset.ptab)));
  const body = dlg.querySelector('#profile-body');
  let prof = null;
  try { prof = await loadMyProfile(); } catch (e) { body.innerHTML = `<p>${esc(socialError(e))}</p>`; return; }
  if (tab === 'friends' && prof.handle) return renderFriendsTab(body, prof);
  if (tab === 'groups' && prof.handle) return renderGroupsTab(body, prof);
  renderMeTab(body, u, prof, caughtN, tab !== 'me');
}

function renderMeTab(body, u, prof, caughtN, needHandle) {
  body.innerHTML = `
    ${needHandle || !prof.handle ? '<p class="invite-note">Pick a username to add friends and join groups.</p>' : ''}
    <h3>Username</h3>
    ${prof.handle ? `<p>You're <b>@${esc(prof.handle)}</b>. Friends find you by this name.</p>` : '<p>3–15 letters, numbers or _. This is what friends see, never your email.</p>'}
    <form class="email-form" id="handle-form">
      <input id="handle-input" maxlength="15" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="e.g. jedimodi" value="${esc(prof.handle || '')}">
      <button class="btn btn-primary" type="submit">${prof.handle ? 'Change' : 'Save'}</button>
    </form>
    <h3>Sync</h3>
    <p>✅ Your Dex (<b>${caughtN}</b> caught), stats and today's games are saved to your profile and sync on any device where you sign in.</p>
    <p class="small">Signed in as ${esc(u.email || u.displayName || 'you')}. Your username, Dex and daily scores (never the answers) are visible only to your friends and groups.</p>
    <div class="btn-row"><button class="btn" id="btn-signout">Sign out</button></div>
    <p class="small"><button class="link-btn" id="btn-delete-profile">Delete my profile</button> removes your saved data, username and group memberships from our server. Progress on this device stays.</p>`;
  body.querySelector('#handle-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = body.querySelector('#handle-input').value.trim().toLowerCase();
    if (!HANDLE_RE.test(v)) return toast(socialError({ message: 'invalid' }));
    try { await claimHandle(v); toast(`You're @${v}!`); renderProfileButton(); pushProgress(); await handlePendingLink(); openProfile('me'); }
    catch (err) { toast(socialError(err)); }
  });
  body.querySelector('#btn-signout').addEventListener('click', async () => { await signOut(); toast('Signed out. Progress stays on this device.'); });
  body.querySelector('#btn-delete-profile').addEventListener('click', async () => {
    if (!confirm('Delete your profile, username and group memberships? Progress on this device stays.')) return;
    try { await deleteProfile(); toast('Profile deleted.'); $('#dlg-profile').close(); }
    catch { toast('For security, sign out and back in, then try again.'); }
  });
}

async function renderFriendsTab(body, prof) {
  body.innerHTML = `
    <form class="email-form" id="add-friend-form">
      <input id="add-friend" maxlength="16" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="Friend's username">
      <button class="btn btn-primary" type="submit">Add friend</button>
    </form>
    <p class="small">Or send your friend link: <button class="link-btn plain" id="copy-friend-link">Copy my link</button></p>
    <div id="requests"></div>
    <h3>Friends</h3>
    <ul class="people" id="friend-list"><li class="small">Loading…</li></ul>`;
  body.querySelector('#add-friend-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const h = await sendFriendRequest(body.querySelector('#add-friend').value); toast(`Friend request sent to @${h}!`); body.querySelector('#add-friend').value = ''; }
    catch (err) { toast(socialError(err)); }
  });
  body.querySelector('#copy-friend-link').addEventListener('click', async () => {
    toast((await copyText(`Add me on ModiDex! ${siteUrl()}#add=${prof.handle}`)) ? 'Friend link copied!' : 'Could not copy.');
  });
  try {
    const [reqs, friends] = await Promise.all([incomingRequests(), listFriends()]);
    const rq = body.querySelector('#requests');
    if (reqs.length) {
      rq.innerHTML = `<h3>Requests</h3><ul class="people">${reqs.map((r, i) => `
        <li class="person"><span class="person-name">@${esc(r.fromName)}</span>
          <span class="person-actions"><button class="btn btn-primary btn-sm" data-accept="${i}">Accept</button><button class="btn btn-sm" data-decline="${i}">Decline</button></span></li>`).join('')}</ul>`;
      rq.querySelectorAll('[data-accept],[data-decline]').forEach((b) => (b.onclick = async () => {
        const r = reqs[Number(b.dataset.accept ?? b.dataset.decline)];
        try { await answerRequest(r, b.dataset.accept !== undefined); toast(b.dataset.accept !== undefined ? `You and @${r.fromName} are friends!` : 'Request declined.'); openProfile('friends'); }
        catch (err) { toast(socialError(err)); }
      }));
    }
    const list = body.querySelector('#friend-list');
    if (!friends.length) { list.innerHTML = '<li class="small">No friends yet. Add someone by username or send your link.</li>'; return; }
    friends.sort((x, y) => dexCount(y) - dexCount(x));
    list.innerHTML = friends.map((f, i) => f.pending
      ? `<li class="person"><span class="person-name small">Waiting for them to accept…</span><span class="person-actions"><button class="btn btn-sm" data-unfriend="${i}">Remove</button></span></li>`
      : `<li class="person tappable" data-friend="${i}"><span class="person-name">@${esc(f.handle)}</span>
          <span class="person-meta">📕 ${dexCount(f)} · ${todayLine(f, true)}</span><span class="person-arrow">›</span></li>`).join('');
    list.querySelectorAll('[data-friend]').forEach((li) => (li.onclick = () => openPerson(friends[Number(li.dataset.friend)], { friend: true })));
    list.querySelectorAll('[data-unfriend]').forEach((b) => (b.onclick = async () => { await removeFriend(friends[Number(b.dataset.unfriend)].uid); openProfile('friends'); }));
  } catch (err) {
    body.querySelector('#friend-list').innerHTML = `<li class="small">${esc(socialError(err))}</li>`;
  }
}

async function renderGroupsTab(body) {
  body.innerHTML = `
    <form class="email-form" id="create-group-form">
      <input id="group-name" maxlength="30" placeholder="New group name">
      <button class="btn btn-primary" type="submit">Create</button>
    </form>
    <form class="email-form" id="join-group-form">
      <input id="group-code" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="Join code">
      <button class="btn" type="submit">Join</button>
    </form>
    <h3>Your groups</h3>
    <ul class="people" id="group-list"><li class="small">Loading…</li></ul>`;
  body.querySelector('#create-group-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const g = await createGroup(body.querySelector('#group-name').value); toast(`Created "${g.name}". Share code ${g.code}!`); openProfile('groups'); }
    catch (err) { toast(socialError(err)); }
  });
  body.querySelector('#join-group-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const g = await joinGroup(body.querySelector('#group-code').value); toast(g.already ? `You're already in "${g.name}".` : `Joined "${g.name}"!`); openProfile('groups'); }
    catch (err) { toast(socialError(err)); }
  });
  try {
    const groups = await listGroups();
    const list = body.querySelector('#group-list');
    if (!groups.length) { list.innerHTML = '<li class="small">No groups yet. Create one for your crew, or join with a code.</li>'; return; }
    list.innerHTML = groups.map((g, i) => `<li class="person tappable" data-group="${i}"><span class="person-name">${esc(g.name)}</span>
      <span class="person-meta">${g.members.length} member${g.members.length === 1 ? '' : 's'} · code ${esc(g.code)}</span><span class="person-arrow">›</span></li>`).join('');
    list.querySelectorAll('[data-group]').forEach((li) => (li.onclick = () => openGroup(groups[Number(li.dataset.group)])));
  } catch (err) {
    body.querySelector('#group-list').innerHTML = `<li class="small">${esc(socialError(err))}</li>`;
  }
}

// A friend's or group member's profile: today's results, streaks and their Dex.
function openPerson(p, { friend = false, sport = null } = {}) {
  const dexes = personDexes(p);
  const sports = Object.keys(dexes);
  if (!sport || !dexes[sport]) sport = sports.find((sp) => sp === S.mode.sports?.[0]) || sports[0];
  const d = dexes[sport] || {};
  const caught = new Set(d.caught || []);
  const seen = new Set(d.seen || []);
  const shiny = new Set(d.shiny || []);
  const lines = typeof p.lines === 'object' ? (p.lines?.[sport] || 0) : (p.lines || 0);
  const streaks = MODES.map((m) => `${m.emoji} ${p.streaks?.[m.id] || 0}`).join(' · ');
  const tabs = sports.map((sp) => `<button class="chip sport-chip${sp === sport ? ' is-active' : ''}" data-person-sport="${sp}">${SPORTS[sp]?.emoji || '📕'} ${sp} <b>${dexes[sp]?.caught?.length || 0}</b></button>`).join('');
  const cells = GEN1.map((name, i) => {
    const n = i + 1;
    const st = caught.has(n) ? 'caught' : seen.has(n) ? 'seen' : 'unknown';
    return `<li class="dex-cell mini ${st}${shiny.has(n) ? ' shiny' : ''}"><span class="dex-no">#${dex3(n)}${shiny.has(n) ? ' ✨' : ''}</span><span class="dex-name">${st === 'unknown' ? '???' : esc(name)}</span></li>`;
  }).join('');
  openDialog($('#dlg-person'), `
    <h2 id="person-title">@${esc(p.handle || 'player')}</h2>
    <p><b>${dexCount(p)}</b> caught across all sports</p>
    <h3>Today</h3><p class="today-row">${todayLine(p)}</p>
    <h3>Current streaks</h3><p>${streaks}</p>
    <h3>Their Dex</h3>
    ${sports.length ? `<div class="chip-row">${tabs}</div>
    <p class="small">${sport}: <b>${caught.size}</b> caught · ${seen.size} seen · ✨ ${shiny.size} shiny · 🏅 ${lines} line${lines === 1 ? '' : 's'}</p>
    <ul class="dex-grid">${cells}</ul>` : '<p class="small">No catches yet.</p>'}
    ${friend ? '<p class="small"><button class="link-btn" id="btn-unfriend">Remove friend</button></p>' : ''}`);
  $('#dlg-person').querySelectorAll('[data-person-sport]').forEach((b) => (b.onclick = () => openPerson(p, { friend, sport: b.dataset.personSport })));
  $('#dlg-person').querySelector('#btn-unfriend')?.addEventListener('click', async () => {
    if (!confirm(`Remove @${p.handle} from your friends?`)) return;
    await removeFriend(p.uid); $('#dlg-person').close(); openProfile('friends');
  });
}

let groupTab = 'today';
const BOARD_TABS = [['today', 'Today'], ['week', 'This week'], ['alltime', 'All-time']];

// A member's score on one leaderboard tab, or null if they haven't published it yet.
function boardScore(p, tab) {
  if (tab === 'today') {
    const r = p.today?.date === S.key ? Object.values(p.today.results || {}) : [];
    return { pts: r.reduce((t, x) => t + pointsFor(x), 0), solved: r.filter((x) => x.status === 'won').length, played: r.length };
  }
  if (tab === 'week') {
    if (!p.week) return null;
    return p.week.start === weekStart(S.key) ? p.week : { pts: 0, solved: 0, played: 0 };
  }
  return p.alltime || null;
}

function boardMeta(p, tab, sc) {
  if (!sc) return '<span class="small">Totals show after their next game</span>';
  const pts = `<b class="pts">${sc.pts} pt${sc.pts === 1 ? '' : 's'}</b>`;
  if (tab === 'today') return `${pts} · ${todayLine(p, true)}`;
  if (tab === 'week') return `${pts} · ${sc.solved}/${sc.played} solved`;
  const pct = sc.played ? Math.round((100 * sc.solved) / sc.played) : 0;
  return `${pts} · ${sc.solved} solved · ${pct}% · 📕 ${dexCount(p)}`;
}

function renderBoard(dlg, members) {
  const me = currentUser()?.uid;
  dlg.querySelectorAll('[data-btab]').forEach((b) => b.classList.toggle('is-active', b.dataset.btab === groupTab));
  const ready = members.filter((p) => !p.pending).map((p) => ({ p, sc: boardScore(p, groupTab) }));
  ready.sort((a, b) => (b.sc?.pts ?? -1) - (a.sc?.pts ?? -1) || (b.sc?.solved ?? -1) - (a.sc?.solved ?? -1) || dexCount(b.p) - dexCount(a.p));
  const medal = ['🥇', '🥈', '🥉'];
  let rank = 0;
  let prev = null;
  const rows = ready.map(({ p, sc }, i) => {
    const key = sc ? `${sc.pts}:${sc.solved}` : 'none';
    if (key !== prev) { rank = i + 1; prev = key; } // ties share a rank
    const badge = sc?.pts > 0 && rank <= 3 ? medal[rank - 1] : rank;
    return `<li class="person tappable${p.uid === me ? ' is-me' : ''}" data-member="${members.indexOf(p)}"><span class="rank">${badge}</span><span class="person-name">@${esc(p.handle)}${p.uid === me ? ' (you)' : ''}</span>
      <span class="person-meta">${boardMeta(p, groupTab, sc)}</span><span class="person-arrow">›</span></li>`;
  });
  const pending = members.filter((p) => p.pending).map(() => '<li class="person"><span class="person-name small">A member (syncing…)</span></li>');
  const board = dlg.querySelector('#board');
  board.innerHTML = rows.concat(pending).join('') || '<li class="small">No members yet.</li>';
  board.querySelectorAll('[data-member]').forEach((li) => (li.onclick = () => openPerson(members[Number(li.dataset.member)])));
  const notes = {
    today: "Today's puzzles across every mode.",
    week: `Monday ${weekStart(S.key).slice(5).replace('-', '/')} through Sunday. Resets every Monday at midnight ET.`,
    alltime: 'Every puzzle since joining ModiDex.',
  };
  dlg.querySelector('#board-note').textContent = notes[groupTab];
}

async function openGroup(g, testMembers = null) {
  const dlg = $('#dlg-person');
  openDialog(dlg, `<h2 id="person-title">${esc(g.name)}</h2>
    <p>Join code <b class="code">${esc(g.code)}</b> · <button class="link-btn plain" id="copy-invite">Copy invite link</button></p>
    <h3>Leaderboard</h3>
    <div class="chip-row">${BOARD_TABS.map(([id, l]) => `<button class="chip${id === groupTab ? ' is-active' : ''}" data-btab="${id}">${l}</button>`).join('')}</div>
    <ul class="people" id="board"><li class="small">Loading…</li></ul>
    <p class="small"><span id="board-note"></span> Points: 6 for a 1st-guess solve, down to 1 for a 6th-guess solve.</p>
    <p class="small"><button class="link-btn" id="btn-leave">Leave group</button></p>`);
  dlg.querySelector('#copy-invite').onclick = async () =>
    toast((await copyText(`Join my ModiDex group "${g.name}"! ${siteUrl()}#join=${g.code}`)) ? 'Invite link copied!' : 'Could not copy.');
  dlg.querySelector('#btn-leave').onclick = async () => {
    if (!confirm(`Leave "${g.name}"?`)) return;
    try { await leaveGroup(g.id); dlg.close(); toast(`Left "${g.name}".`); openProfile('groups'); } catch (err) { toast(socialError(err)); }
  };
  try {
    const members = testMembers || await groupMembers(g);
    dlg.querySelectorAll('[data-btab]').forEach((b) => (b.onclick = () => { groupTab = b.dataset.btab; renderBoard(dlg, members); }));
    renderBoard(dlg, members);
  } catch (err) {
    dlg.querySelector('#board').innerHTML = `<li class="small">${esc(socialError(err))}</li>`;
  }
}

// Finish an invite link (#add=username or #join=CODE) once signed in with a username.
async function handlePendingLink() {
  if (!pendingLink) return;
  if (!currentUser()) { openProfile('me'); return; }
  let prof;
  try { prof = await loadMyProfile(); } catch { return; }
  if (!prof.handle) { openProfile('me'); return; }
  const { kind, value } = pendingLink;
  pendingLink = null;
  try {
    if (kind === 'add') {
      if (value.toLowerCase() === prof.handle) return;
      if (!confirm(`Send a friend request to @${value}?`)) return;
      await sendFriendRequest(value);
      toast(`Friend request sent to @${value}!`);
    } else {
      if (!confirm(`Join the group with code ${value.toUpperCase()}?`)) return;
      const g = await joinGroup(value);
      toast(g.already ? `You're already in "${g.name}".` : `Joined "${g.name}"!`);
      openProfile('groups');
    }
  } catch (err) {
    toast(socialError(err));
  }
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
    <p>If it breaks free it's still registered as Seen. If you run out of guesses, it flees. Each sport has its own 📕 Dex of ${CATCH.total}, one player for every creature, so you can complete the NFL, NBA and MLB Dexes separately. All Sports catches count toward that athlete's sport.</p>
    <h3>Rare encounters</h3>
    <p><b>👑 Legendary</b> creatures are tougher to catch: ${CATCH.tiers.map((t) => `${t.icon} ${Math.round(t.legendaryRate * 100)}%`).join(', ')}. About 1 in ${CATCH.shinyOdds} puzzles is a <b>✨ Shiny</b> encounter, the same for every player that day. Catch one to mark it shiny in your Dex. Watch for 👑 and ✨ on the sport tabs.</p>
    <h3>Evolution lines</h3>
    <p>Catch every member of a family, like Charmander, Charmeleon and Charizard, to earn a 🏅. See your progress under 🏅 Lines in the Dex.</p>
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

// Local testing only: lets the developer preview social screens with sample data.
if (location.hostname === 'localhost') window.__modidexTest = { openPerson, openGroup, publicSummary };
