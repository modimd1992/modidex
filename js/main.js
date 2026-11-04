// App entry point: wires data, daily answers, storage and the screen together.
import { GAME, MODES, SPORTS, STATS, CLUE_SCHEDULE, CLOSE, ENABLED_SPORTS, CATCH } from './config.js';
import { TYPES, typeInfo, athleteTypes } from './types.js';
import { loadData } from './data.js';
import { dateKey, puzzleNumber, answersForDate, poolForMode, secondsUntilNextDay, hashString, addDays } from './daily.js';
import { compareGuess, columnsFor } from './compare.js';
import { cluesFor } from './clues.js';
import { loadGame, saveGame, loadStats, recordResult, displayStreak, loadPref, savePref, loadDex, saveDex, sportDex, dexCounts, loadHistory, recordHistory } from './storage.js';
import { pointsFor, weekTotals, weekStart, allTimeTotals } from './leaderboard.js';
import { badgeFacts, badgeStatus, badgeById, ALL_BADGES } from './badges.js';
import { newPartner, feedPartner, levelOf, levelProgress, evolutionOf, XP_PER_LEVEL, MAX_LEVEL } from './partner.js';
import { drawTrainerCard } from './trainercard.js';
import { GYMS, currentGym, leaderTeam, playerTeam, practiceTeam, canChallenge, statTotal, catchesNeeded } from './gyms.js';
import { runBattle, effectiveness, typesOf } from './battle.js';
import { shareText, combinedShareText, shareOrCopy, copyText, guessSquares } from './share.js';
import { renderCard, esc } from './card.js';
import { attachAutocomplete } from './autocomplete.js';
import { resolveCatch, tierForGuess, ballById, isShiny, isLegendary, catchRate, lineProgress } from './catch.js';
import { GEN1, FAMILIES, pad3 as dex3 } from './gen1.js';
import { cloudEnabled, initCloud, onCloudChange, currentUser, cloudStatus, pushProgress, signInWithGoogle, emailSignInLink, signOut, deleteProfile } from './cloud.js';
import {
  setSummaryBuilder, loadMyProfile, myHandle, forgetProfile, claimHandle, sendFriendRequest, incomingRequests,
  answerRequest, processAnsweredRequests, listFriends, removeFriend, createGroup, joinGroup, leaveGroup, listGroups, groupMembers, HANDLE_RE,
  sendTrade, incomingTrades, outgoingTrades, answerTrade, cancelTrade, processAnsweredTrades,
} from './social.js';

const $ = (sel, root = document) => root.querySelector(sel);

const S = {
  data: null,
  key: null,       // the day being shown (today, or a past day)
  puzzleNo: 0,
  today: null,     // today's date: results, streaks and leaderboards always use this
  todayNo: 0,
  archive: false,  // true while playing a past day
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
  if (S.data.dataAsOf) $('#data-asof').textContent = `Rosters as of ${/^\d{4}-\d{2}-\d{2}$/.test(S.data.dataAsOf) ? longDate(S.data.dataAsOf) : S.data.dataAsOf}.`;
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
      if (why === 'synced') { backfillHistory(); checkBadges(); renderModes(); renderMode(); checkTrades(); }
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
  setTimeout(() => checkBadges(), 800);
  if (!loadPref('seenHelp', false)) {
    openHelp();
    savePref('seenHelp', true);
  }
}

// Shows today, or a past day (key) from the archive.
function setDay(key = null) {
  S.today = dateKey();
  S.todayNo = puzzleNumber(S.today);
  S.key = key && key < S.today && key >= GAME.launchDate ? key : S.today;
  S.archive = S.key !== S.today;
  S.puzzleNo = puzzleNumber(S.key);
  S.answers = answersFor(S.key);
}
const answersFor = (key) => answersForDate(S.data.athletes, key, S.data.schedule);
// Each past day gets its own saved game per mode; today's uses the plain mode id.
const slot = (modeId, key = S.key) => (key === S.today ? modeId : `${modeId}@${key}`);
// A past day you played on the day itself: its result from the daily history.
const liveResult = (modeId, key = S.key) => (key !== S.today ? loadHistory()[key]?.[modeId] || null : null);

function openDay(key) {
  setDay(key);
  renderModes();
  renderMode();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// New day while the tab is open: reload the page, so the new puzzles also get
// the latest version of the game and its data.
function tick() {
  if (!S.data) return;
  if (dateKey() !== S.today) {
    S.today = dateKey(); // only reload once
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
function modeStatus(mode, key = S.key, answers = S.answers) {
  const a = answers[mode.id];
  if (!a) return 'none';
  let g = loadGame(slot(mode.id, key), key, a.id);
  if (key !== S.today && !g.guesses.length) g = loadGame(mode.id, key, a.id); // started on the day itself
  if (!g.guesses.length) {
    const h = liveResult(mode.id, key);
    if (h) return h.s;
  }
  return g.status;
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
  S.game = loadGame(slot(S.mode.id), S.key, a.id);
  // A past day started on the day itself: yesterday's game may still be in today's slot.
  if (S.archive && !S.game.guesses.length) {
    const plain = loadGame(S.mode.id, S.key, a.id);
    if (plain.guesses.length) S.game = plain;
  }
  // A past day played on the day itself: show that result (its guesses aren't saved).
  const live = !S.game.guesses.length && liveResult(S.mode.id);
  if (live) S.game = { ...S.game, status: live.s, live };
  S.compareId = null;
  S.justFinished = false;
  if (finished() && !S.game.catch && !S.game.live) {
    resolveCatch(S.game, a, S.key, rareFor(S.mode));
    saveGame(slot(S.mode.id), S.game);
  }
  $('#app').innerHTML = `
    ${S.archive ? archiveBannerHtml() : ''}
    <section id="card-area" aria-live="polite"></section>
    <section id="play-area"></section>
    <section id="clues" class="clues"></section>
    <section id="guesses" class="guesses" aria-label="Your guesses"></section>
    <section id="gym-area" class="gym-area" aria-label="Gym challenge"></section>
    <section id="archive" class="archive" aria-label="Past puzzles"></section>`;
  renderCardArea();
  renderClues();
  renderPlayArea();
  renderGuesses(false);
  renderGymCard();
  renderArchive();
}

// ---------- past puzzles ----------
const dayLabel = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
let archiveShown = 14;

function archiveBannerHtml() {
  return `<div class="archive-banner">
    <div><b>📅 Past puzzle · ${esc(dayLabel(S.key))}</b><span class="small">No. ${pad3(S.puzzleNo)} · Catches go to your Dex. This puzzle doesn't count toward streaks or leaderboards.</span></div>
    <button class="btn btn-sm" type="button" data-day="">Back to today</button>
  </div>`;
}

// The list of past days at the bottom of the page.
function renderArchive() {
  const el = $('#archive');
  if (!el) return;
  const days = [];
  for (let k = addDays(S.today, -1); k >= GAME.launchDate; k = addDays(k, -1)) days.push(k);
  if (!days.length) { el.innerHTML = ''; return; }
  const rows = days.slice(0, archiveShown).map((k) => {
    const ans = answersFor(k);
    const marks = MODES.map((m) => {
      const st = modeStatus(m, k, ans);
      return `<span class="arch-mark ${st}" title="${esc(m.label)}">${m.emoji}<i>${st === 'won' ? '✓' : st === 'lost' ? '✗' : ''}</i></span>`;
    }).join('');
    return `<li><button class="arch-day${k === S.key ? ' is-active' : ''}" type="button" data-day="${k}">
      <span class="arch-when"><b>No. ${pad3(puzzleNumber(k))}</b> ${esc(dayLabel(k))}</span><span class="arch-marks">${marks}</span></button></li>`;
  }).join('');
  el.innerHTML = `<h3 class="section-title">📅 Past puzzles</h3>
    <p class="small">Missed a day? Play any past puzzle. Catches go to your Dex and your partner earns XP, but past puzzles don't count toward streaks or leaderboards.</p>
    <ul class="arch-list">${S.archive ? `<li><button class="arch-day" type="button" data-day=""><span class="arch-when"><b>Today</b> ${esc(dayLabel(S.today))}</span><span class="arch-marks">›</span></button></li>` : ''}${rows}</ul>
    ${days.length > archiveShown ? '<button class="btn btn-block" type="button" id="arch-more">Show older puzzles</button>' : ''}`;
  el.querySelector('#arch-more')?.addEventListener('click', () => { archiveShown += 14; renderArchive(); });
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-day]');
  if (b) openDay(b.dataset.day || null);
});

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
  if (S.game.live) { el.innerHTML = ''; return; }
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
    // Past puzzles never touch streaks, stats or the leaderboard history.
    if (!S.archive) recordResult(S.mode.id, S.puzzleNo, won, S.game.guesses.length);
    S.game.recorded = true;
    const caught = resolveCatch(S.game, answer(), S.key, rareFor(S.mode));
    if (!S.archive) recordHistory(S.key, S.mode.id, S.game.status, S.game.guesses.length, caught?.outcome === 'caught');
    const fed = feedMyPartner(S.mode.id, won, S.game.guesses.length);
    if (fed?.evolved) setTimeout(() => showEvolution(fed.evolved), 2600); // after the catch animation
    S.justFinished = true;
    setTimeout(() => checkBadges(), 1800); // after the catch animation
    setTimeout(pushProgress, 0); // after the save below; syncs to the profile if signed in
    // Hook for future features (card collection, leaderboards).
    document.dispatchEvent(new CustomEvent('modidex:complete', {
      detail: { modeId: S.mode.id, puzzleNo: S.puzzleNo, athleteId: S.game.answerId, won, guesses: S.game.guesses.length, catch: caught, archive: S.archive },
    }));
  }
  saveGame(slot(S.mode.id), S.game);

  const before = cluesFor(answer(), S.mode, wrongCount() - (won ? 0 : 1), false).filter((c) => c.unlocked).length;
  renderGuesses(true);
  renderClues();
  renderCardArea();
  if (finished()) {
    renderPlayArea();
    renderModes();
    renderArchive();
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
function todayEntries(key = S.today) {
  const answers = key === S.key ? S.answers : answersFor(key);
  return MODES.map((m) => {
    const ans = answers[m.id];
    if (!ans) return { mode: m, status: 'none', rows: [] };
    const g = loadGame(slot(m.id, key), key, ans.id);
    const rows = g.guesses.map((id) => S.data.byId.get(id)).filter(Boolean)
      .map((x) => ({ correct: x.id === ans.id, cells: compareGuess(x, ans, key, m) }));
    return { mode: m, status: g.guesses.length ? g.status : 'none', rows, caught: g.catch?.outcome === 'caught', shiny: g.catch?.outcome === 'caught' && !!g.catch?.shiny };
  });
}

// Make sure today's finished games are in the daily history, and that every
// creature today's games caught or saw is in the Dex (repairs saves from old tabs).
function backfillHistory() {
  for (const e of todayEntries()) {
    if (e.status === 'won' || e.status === 'lost') recordHistory(S.today, e.mode.id, e.status, e.rows.length, e.caught);
  }
  const all = loadDex();
  let changed = false;
  const answers = answersFor(S.today);
  for (const m of MODES) {
    const ans = answers[m.id];
    if (!ans) continue;
    const c = loadGame(m.id, S.today, ans.id).catch;
    if (!c?.dex || c.outcome === 'fled') continue;
    const sd = sportDex(all, c.sport || ans.sport);
    const entry = { date: S.today, athleteId: ans.id };
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
  return combinedShareText({ puzzleNo: S.puzzleNo, entries: todayEntries(S.key), url: `${location.origin}${location.pathname}` });
}

function renderResult(area) {
  const won = S.game.status === 'won';
  const a = answer();
  const n = S.game.live ? S.game.live.n : S.game.guesses.length;
  const stats = loadStats(S.mode.id);
  const streak = displayStreak(stats, S.todayNo);
  const nextModes = MODES.filter((m) => m.id !== S.mode.id && modeStatus(m) === 'playing');
  const praise = ['Phenomenal!', 'Incredible!', 'Clutch!', 'Nice scouting!', 'Got it!', 'Phew!'][n - 1] || 'Got it!';
  area.innerHTML = `
    <div class="panel result ${won ? 'won' : 'lost'}">
      ${catchHtml(S.game.catch, S.justFinished)}
      ${partnerLineHtml()}
      <h2>${won ? `${praise} Scouted in ${n}/${GAME.maxGuesses}` : 'Out of guesses!'}</h2>
      <p>${won ? 'You named' : 'The mystery athlete was'} <b>${esc(a.name)}</b>${a.comp ? `, whose Gen 1 comp is <b>${esc(a.comp.name)}</b>` : ''}.</p>
      ${S.game.live ? `<p class="small">You played this puzzle on ${esc(dayLabel(S.key))}.</p>` : ''}
      ${S.archive ? '' : `<div class="result-stats">
        <div><b>${stats.played}</b><span>Played</span></div>
        <div><b>${stats.played ? Math.round((stats.wins / stats.played) * 100) : 0}%</b><span>Win %</span></div>
        <div><b>${streak}</b><span>Streak</span></div>
        <div><b>${stats.maxStreak}</b><span>Best</span></div>
      </div>`}
      ${S.game.live ? '' : `<pre class="share-preview" aria-label="Share preview">${esc(currentShareText())}</pre>
      <div class="btn-row">
        <button class="btn btn-primary" id="btn-share">Share result</button>
        <button class="btn" id="btn-copy">Copy</button>
      </div>`}
      ${finishedToday() >= 2 ? `<div class="combined">
        <h3 class="section-title">${S.archive ? `All puzzles from ${esc(dayLabel(S.key))}` : "All of today's puzzles"}</h3>
        <pre class="share-preview" aria-label="Combined share preview">${esc(combinedText())}</pre>
        <div class="btn-row">
          <button class="btn btn-primary" id="btn-share-all">Share all</button>
          <button class="btn" id="btn-copy-all">Copy</button>
        </div>
      </div>` : ''}
      ${S.archive ? '' : `<p class="next">Next ${esc(S.mode.label)} puzzle in <b id="countdown">${timeToMidnight()}</b></p>`}
      ${nextModes.length ? `<div class="next-modes"><span>Play another:</span>${nextModes.map((m) =>
        `<button class="chip" data-go="${m.id}">${m.emoji} ${esc(m.label)}</button>`).join('')}</div>`
        : S.archive ? `<p class="small">You finished every puzzle from ${esc(dayLabel(S.key))}. <button class="link-btn" type="button" data-day="">Back to today</button></p>`
        : '<p class="small">You finished every puzzle today. See you tomorrow!</p>'}
    </div>`;
  if ($('#btn-share')) $('#btn-share').onclick = async () => {
    const r = await shareOrCopy(currentShareText());
    if (r === 'copied') toast('Result copied! Paste it anywhere.');
    else if (r === 'failed') toast('Could not copy. Long-press the preview to copy.');
  };
  if ($('#btn-copy')) $('#btn-copy').onclick = async () => toast((await copyText(currentShareText())) ? 'Copied!' : 'Could not copy.');
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
const TOTAL = 'TOTAL'; // the combined Dex tab
const BADGES = 'BADGES'; // the badges tab
const TIER_RANK = Object.fromEntries(CATCH.tiers.map((t, i) => [t.id, i]));

// One Dex across every sport: a creature counts once, from whichever sport you got it.
// Each entry also lists the sports it came from.
function combinedDex(all) {
  const out = { caught: {}, seen: {}, shiny: {}, from: {} };
  for (const sp of ENABLED_SPORTS) {
    const sd = sportDex(all, sp);
    for (let n = 1; n <= CATCH.total; n++) {
      const c = sd.caught[n];
      const s = sd.seen[n];
      if (!c && !s) continue;
      (out.from[n] ||= []).push({ sport: sp, entry: c || s, caught: !!c });
      if (c && (!out.caught[n] || (TIER_RANK[c.ball] ?? 99) < (TIER_RANK[out.caught[n].ball] ?? 99))) out.caught[n] = c;
      if (s && !out.seen[n]) out.seen[n] = s;
      if (sd.shiny[n]) out.shiny[n] = sd.shiny[n];
    }
  }
  for (const n of Object.keys(out.caught)) delete out.seen[n]; // caught anywhere beats seen
  return out;
}

// The tab row at the top of the Dex window.
function dexTabsHtml(all, active) {
  const earned = Object.keys(all.badges || {}).filter((id) => !id.endsWith('.gold')).length;
  return [
    `<button class="chip sport-chip${active === TOTAL ? ' is-active' : ''}" data-dex-sport="${TOTAL}">📚 Total <b>${Object.keys(combinedDex(all).caught).length}</b></button>`,
    ...ENABLED_SPORTS.map((sp) => {
      const n = dexCounts(all.sports[sp]).caught;
      return `<button class="chip sport-chip${sp === active ? ' is-active' : ''}" data-dex-sport="${sp}">${SPORTS[sp].emoji} ${sp} <b>${n}</b></button>`;
    }),
    `<button class="chip sport-chip${active === BADGES ? ' is-active' : ''}" data-dex-sport="${BADGES}">🎖️ Badges <b>${earned}</b></button>`,
  ].join('');
}

function openDex(filter = 'all', sport = dexSport) {
  if (sport === BADGES) return openBadges();
  if (sport !== TOTAL && (!sport || !ENABLED_SPORTS.includes(sport))) sport = S.mode.sports?.length === 1 ? S.mode.sports[0] : TOTAL;
  dexSport = sport;
  const all = loadDex();
  const isTotal = sport === TOTAL;
  const dex = isTotal ? combinedDex(all) : sportDex(all, sport);
  const caughtN = Object.keys(dex.caught).length;
  const seenN = Object.keys(dex.seen).length;
  const shinyN = Object.keys(dex.shiny).length;
  const linesDone = FAMILIES.filter((f) => f.every((n) => dex.caught[n])).length;
  const grandCaught = ENABLED_SPORTS.reduce((t, sp) => t + dexCounts(all.sports[sp]).caught, 0);
  const sportTabs = dexTabsHtml(all, sport);
  const cells = GEN1.map((name, i) => {
    const n = i + 1;
    const c = dex.caught[n];
    const s = dex.seen[n];
    const state = c ? 'caught' : s ? 'seen' : 'unknown';
    if (filter === 'caught' && !c) return '';
    if (filter === 'missing' && c) return '';
    if (filter === 'shiny' && !dex.shiny[n]) return '';
    const nameOf = (e) => S.data.byId.get(e?.athleteId)?.name || '';
    let via = c || s ? nameOf(c || s) : '';
    let title = via ? `${state === 'caught' ? 'Caught' : 'Seen'} via ${via}` : '';
    if (isTotal && dex.from[n]) {
      // Show which sports it came from, e.g. "🏈 🏀"
      via = dex.from[n].map((f) => SPORTS[f.sport].emoji).join(' ');
      title = dex.from[n].map((f) => `${f.sport}: ${f.caught ? 'caught' : 'seen'} via ${nameOf(f.entry)}`).join('\n');
    }
    const ball = c ? (c.ball === 'trade' ? { icon: '🔁' } : ballById(c.ball)) : null;
    if (c?.from && !isTotal) title += ` (traded from @${c.from})`;
    const shinyMark = dex.shiny[n] ? ' ✨' : '';
    return `<li class="dex-cell ${state}${dex.shiny[n] ? ' shiny' : ''}${CATCH.legendary.includes(n) ? ' legendary' : ''}" title="${esc(title)}">
      <span class="dex-no">#${dex3(n)}${ball ? ` ${ball.icon}` : state === 'seen' ? ' 👁' : ''}${shinyMark}</span>
      <span class="dex-name">${state === 'unknown' ? '???' : esc(name)}</span>
      ${via ? `<span class="dex-via">${esc(via)}</span>` : ''}
    </li>`;
  }).join('');
  const pct = Math.round((caughtN / CATCH.total) * 100);
  openDialog($('#dlg-dex'), `
    <h2 id="dex-title">${isTotal ? 'Your 📚 Total Dex' : `Your ${SPORTS[sport].emoji} ${sport} Dex`}</h2>
    <div class="chip-row">${sportTabs}</div>
    ${dexActionsHtml(all)}
    <p><b>${caughtN}</b> caught · ${seenN} seen · ${CATCH.total} total<br><span class="small">✨ ${shinyN} shiny · 🏅 ${linesDone}/${FAMILIES.length} evolution lines complete</span>${isTotal ? `<br><span class="small">🏆 Grand total: <b>${grandCaught}</b> of ${CATCH.total * ENABLED_SPORTS.length} caught across all ${ENABLED_SPORTS.length} sports</span>` : ''}</p>
    <div class="dex-bar" aria-label="${pct}% caught"><span style="width:${pct}%"></span></div>
    <div class="chip-row">
      ${[['all', 'All'], ['caught', 'Caught'], ['missing', 'Missing'], ['shiny', '✨ Shiny'], ['lines', '🏅 Lines']].map(([id, label]) =>
        `<button class="chip${filter === id ? ' is-active' : ''}" data-dex-filter="${id}">${label}</button>`).join('')}
    </div>
    ${filter === 'lines' ? linesHtml(dex) : `<ul class="dex-grid">${cells || '<li class="small">Nothing here yet. Solve a puzzle to start catching!</li>'}</ul>`}
    <p class="small">${isTotal ? `The Total Dex counts each creature once, from any sport. ` : ''}Each sport has its own Dex of ${CATCH.total}. Catches from All Sports go to that athlete's sport. Solve faster for a better ball: ${CATCH.tiers.map((t) => `${t.icon} ${t.name} ${Math.round(t.rate * 100)}%`).join(' · ')}.</p>`);
  $('#dlg-dex').querySelectorAll('[data-dex-filter]').forEach((b) => (b.onclick = () => openDex(b.dataset.dexFilter, sport)));
  $('#dlg-dex').querySelectorAll('[data-dex-sport]').forEach((b) => (b.onclick = () => openDex(filter, b.dataset.dexSport)));
}

// ---------- partner ----------
const longDate = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function partnerInfo(p) {
  if (!p) return null;
  const a = S.data.byId.get(p.athleteId);
  const t = a ? athleteTypes(a)[0] : null;
  const evo = evolutionOf(p.form);
  const level = levelOf(p);
  return {
    name: GEN1[p.form - 1], base: GEN1[p.n - 1], level, progress: levelProgress(p),
    toNext: level >= MAX_LEVEL ? 0 : XP_PER_LEVEL - ((p.xp || 0) % XP_PER_LEVEL),
    emoji: t ? typeInfo(t).emoji : '⭐',
    via: a ? `Caught via ${a.name} ${SPORTS[p.sport]?.emoji || ''}`.trim() : '',
    evoNote: evo && level < evo.at ? `Evolves at Lv ${evo.at}` : evo ? 'Ready to evolve' : 'Fully evolved',
  };
}

function feedMyPartner(modeId, won, guesses) {
  const all = loadDex();
  const r = feedPartner(all.partner, { date: S.key, modeId, won, guesses });
  if (!r) return null;
  all.partner = r.partner;
  saveDex(all);
  S.partnerGain = { modeId, date: S.key, ...r };
  return r;
}

const xpBar = (progress) => `<span class="xp-bar"><span style="width:${Math.round(progress * 100)}%"></span></span>`;

// The partner line under today's catch result.
function partnerLineHtml() {
  const all = loadDex();
  const info = partnerInfo(all.partner);
  if (!info) {
    return Object.keys(combinedDex(all).caught).length
      ? '<button class="partner-line" type="button" data-open-partner>🤝 Pick a partner to level up with every puzzle ›</button>' : '';
  }
  const g = S.partnerGain?.modeId === S.mode.id && S.partnerGain.date === S.key ? S.partnerGain : null;
  const gain = g ? ` · <b class="xp-gain">+${g.gained} XP</b>${g.after > g.before ? ' · Level up! ⬆️' : ''}` : '';
  return `<button class="partner-line" type="button" data-open-partner><span>${info.emoji} <b>${esc(info.name)}</b> Lv ${info.level}${gain}</span>${xpBar(info.progress)}</button>`;
}

// Partner + Trainer Card buttons at the top of the Dex.
function dexActionsHtml(all) {
  const info = partnerInfo(all.partner);
  return `<div class="dex-actions">
    <button class="partner-line" type="button" data-open-partner><span>${info ? `${info.emoji} Partner: <b>${esc(info.name)}</b> Lv ${info.level}` : '🤝 Choose a partner'} ›</span>${info ? xpBar(info.progress) : ''}</button>
    <button class="btn btn-sm" type="button" data-open-card>🪪 Trainer Card</button>
  </div>`;
}

function openPartner() {
  const all = loadDex();
  const p = all.partner;
  const info = partnerInfo(p);
  const combined = combinedDex(all);
  const nums = Object.keys(combined.caught).map(Number).sort((x, y) => x - y);
  const cells = nums.map((n) => {
    const sports = (combined.from[n] || []).filter((f) => f.caught).map((f) => SPORTS[f.sport].emoji).join(' ');
    return `<li><button class="dex-cell caught pick${p?.n === n ? ' is-partner' : ''}" type="button" data-pick="${n}">
      <span class="dex-no">#${dex3(n)}${p?.n === n ? ' 🤝' : ''}</span><span class="dex-name">${esc(GEN1[n - 1])}</span><span class="dex-via">${sports}</span></button></li>`;
  }).join('');
  openDialog($('#dlg-partner'), `
    <h2 id="partner-title">🤝 Your Partner</h2>
    ${info ? `<div class="partner-hero">
      <div class="partner-orb" aria-hidden="true">${info.emoji}</div>
      <div class="partner-body">
        <p class="partner-name">${esc(info.name)} <span class="partner-lv">Lv ${info.level}</span></p>
        ${xpBar(info.progress)}
        <p class="small">${info.toNext ? `${info.toNext} XP to Lv ${info.level + 1} · ` : ''}${info.evoNote}${p.form !== p.n ? ` · Started as ${esc(info.base)}` : ''}</p>
        <p class="small">${esc(info.via)} · Partner since ${shortDate(p.since)}</p>
      </div>
    </div>` : '<p>Pick any creature you\'ve caught to be your partner. It earns XP from every puzzle you finish, levels up and evolves.</p>'}
    <div class="btn-row"><button class="btn btn-primary" type="button" data-open-card>🪪 Trainer Card</button></div>
    <p class="small">XP per puzzle: 6 for a 1st-guess solve down to 1 for a 6th, and 1 for trying. Every ${XP_PER_LEVEL} XP is a level.</p>
    <h3>${info ? 'Change partner' : 'Choose your partner'}</h3>
    ${nums.length ? `${info ? '<p class="small">Switching starts the new partner at its own level.</p>' : ''}<ul class="dex-grid pick-grid">${cells}</ul>`
      : '<p class="small">Catch a creature first: solve a puzzle in 5 guesses or fewer to throw a ball.</p>'}`);
  $('#dlg-partner').querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => choosePartner(Number(b.dataset.pick))));
}

function choosePartner(n) {
  const all = loadDex();
  const cur = all.partner;
  if (cur?.n === n) return;
  const name = GEN1[n - 1];
  if (cur && !confirm(`Make ${name} your partner? ${GEN1[cur.form - 1]} (Lv ${levelOf(cur)}) goes back to your Dex and its level resets.`)) return;
  const f = (combinedDex(all).from[n] || []).find((x) => x.caught);
  if (!f) return;
  all.partner = newPartner({ n, sport: f.sport, athleteId: f.entry.athleteId }, S.today);
  saveDex(all);
  setTimeout(pushProgress, 0);
  toast(`🤝 ${name} is your partner!`);
  openPartner();
  if ($('#dlg-dex').open) openDex('all', dexSport);
  if (S.data && S.game && finished()) { S.justFinished = false; renderPlayArea(); }
}

function showEvolution([from, to], emoji = null) {
  const info = emoji ? { emoji } : partnerInfo(loadDex().partner);
  const dlg = $('#dlg-partner');
  openDialog(dlg, `<h2 id="partner-title" class="sr-only">Evolution</h2>
    <div class="evolve">
      <p class="evolve-what">What? <b>${esc(GEN1[from - 1])}</b> is evolving!</p>
      <div class="evolve-orb" aria-hidden="true">${info?.emoji || '⭐'}</div>
      <p class="evolve-done">Congratulations! Your ${esc(GEN1[from - 1])} evolved into <b>${esc(GEN1[to - 1])}</b>!</p>
    </div>`);
  setTimeout(() => dlg.querySelector('.evolve')?.classList.add('done'), 2200);
}

function trainerCardData() {
  const all = loadDex();
  const { list } = myBadges();
  const dates = [];
  const balls = {};
  let shinies = 0;
  for (const sp of ENABLED_SPORTS) {
    const sd = sportDex(all, sp);
    for (const e of [...Object.values(sd.caught), ...Object.values(sd.seen)]) if (e?.date) dates.push(e.date);
    for (const e of Object.values(sd.caught)) if (e?.ball && e.ball !== 'trade') balls[e.ball] = (balls[e.ball] || 0) + 1;
    shinies += Object.keys(sd.shiny).length;
  }
  const fav = Object.entries(balls).sort((x, y) => y[1] - x[1] || (TIER_RANK[x[0]] ?? 9) - (TIER_RANK[y[0]] ?? 9))[0];
  const uid = currentUser()?.uid;
  let tid = uid ? hashString(uid) % 100000 : loadPref('trainerId', null);
  if (tid == null) { tid = Math.floor(Math.random() * 100000); savePref('trainerId', tid); }
  const info = partnerInfo(all.partner);
  return {
    handle: myHandle() || 'trainer',
    trainerId: String(tid).padStart(5, '0'),
    since: longDate(dates.length ? dates.sort()[0] : S.today),
    partner: info ? { name: info.name, level: info.level, emoji: info.emoji, via: info.via, progress: info.progress } : null,
    total: Object.keys(combinedDex(all).caught).length,
    totalMax: CATCH.total,
    perSport: ENABLED_SPORTS.map((sp) => ({ emoji: SPORTS[sp].emoji, label: sp, n: dexCounts(all.sports[sp]).caught })),
    shinies,
    bestStreak: Math.max(0, ...MODES.map((m) => loadStats(m.id).maxStreak || 0)),
    favBall: fav ? ballById(fav[0]) : null,
    badges: list.filter((b) => b.kind !== 'gym').map((b) => ({ icon: b.icon, earned: b.earned, gold: b.gold })),
    gymBadges: list.filter((b) => b.kind === 'gym').map((b) => ({ icon: b.icon, earned: b.earned })),
    badgeCount: list.filter((b) => b.earned).length,
    url: location.hostname === 'localhost' ? 'playmodidex.com' : location.host,
    hashtag: GAME.hashtag,
  };
}

let cardUrl = null;
async function openTrainerCard() {
  const dlg = $('#dlg-partner');
  openDialog(dlg, '<h2 id="partner-title">🪪 Trainer Card</h2><p class="small">Making your card…</p>');
  let blob;
  try {
    const cv = await drawTrainerCard(trainerCardData());
    blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  } catch (e) {
    console.warn('[card]', e);
  }
  if (!dlg.open) return; // closed while the card was being drawn
  if (!blob) { dlg.querySelector('.small').textContent = "Couldn't make the card on this device."; return; }
  if (cardUrl) URL.revokeObjectURL(cardUrl);
  cardUrl = URL.createObjectURL(blob);
  const file = new File([blob], 'modidex-trainer-card.png', { type: 'image/png' });
  const canShare = !!navigator.canShare?.({ files: [file] });
  openDialog(dlg, `<h2 id="partner-title">🪪 Trainer Card</h2>
    <img class="trainer-card-img" src="${cardUrl}" alt="Your ModiDex trainer card">
    <div class="btn-row">
      ${canShare ? '<button class="btn btn-primary" type="button" id="tc-share">Share</button>' : ''}
      <a class="btn${canShare ? '' : ' btn-primary'}" id="tc-save" href="${cardUrl}" download="modidex-trainer-card.png">Save image</a>
    </div>
    ${myHandle() ? '' : '<p class="small">Sign in and pick a username to put your name on the card.</p>'}
    ${loadDex().partner ? '' : '<p class="small">Choose a partner to show it on your card.</p>'}`);
  dlg.querySelector('#tc-share')?.addEventListener('click', async () => {
    try { await navigator.share({ files: [file], text: `My ${GAME.name} Trainer Card! ${siteUrl()} ${GAME.hashtag}` }); } catch { /* cancelled */ }
  });
}

// ---------- gyms ----------
const gymState = () => loadDex().gyms || { beaten: {} };
const thisWeek = () => weekStart(S.today);
const nextMonday = () => addDays(thisWeek(), 7);
const typeEmoji = (t) => typeInfo(t).emoji;
const typeChips = (types) => types.map((t) => `<span class="type-dot" style="--type:${typeInfo(t).color}" title="${esc(t)}">${typeEmoji(t)}</span>`).join('');

// Athletes you've caught (any sport), strongest first.
function myRoster() {
  const all = loadDex();
  const ids = new Set();
  for (const sp of ENABLED_SPORTS) for (const e of Object.values(all.sports[sp]?.caught || {})) if (e?.athleteId) ids.add(e.athleteId);
  return [...ids].map((id) => S.data.byId.get(id)).filter((a) => a?.stats).sort((x, y) => statTotal(y) - statTotal(x));
}

// The gym card on the main page.
function renderGymCard() {
  const el = $('#gym-area');
  if (!el) return;
  const st = gymState();
  const g = currentGym(st);
  const won = Object.keys(st.beaten || {}).length;
  if (!g) {
    el.innerHTML = `<div class="gym-card done"><div class="gym-head"><span class="gym-icon">🏆</span><div><b>All 8 gym badges!</b><span class="small">You beat every gym leader. Practice battles are still open.</span></div></div>
      <button class="btn btn-block" type="button" data-open-gyms>🏟️ Gyms & practice</button></div>`;
    return;
  }
  const can = canChallenge(st, thisWeek());
  const have = myRoster().length;
  const need = catchesNeeded(g);
  const short = have < need;
  const last = st.last && st.week === thisWeek() ? st.last : null;
  const lastLine = last ? (last.won ? `You beat ${gymByNoName(last.gym)} this week!` : `${gymByNoName(last.gym)} won this week's challenge.`) : '';
  el.innerHTML = `<div class="gym-card">
    <div class="gym-head"><span class="gym-icon">${typeEmoji(g.type)}</span><div><b>🏟️ Gym ${g.no}: ${esc(g.leader)}</b>
      <span class="small">${g.type} type · ${g.size} vs ${g.size} · ${won}/8 badges</span></div></div>
    ${can && short ? `<div class="need-bar" aria-label="${have} of ${need} catches"><span style="width:${Math.round((100 * have) / need)}%"></span></div>` : ''}
    <p class="small">${!can ? `${esc(lastLine)} Next challenge ${esc(dayLabel(nextMonday()))}. Practice anytime.`
      : short ? `${esc(g.leader)} accepts challengers with ${need} catches. You have ${have}. Catch more in today's or past puzzles.`
      : 'Your weekly gym challenge is ready.'}</p>
    <button class="btn ${can && !short ? 'btn-primary' : ''} btn-block" type="button" data-open-gyms>${can && !short ? `Challenge ${esc(g.leader)}` : 'Gyms & practice'}</button>
  </div>`;
}
const gymByNoName = (no) => GYMS.find((x) => x.no === no)?.leader || 'The gym leader';

function openGyms() {
  const st = gymState();
  const g = currentGym(st);
  const have = myRoster().length;
  const weekOk = !!g && canChallenge(st, thisWeek());
  const enough = !!g && have >= catchesNeeded(g);
  const can = weekOk && enough;
  const rows = GYMS.map((x) => {
    const beat = st.beaten?.[x.no];
    const status = beat ? `<span class="gym-st won">${x.badge.icon} ${shortDate(beat)}</span>` : x === g ? '<span class="gym-st next">Next</span>' : '<span class="gym-st">🔒</span>';
    return `<li class="gym-row${x === g ? ' is-next' : ''}${beat ? ' is-won' : ''}"><span class="gym-icon sm">${typeEmoji(x.type)}</span>
      <span class="gym-row-main"><b>${x.no}. ${esc(x.leader)}</b><span class="small">${x.type} · ${esc(x.badge.name)} · ${x.size} vs ${x.size} · ${catchesNeeded(x)} catches</span></span>${status}</li>`;
  }).join('');
  openDialog($('#dlg-gym'), `
    <h2 id="gym-title">🏟️ Gym Challenge</h2>
    <p class="small">Beat the 8 gym leaders in order with a team of athletes you've caught. Each leader only accepts challengers who have caught enough athletes (any sport). You get <b>one challenge a week</b> (resets Monday at midnight ET). Practice battles are unlimited.</p>
    ${g ? `<div class="gym-next">
      <p class="gym-taunt"><b>${esc(g.leader)}:</b> “${esc(g.taunt)}”</p>
      <p class="small">${typeEmoji(g.type)} ${g.type}-type team · Their lineup is Lv ${g.level + (g.foeBonus || 0)}–${g.level + (g.foeBonus || 0) + 1}, yours fights at Lv ${g.level} · Pick ${g.size} athletes. Types matter: pick athletes strong against ${g.type}.</p>
      <div class="btn-row">
        ${can ? `<button class="btn btn-primary" type="button" id="gym-go">Challenge ${esc(g.leader)}</button>`
          : !weekOk ? `<button class="btn" type="button" disabled>Next challenge ${esc(dayLabel(nextMonday()))}</button>`
          : `<button class="btn" type="button" disabled>${have}/${catchesNeeded(g)} catches</button>`}
        <button class="btn" type="button" id="gym-practice">Practice</button>
      </div>
    </div>` : `<div class="gym-next"><p>🏆 You've earned all 8 gym badges. Practice battles are still open.</p>
      <div class="btn-row"><button class="btn" type="button" id="gym-practice">Practice</button></div></div>`}
    <ul class="gym-list">${rows}</ul>`);
  $('#dlg-gym').querySelector('#gym-go')?.addEventListener('click', () => openTeamPicker('challenge'));
  $('#dlg-gym').querySelector('#gym-practice')?.addEventListener('click', () => openTeamPicker('practice'));
}

// Matchup hint for one athlete against a gym's type.
function matchupTag(a, type) {
  const types = typesOf(a);
  const off = Math.max(...types.map((t) => effectiveness(t, [type])));
  const def = effectiveness(type, types);
  if (off >= 2 && def <= 1) return '<span class="mu good">💪 Strong</span>';
  if (def >= 2) return `<span class="mu bad">⚠️ Weak to ${esc(type)}</span>`;
  if (off >= 2) return '<span class="mu good">💪 Hits hard</span>';
  if (def < 1) return '<span class="mu ok">🛡️ Resists</span>';
  if (off < 1) return '<span class="mu bad">Struggles</span>';
  return '';
}

function openTeamPicker(mode, picked = null) {
  const st = gymState();
  const g = currentGym(st) || GYMS[GYMS.length - 1];
  const roster = myRoster();
  const partnerId = loadDex().partner?.athleteId;
  let team = picked || (st.team || []).filter((id) => roster.some((a) => a.id === id)).slice(0, g.size);
  const dlg = $('#dlg-gym');
  const draw = () => {
    const rows = roster.map((a) => {
      const i = team.indexOf(a.id);
      return `<li><button class="pick-row${i >= 0 ? ' on' : ''}" type="button" data-ath="${esc(a.id)}">
        <span class="pick-no">${i >= 0 ? i + 1 : ''}</span>
        <span class="pick-main"><b>${esc(a.name)}</b>${a.id === partnerId ? ' 🤝' : ''}<span class="small">${SPORTS[a.sport]?.emoji || ''} ${a.comp ? esc(a.comp.name) : ''} · ${statTotal(a)}</span></span>
        <span class="pick-side"><span>${typeChips(typesOf(a))}</span>${matchupTag(a, g.type)}</span></button></li>`;
    }).join('');
    const ready = team.length === g.size;
    openDialog(dlg, `
      <h2 id="gym-title">${mode === 'practice' ? '🥅 Practice battle' : `${typeEmoji(g.type)} Gym ${g.no}: ${esc(g.leader)}`}</h2>
      <p class="small">${mode === 'practice' ? `Battle a random lineup at gym ${g.no}'s level. Nothing is at stake.` : 'This uses your challenge for this week.'}
        Pick ${g.size} athletes in lineup order: #1 goes first. If your partner 🤝 is a higher level than the gym, it fights up to 5 levels higher.</p>
      ${roster.length < g.size ? `<p class="invite-note">You need ${g.size} caught athletes and have ${roster.length}. Catch more in today's puzzles or Past puzzles.</p>` : ''}
      <div class="pick-bar"><span>Team <b>${team.length}/${g.size}</b></span>
        <button class="btn btn-sm" type="button" id="pick-clear"${team.length ? '' : ' disabled'}>Clear</button>
        <button class="btn btn-sm btn-primary" type="button" id="pick-go"${ready ? '' : ' disabled'}>${mode === 'practice' ? 'Start practice' : 'Start challenge'}</button></div>
      <ul class="pick-list">${rows || '<li class="small">No catches yet.</li>'}</ul>`);
    dlg.querySelectorAll('[data-ath]').forEach((b) => (b.onclick = () => {
      const id = b.dataset.ath;
      if (team.includes(id)) team = team.filter((x) => x !== id);
      else if (team.length < g.size) team = [...team, id];
      else return toast(`Your team is full (${g.size}). Tap someone to remove them.`);
      const top = dlg.scrollTop;
      draw();
      dlg.scrollTop = top;
    }));
    dlg.querySelector('#pick-clear').onclick = () => { team = []; draw(); };
    dlg.querySelector('#pick-go').onclick = () => startBattle(mode, g, team);
  };
  draw();
}

function startBattle(mode, g, ids) {
  const all = loadDex();
  const st = all.gyms || { beaten: {} };
  if (mode === 'challenge') {
    if (!canChallenge(st, thisWeek())) return toast('You already used this week\'s challenge.');
    if (myRoster().length < catchesNeeded(g)) return toast(`${g.leader} accepts challengers with ${catchesNeeded(g)} catches.`);
    if (!confirm(`Challenge ${g.leader}? This uses your gym challenge for this week.`)) return;
  }
  const athletes = ids.map((id) => S.data.byId.get(id)).filter(Boolean);
  const p = all.partner;
  const me = playerTeam(g, athletes, p, p ? levelOf(p) : 0);
  const foe = mode === 'challenge' ? leaderTeam(g, S.data.athletes) : practiceTeam(g, S.data.athletes, `${Date.now()}`);
  const who = currentUser()?.uid || loadPref('trainerId', 'local');
  const seed = mode === 'challenge' ? `${who}:${g.no}:${thisWeek()}:${ids.join(',')}` : `${Math.random()}`;
  const result = runBattle(me, foe, seed);
  // Save before the playback, so closing or reloading can't undo a challenge.
  all.gyms = { ...st, beaten: { ...(st.beaten || {}) }, team: ids };
  if (mode === 'challenge') {
    all.gyms.week = thisWeek();
    all.gyms.last = { gym: g.no, won: result.winner === 'me', date: S.today };
    if (result.winner === 'me') all.gyms.beaten[g.no] = S.today;
  }
  saveDex(all);
  setTimeout(pushProgress, 0);
  playBattle(mode, g, me, foe, result);
}

let battleTimer = null;
function playBattle(mode, g, me, foe, result) {
  const dlg = $('#dlg-gym');
  const foeName = mode === 'practice' ? 'The wild lineup' : g.leader;
  openDialog(dlg, `
    <h2 id="gym-title">${mode === 'practice' ? '🥅 Practice battle' : `${typeEmoji(g.type)} ${esc(g.leader)}`}</h2>
    <p class="gym-taunt">${mode === 'practice' ? 'A wild lineup appeared!' : `“${esc(g.taunt)}”`}</p>
    <div class="battle">
      <div class="bt-side foe" id="bt-foe"></div>
      <div class="bt-log" id="bt-log" aria-live="polite"></div>
      <div class="bt-side me" id="bt-me"></div>
    </div>
    <div class="btn-row" id="bt-controls"><button class="btn btn-block" type="button" id="bt-skip">Skip to result</button></div>
    <div id="bt-result"></div>`);
  const teams = { me: me.map((f) => ({ ...f, hp: f.maxHp, out: false })), foe: foe.map((f) => ({ ...f, hp: f.maxHp, out: false })) };
  const active = { me: 0, foe: 0 };
  const log = [];
  const side = (k) => {
    const f = teams[k][active[k]];
    const bench = teams[k].map((x, i) => `<i class="${x.out ? 'out' : i === active[k] ? 'on' : ''}"></i>`).join('');
    const pct = f ? Math.round((100 * f.hp) / f.maxHp) : 0;
    return f ? `<div class="bt-name"><b>${esc(f.name)}</b>${f.partner ? ' 🤝' : ''} <span class="small">Lv ${f.level}</span> ${typeChips(f.types)}</div>
      <div class="hp"><span class="${pct <= 20 ? 'low' : pct <= 50 ? 'mid' : ''}" style="width:${pct}%"></span></div>
      <div class="bt-meta small"><span>${f.hp}/${f.maxHp} HP</span><span class="bench">${bench}</span></div>` : '';
  };
  const paint = () => {
    dlg.querySelector('#bt-foe').innerHTML = side('foe');
    dlg.querySelector('#bt-me').innerHTML = side('me');
    dlg.querySelector('#bt-log').innerHTML = log.slice(-3).map((l, i, arr) => `<p class="${i === arr.length - 1 ? 'new' : ''}">${l}</p>`).join('');
  };
  const nameOf = (k) => teams[k][active[k]]?.name || '';
  const apply = (e) => {
    if (e.t === 'send') {
      active[e.side] = e.i;
      log.push(e.side === 'me' ? `Go, <b>${esc(nameOf('me'))}</b>!` : `${esc(foeName)} sends out <b>${esc(nameOf('foe'))}</b>!`);
    } else if (e.t === 'move') {
      const target = e.side === 'me' ? 'foe' : 'me';
      teams[target][active[target]].hp = e.hp;
      let line = `<b>${esc(nameOf(e.side))}</b> used ${typeEmoji(e.type)} ${esc(e.move)}!`;
      if (e.crit) line += ' A clutch hit!';
      if (e.mult >= 2) line += " It's super effective!";
      else if (e.mult < 1) line += " It's not very effective…";
      log.push(line);
    } else if (e.t === 'faint') {
      teams[e.side][e.i].out = true;
      log.push(`<b>${esc(teams[e.side][e.i].name)}</b> is out of the game!`);
    }
  };
  let i = 0;
  const finish = () => {
    clearInterval(battleTimer);
    battleTimer = null;
    while (i < result.events.length) apply(result.events[i++]);
    paint();
    dlg.querySelector('#bt-controls').remove();
    const won = result.winner === 'me';
    const foeTeam = foe.map((f) => `${esc(f.name)} ${typeChips(f.types)}`).join(' · ');
    let html;
    if (mode === 'practice') {
      html = `<p class="bt-final ${won ? 'won' : 'lost'}">${won ? '🎉 You won the practice battle!' : '😤 The wild lineup won this one.'}</p>
        <div class="btn-row"><button class="btn btn-primary" type="button" id="bt-again">Battle again</button><button class="btn" type="button" data-open-gyms>Back to gyms</button></div>`;
    } else if (won) {
      html = `<p class="bt-final won">🎉 You beat ${esc(g.leader)}!</p>
        <p class="gym-taunt"><b>${esc(g.leader)}:</b> “${esc(g.win)}”</p>
        <p class="badge-earned">${g.badge.icon} <b>${esc(g.badge.name)}</b> earned!</p>
        <p class="small">${g.no < GYMS.length ? `Next up: ${esc(GYMS[g.no].leader)} (${GYMS[g.no].type}), from ${esc(dayLabel(nextMonday()))}.` : "That's all 8 gym badges. Champion!"}</p>`;
    } else {
      html = `<p class="bt-final lost">${esc(g.leader)} wins this time.</p>
        <p class="gym-taunt"><b>${esc(g.leader)}:</b> “${esc(g.lose)}”</p>
        <p class="small">Their team: ${foeTeam}</p>
        <p class="small">Rematch from ${esc(dayLabel(nextMonday()))}. Practice anytime.</p>`;
    }
    dlg.querySelector('#bt-result').innerHTML = html;
    dlg.querySelector('#bt-again')?.addEventListener('click', () => openTeamPicker('practice', me.map((f) => f.id)));
    if (mode === 'challenge') { checkBadges(); renderGymCard(); }
  };
  paint();
  dlg.querySelector('#bt-skip').onclick = finish;
  clearInterval(battleTimer);
  battleTimer = setInterval(() => {
    if (!dlg.open || !dlg.querySelector('#bt-log')) { clearInterval(battleTimer); battleTimer = null; if (mode === 'challenge') { checkBadges(); renderGymCard(); } return; }
    if (i >= result.events.length) return finish();
    apply(result.events[i++]);
    paint();
  }, 900);
}

// ---------- trades ----------
// Trading a creature registers it as caught in the friend's Dex (your Dex keeps it too,
// like a real creature encyclopedia). Some creatures evolve when traded.
const TRADE_EVOLVE = { 64: 65, 67: 68, 75: 76, 93: 94 };
const TRADES_PER_WEEK = 3;
const athleteFor = (sport, n) => S.data.athletes.find((a) => a.sport === sport && a.comp?.dex === n) || null;
const tradesLeft = () => {
  const log = loadDex().tradeLog;
  return TRADES_PER_WEEK - (log?.week === thisWeek() ? log.n : 0);
};
const creatureLabel = (it) => `${SPORTS[it.sport]?.emoji || ''} #${dex3(it.n)} ${GEN1[it.n - 1]}`;

// Adds a traded creature to your Dex. Returns { evolved: [from, to] | null }.
function receiveCreature(it, fromName) {
  const a0 = it && ENABLED_SPORTS.includes(it.sport) ? athleteFor(it.sport, Number(it.n)) : null;
  if (!a0) return { evolved: null }; // not a real creature in this game: ignore
  it = { sport: it.sport, n: Number(it.n), athleteId: a0.id };
  fromName = String(fromName || 'friend').slice(0, 15);
  const all = loadDex();
  const sd = sportDex(all, it.sport);
  const add = (n, athleteId) => {
    if (!sd.caught[n]) sd.caught[n] = { date: S.today, athleteId, ball: 'trade', from: fromName };
    sd.seen[n] ||= { date: S.today, athleteId };
  };
  add(it.n, it.athleteId);
  let evolved = null;
  const evo = TRADE_EVOLVE[it.n];
  const evoAthlete = evo ? athleteFor(it.sport, evo) : null;
  if (evoAthlete) { add(evo, evoAthlete.id); evolved = [it.n, evo]; }
  saveDex(all);
  setTimeout(pushProgress, 0);
  return { evolved };
}

function announceTrade(it, fromName, r) {
  if (!it || !GEN1[it.n - 1]) return;
  toast(`🔁 Trade complete! ${GEN1[it.n - 1]} from @${fromName} is in your ${it.sport} Dex.`, 4000);
  if (r.evolved) {
    const a = S.data.byId.get(it.athleteId);
    setTimeout(() => showEvolution(r.evolved, a ? typeEmoji(typesOf(a)[0]) : '🔁'), 1200);
  }
  setTimeout(() => checkBadges(), 800);
}

// Sender's side: add what you asked for once the friend accepts.
async function finishTrades() {
  try {
    await processAnsweredTrades((t) => announceTrade(t.get, t.toName, receiveCreature(t.get, t.toName)));
  } catch (e) { console.warn('[trades]', e); }
}

// After syncing: finish your accepted trades and mention new offers.
async function checkTrades() {
  if (!currentUser() || !myHandle()) return;
  await finishTrades();
  try {
    const n = (await incomingTrades()).length;
    if (n) toast(`🔁 You have ${n} trade offer${n > 1 ? 's' : ''}. Open Profile → Friends.`, 4000);
  } catch { /* rules not published yet */ }
}

async function renderTradeOffers(el) {
  if (!el) return;
  let inc = [];
  let out = [];
  try { [inc, out] = await Promise.all([incomingTrades(), outgoingTrades()]); } catch { return; }
  out = out.filter((t) => t.status === 'offered');
  if (!inc.length && !out.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<h3>🔁 Trades</h3><ul class="people">
    ${inc.map((t, i) => `<li class="person trade-row"><span class="person-name"><b>@${esc(t.fromName)}</b> offers ${esc(creatureLabel(t.give))}${t.get ? ` for your ${esc(creatureLabel(t.get))}` : ' as a gift'}</span>
      <span class="person-actions"><button class="btn btn-primary btn-sm" data-tacc="${i}">Accept</button><button class="btn btn-sm" data-tdec="${i}">Decline</button></span></li>`).join('')}
    ${out.map((t, i) => `<li class="person trade-row"><span class="person-name small">Waiting on @${esc(t.toName)}: your ${esc(creatureLabel(t.give))}${t.get ? ` for their ${esc(creatureLabel(t.get))}` : ' (gift)'}</span>
      <span class="person-actions"><button class="btn btn-sm" data-tcan="${i}">Cancel</button></span></li>`).join('')}
  </ul>`;
  el.querySelectorAll('[data-tacc],[data-tdec]').forEach((b) => (b.onclick = async () => {
    const t = inc[Number(b.dataset.tacc ?? b.dataset.tdec)];
    const accept = b.dataset.tacc !== undefined;
    if (accept && t.get && !(ENABLED_SPORTS.includes(t.get.sport) && sportDex(loadDex(), t.get.sport).caught[t.get.n])) return toast("You don't have the creature they asked for anymore.");
    el.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    try {
      if (accept) {
        const r = receiveCreature(t.give, t.fromName); // safe to repeat if answering fails
        await answerTrade(t, true);
        announceTrade(t.give, t.fromName, r);
      } else {
        await answerTrade(t, false);
        toast('Trade declined.');
      }
    } catch (err) { toast(socialError(err)); }
    renderTradeOffers(el);
  }));
  el.querySelectorAll('[data-tcan]').forEach((b) => (b.onclick = async () => {
    try { await cancelTrade(out[Number(b.dataset.tcan)]); toast('Trade cancelled.'); }
    catch (err) {
      if (err?.message === 'trade-accepted') await finishTrades(); // they accepted first: finish it
      else toast(socialError(err));
    }
    renderTradeOffers(el);
  }));
}

// Build a trade with a friend: pick what you get (optional) and what you give.
function openTrade(p, pick = { get: null, give: null }) {
  const theirs = personDexes(p);
  const all = loadDex();
  const opts = (fromMine) => {
    const out = [];
    for (const sp of ENABLED_SPORTS) {
      const mineCaught = new Set(Object.keys(all.sports[sp]?.caught || {}).map(Number));
      const theirCaught = new Set(theirs[sp]?.caught || []);
      const [src, other] = fromMine ? [mineCaught, theirCaught] : [theirCaught, mineCaught];
      for (const n of [...src].sort((x, y) => x - y)) {
        if (other.has(n)) continue; // they already have it
        const a = athleteFor(sp, n);
        if (a) out.push({ sport: sp, n, athleteId: a.id });
      }
    }
    return out;
  };
  const getList = opts(false);
  const giveList = opts(true);
  const same = (x, y) => x && y && x.sport === y.sport && x.n === y.n;
  const cell = (it, kind) => `<li><button class="dex-cell caught pick${same(pick[kind], it) ? ' is-partner' : ''}" type="button" data-${kind}="${it.sport}:${it.n}">
    <span class="dex-no">${SPORTS[it.sport].emoji} #${dex3(it.n)}</span><span class="dex-name">${esc(GEN1[it.n - 1])}</span>
    <span class="dex-via">${esc(S.data.byId.get(it.athleteId)?.name || '')}</span></button></li>`;
  const left = tradesLeft();
  const dlg = $('#dlg-person');
  openDialog(dlg, `
    <h2 id="person-title">🔁 Trade with @${esc(p.handle)}</h2>
    <p class="small">Pick one of yours to send, and one of theirs to ask for (or leave it as a gift). When they accept, each creature is added to the other's Dex. You keep yours too. Some creatures evolve when traded! You can send ${TRADES_PER_WEEK} trade offers a week (${Math.max(0, left)} left).</p>
    <div class="trade-summary">
      <div><span class="small">You send</span><b>${pick.give ? esc(creatureLabel(pick.give)) : '—'}</b></div>
      <span>⇄</span>
      <div><span class="small">You get</span><b>${pick.get ? esc(creatureLabel(pick.get)) : 'Nothing (gift)'}</b></div>
    </div>
    <div class="btn-row"><button class="btn btn-primary" type="button" id="trade-send"${pick.give && left > 0 ? '' : ' disabled'}>Send offer</button></div>
    <h3>You get <span class="small">(from @${esc(p.handle)}, ones you don't have)</span></h3>
    ${getList.length ? `<ul class="dex-grid pick-grid">${getList.map((it) => cell(it, 'get')).join('')}</ul>` : '<p class="small">They haven\'t caught anything you\'re missing.</p>'}
    <h3>You send <span class="small">(ones they don't have)</span></h3>
    ${giveList.length ? `<ul class="dex-grid pick-grid">${giveList.map((it) => cell(it, 'give')).join('')}</ul>` : '<p class="small">You haven\'t caught anything they\'re missing.</p>'}`);
  const find = (list, v) => { const [sp, n] = v.split(':'); return list.find((x) => x.sport === sp && x.n === Number(n)); };
  dlg.querySelectorAll('[data-get]').forEach((b) => (b.onclick = () => { const it = find(getList, b.dataset.get); openTrade(p, { ...pick, get: same(pick.get, it) ? null : it }); }));
  dlg.querySelectorAll('[data-give]').forEach((b) => (b.onclick = () => { const it = find(giveList, b.dataset.give); openTrade(p, { ...pick, give: same(pick.give, it) ? null : it }); }));
  dlg.querySelector('#trade-send').onclick = async () => {
    if (tradesLeft() <= 0) return toast(`You've sent ${TRADES_PER_WEEK} trade offers this week. More on Monday.`);
    try {
      await sendTrade({ to: p.uid, toName: p.handle, give: pick.give, get: pick.get });
      const d = loadDex();
      d.tradeLog = { week: thisWeek(), n: (d.tradeLog?.week === thisWeek() ? d.tradeLog.n : 0) + 1 };
      saveDex(d);
      setTimeout(pushProgress, 0);
      toast(`🔁 Trade offer sent to @${p.handle}!`);
      dlg.close();
    } catch (err) { toast(socialError(err)); }
  };
}

// ---------- badges ----------
const shortDate = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function myBadges() {
  const all = loadDex();
  return { all, list: badgeStatus(badgeFacts(all, MODES.map((m) => loadStats(m.id)), loadHistory()), all.badges) };
}

// Saves any newly earned badges and announces them. Returns the new ones.
function checkBadges({ announce = true } = {}) {
  if (!S.data) return [];
  const { all, list } = myBadges();
  const fresh = [];
  for (const b of list) {
    if (b.earned && !all.badges[b.id]) { all.badges[b.id] = S.today; fresh.push(`${b.icon} ${b.name}`); }
    if (b.gold && !all.badges[`${b.id}.gold`]) { all.badges[`${b.id}.gold`] = S.today; fresh.push(`🥇 Gold ${b.name}`); }
  }
  if (!fresh.length) return fresh;
  saveDex(all);
  setTimeout(pushProgress, 0);
  if (announce) announceBadges(fresh);
  return fresh;
}

function awardBadge(id) {
  const all = loadDex();
  if (all.badges[id]) return;
  all.badges[id] = S.today;
  saveDex(all);
  setTimeout(pushProgress, 0);
  const b = badgeById(id);
  announceBadges([`${b.icon} ${b.name}`]);
}

function announceBadges(names) {
  toast(names.length === 1 ? `🎖️ Badge earned: ${names[0]}!` : `🎖️ ${names.length} badges earned! See them in your Dex.`, 4000);
  if ($('#dlg-dex').open && dexSport === BADGES) openBadges();
}

function badgeCard(b) {
  let hint = b.hint;
  let prog = `${b.cur}/${b.goal}`;
  if (b.kind === 'set') {
    hint = b.set.map((n) => `${b.have.includes(n) ? '✓ ' : ''}${GEN1[n - 1]}`).join(' · ');
    if (b.earned) prog = b.gold ? `🥇 Gold · ${shortDate(b.goldDate || S.today)}` : `Gold: ${ENABLED_SPORTS.map((sp, i) => `${SPORTS[sp].emoji} ${b.perSport[i]}/${b.goal}`).join(' ')}`;
  } else if (b.kind === 'gym') {
    prog = b.earned ? '' : '🔒 Locked';
  } else if (b.earned) {
    prog = '';
  }
  const when = b.earned && b.date && !(b.kind === 'set' && b.gold) ? `Earned ${shortDate(b.date)}` : '';
  return `<li class="badge-card${b.earned ? ' earned' : ''}${b.gold ? ' gold' : ''}">
    <span class="badge-icon" aria-hidden="true">${b.icon}</span>
    <span class="badge-name">${esc(b.name)}</span>
    <span class="badge-hint">${esc(hint)}</span>
    <span class="badge-prog">${[when, prog].filter(Boolean).map(esc).join(' · ')}</span>
  </li>`;
}

function openBadges() {
  dexSport = BADGES;
  checkBadges({ announce: false });
  const { all, list } = myBadges();
  const earned = list.filter((b) => b.earned).length;
  const gold = list.filter((b) => b.gold).length;
  const sets = list.filter((b) => b.kind === 'set');
  const play = list.filter((b) => b.kind === 'play');
  const gymList = list.filter((b) => b.kind === 'gym');
  openDialog($('#dlg-dex'), `
    <h2 id="dex-title">Your 🎖️ Badges</h2>
    <div class="chip-row">${dexTabsHtml(all, BADGES)}</div>
    ${dexActionsHtml(all)}
    <p><b>${earned}</b> of ${list.length} earned${gold ? ` · 🥇 ${gold} gold` : ''}</p>
    <h3>Collection</h3>
    <p class="small">Catch every creature in a set, from any sport. Complete it in all ${ENABLED_SPORTS.length} sports for gold.</p>
    <ul class="badge-grid">${sets.map(badgeCard).join('')}</ul>
    <h3>Play</h3>
    <ul class="badge-grid">${play.map(badgeCard).join('')}</ul>
    <h3>Gyms</h3>
    <p class="small">Beat the 8 gym leaders in order. <button class="link-btn" type="button" data-open-gyms>Open the Gym Challenge</button></p>
    <ul class="badge-grid">${gymList.map(badgeCard).join('')}</ul>`);
  $('#dlg-dex').querySelectorAll('[data-dex-sport]').forEach((b) => (b.onclick = () => openDex('all', b.dataset.dexSport)));
}

// Top of the Table: you lead the group's weekly board, and someone else has scored too.
function checkChamp(members) {
  const me = currentUser()?.uid;
  const scores = members.filter((p) => !p.pending).map((p) => ({ uid: p.uid, pts: boardScore(p, 'week')?.pts || 0 }));
  const mine = scores.find((x) => x.uid === me)?.pts || 0;
  const others = scores.filter((x) => x.uid !== me);
  if (mine > 0 && others.some((x) => x.pts > 0) && others.every((x) => x.pts < mine)) awardBadge('champ');
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
  if (e.target.closest('[data-open-partner]')) return openPartner();
  if (e.target.closest('[data-open-card]')) return openTrainerCard();
  if (e.target.closest('[data-open-gyms]')) return openGyms();
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
  for (const m of MODES) streaks[m.id] = displayStreak(loadStats(m.id), S.todayNo);
  return {
    dex: Object.fromEntries(ENABLED_SPORTS.map((sp) => {
      const sd = sportDex(all, sp);
      return [sp, { caught: nums(sd.caught), seen: nums(sd.seen), shiny: nums(sd.shiny) }];
    })),
    lines: Object.fromEntries(ENABLED_SPORTS.map((sp) => [sp, FAMILIES.filter((f) => f.every((n) => sportDex(all, sp).caught[n])).length])),
    streaks,
    today: { date: S.today, puzzleNo: S.todayNo, results },
    week: weekTotals(loadHistory(), S.today, MODES.map((m) => m.id)),
    alltime: allTimeTotals(Object.fromEntries(MODES.map((m) => [m.id, loadStats(m.id)]))),
    badges: Object.keys(all.badges || {}).sort(),
    partner: all.partner ? { n: all.partner.form, name: GEN1[all.partner.form - 1], level: levelOf(all.partner) } : null,
  };
}

function renderProfileButton() {
  const b = $('#btn-profile');
  const u = currentUser();
  const label = myHandle() || u?.displayName || u?.email || '?';
  b.textContent = u ? (label.trim()[0] || '?').toUpperCase() : '👤';
  b.classList.toggle('signed-in', !!u);
  b.setAttribute('aria-label', u ? 'Your profile' : 'Sign in');
}

const siteUrl = () => `${location.origin}${location.pathname}`;

function socialError(e) {
  const map = {
    invalid: 'Usernames are 3–15 letters, numbers or _.', taken: 'That username is taken.',
    'not-found': 'No one found. Check the spelling.', self: "That's you!", already: "You're already friends.",
    'no-handle': 'Pick a username first (Me tab).', pending: "You've already sent them a request. It'll show here once they accept.", 'group-name': 'Group names need at least 2 characters.', full: 'That group is full.', 'too-many': "You're in the maximum number of groups.", 'not-friends': 'You can only trade with friends.',
  };
  const m = map[e?.message];
  if (m) return m;
  if (e?.code === 'permission-denied') return "That didn't go through. Reload the page and try again.";
  return `Something went wrong${e?.code ? ` (${e.code})` : ''}. Try again.`;
}

function todayLine(p, compact = false) {
  const t = p.today;
  if (!t || t.date !== S.today || !Object.keys(t.results || {}).length) return '<span class="small">Hasn\'t played today</span>';
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
  const tabs = [['me', '👤 Me'], ['friends', '🫂 Friends'], ['groups', '👥 Groups']];
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
    <p class="form-msg" id="handle-msg" role="status" aria-live="polite"></p>
    <div class="btn-row"><button class="btn" type="button" data-open-card>🪪 Trainer Card</button><button class="btn" type="button" data-open-partner>🤝 Partner</button></div>
    <h3>Sync</h3>
    <p>✅ Your Dex (<b>${caughtN}</b> caught), stats and today's games are saved to your profile and sync on any device where you sign in.</p>
    <p class="small">Signed in as ${esc(u.email || u.displayName || 'you')}. Your username, Dex, badges, partner, streaks and daily scores (never the answers) are visible only to your friends and groups.</p>
    <div class="btn-row"><button class="btn" id="btn-signout">Sign out</button></div>
    <p class="small"><button class="link-btn" id="btn-delete-profile">Delete my profile</button> removes your saved data, username and group memberships from our server. Progress on this device stays.</p>`;
  const input = body.querySelector('#handle-input');
  const msg = body.querySelector('#handle-msg');
  const say = (text, bad = false) => { msg.textContent = text; msg.classList.toggle('bad', bad); };
  // Usernames allow a–z, 0–9 and _. Turn spaces, dots and dashes into _ as you type and drop the rest.
  input.addEventListener('input', () => {
    const clean = input.value.toLowerCase().replace(/[\s.\-]+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 15);
    if (clean !== input.value) input.value = clean;
    say('');
  });
  body.querySelector('#handle-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = input.value.trim().toLowerCase();
    if (!HANDLE_RE.test(v)) return say(socialError({ message: 'invalid' }), true);
    const btn = body.querySelector('#handle-form button');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    say('');
    try {
      await claimHandle(v);
      toast(`You're @${v}!`); renderProfileButton(); pushProgress(); await handlePendingLink(); openProfile('me');
    } catch (err) {
      console.warn('[profiles] username save failed:', err);
      say(socialError(err), true);
      btn.disabled = false;
      btn.textContent = prof.handle ? 'Change' : 'Save';
    }
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
    <div id="trades"></div>
    <h3>Friends</h3>
    <ul class="people" id="friend-list"><li class="small">Loading…</li></ul>`;
  body.querySelector('#add-friend-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await sendFriendRequest(body.querySelector('#add-friend').value);
      body.querySelector('#add-friend').value = '';
      if (r.result === 'friends') { toast(`You and @${r.handle} are friends!`); openProfile('friends'); } else toast(`Friend request sent to @${r.handle}!`);
    } catch (err) { toast(socialError(err)); }
  });
  body.querySelector('#copy-friend-link').addEventListener('click', async () => {
    toast((await copyText(`Add me on ModiDex! ${siteUrl()}#add=${prof.handle}`)) ? 'Friend link copied!' : 'Could not copy.');
  });
  try {
    try { await processAnsweredRequests(); } catch { /* finish accepted requests; not critical */ }
    await finishTrades();
    const [reqs, friends] = await Promise.all([incomingRequests(), listFriends()]);
    renderTradeOffers(body.querySelector('#trades'));
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
    ${p.partner?.name ? `<p>🤝 Partner: <b>${esc(p.partner.name)}</b> Lv ${Number(p.partner.level) || 1}</p>` : ''}
    <h3>Today</h3><p class="today-row">${todayLine(p)}</p>
    <h3>Current streaks</h3><p>${streaks}</p>
    ${personBadgesHtml(p)}
    <h3>Their Dex</h3>
    ${sports.length ? `<div class="chip-row">${tabs}</div>
    <p class="small">${sport}: <b>${caught.size}</b> caught · ${seen.size} seen · ✨ ${shiny.size} shiny · 🏅 ${lines} line${lines === 1 ? '' : 's'}</p>
    <ul class="dex-grid">${cells}</ul>` : '<p class="small">No catches yet.</p>'}
    ${friend ? `<div class="btn-row"><button class="btn btn-primary" type="button" id="btn-trade">🔁 Trade with @${esc(p.handle || 'friend')}</button></div>
    <p class="small"><button class="link-btn" id="btn-unfriend">Remove friend</button></p>` : ''}`);
  $('#dlg-person').querySelector('#btn-trade')?.addEventListener('click', () => openTrade(p));
  $('#dlg-person').querySelectorAll('[data-person-sport]').forEach((b) => (b.onclick = () => openPerson(p, { friend, sport: b.dataset.personSport })));
  $('#dlg-person').querySelector('#btn-unfriend')?.addEventListener('click', async () => {
    if (!confirm(`Remove @${p.handle} from your friends?`)) return;
    await removeFriend(p.uid); $('#dlg-person').close(); openProfile('friends');
  });
}

function personBadgesHtml(p) {
  const ids = ALL_BADGES.map((b) => b.id).filter((id) => (p.badges || []).includes(id));
  if (!ids.length) return '';
  const gold = new Set((p.badges || []).filter((id) => id.endsWith('.gold')).map((id) => id.replace(/\.gold$/, '')));
  const chips = ids.map((id) => {
    const b = badgeById(id);
    return `<span class="badge-chip${gold.has(id) ? ' gold' : ''}" title="${esc(`${gold.has(id) ? 'Gold ' : ''}${b.name}`)}">${b.icon} ${esc(b.name)}</span>`;
  }).join('');
  return `<h3>Badges (${ids.length})</h3><div class="badge-chips">${chips}</div>`;
}

let groupTab = 'today';
const BOARD_TABS = [['today', 'Today'], ['week', 'This week'], ['alltime', 'All-time']];

// A member's score on one leaderboard tab, or null if they haven't published it yet.
function boardScore(p, tab) {
  if (tab === 'today') {
    const r = p.today?.date === S.today ? Object.values(p.today.results || {}) : [];
    return { pts: r.reduce((t, x) => t + pointsFor(x), 0), solved: r.filter((x) => x.status === 'won').length, played: r.length };
  }
  if (tab === 'week') {
    if (!p.week) return null;
    return p.week.start === weekStart(S.today) ? p.week : { pts: 0, solved: 0, played: 0 };
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
    week: `Monday ${weekStart(S.today).slice(5).replace('-', '/')} through Sunday. Resets every Monday at midnight ET.`,
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
    if (!testMembers) checkChamp(members);
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
      const r = await sendFriendRequest(value);
      toast(r.result === 'friends' ? `You and @${r.handle} are friends!` : `Friend request sent to @${r.handle}!`);
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
  if (dlg.contains(toastEl)) document.body.appendChild(toastEl); // keep the toast when the dialog re-renders
  dlg.innerHTML = `<div class="dialog-inner"><button class="dialog-x" aria-label="Close" autofocus>✕</button>${html}<button class="btn dialog-close">${dlg.id === 'dlg-help' ? "Let's play" : 'Close'}</button></div>`;
  dlg.querySelectorAll('.dialog-close, .dialog-x').forEach((b) => (b.onclick = () => dlg.close()));
  dlg.onclick = (e) => { if (e.target === dlg) dlg.close(); };
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}

function openHelp() {
  const typeList = Object.entries(TYPES).map(([name, t]) =>
    `<li><span class="type-badge" style="--type:${t.color}">${t.emoji} ${esc(name)}</span><span>${esc(t.fits)}</span></li>`).join('');
  const sports = ENABLED_SPORTS.map((k) => SPORTS[k]);
  const statRows = STATS.map((s) => `<tr><th>${s.label}</th>${sports.map((sp) => `<td>${esc(sp.statHints[s.key])}</td>`).join('')}</tr>`).join('');
  openDialog($('#dlg-help'), `
    <h2 id="help-title">How to play ModiDex</h2>
    <p>Each day there's a mystery athlete for <b>${ENABLED_SPORTS.join(', ').replace(/, ([^,]*)$/, ' and $1')}</b>, plus an <b>All Sports</b> puzzle. The scouting card tells you which <b>original-151 creature they play like</b>, plus their type, athlete ratings and a field-guide bio. Name the athlete in <b>${GAME.maxGuesses} guesses</b>.</p>
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
    <h3>🎖️ Badges</h3>
    <p>Earn badges for collecting sets, like the Starter Trio or the Legendary Birds, and for milestones like streaks, shinies and a first-guess solve. Complete a set in every sport to make it gold. See them all in the Dex under 🎖️ Badges.</p>
    <h3>🤝 Partner</h3>
    <p>Pick any creature you've caught as your partner (Dex → Partner). Every puzzle you finish gives it XP: 6 for a 1st-guess solve down to 1 for a 6th, and 1 just for trying. It levels up and evolves, and friends can see it.</p>
    <h3>🏟️ Gym Challenge</h3>
    <p>Beat ${GYMS.length} gym leaders in order, from ${esc(GYMS[0].leader)} (${GYMS[0].type}) to ${esc(GYMS[GYMS.length - 1].leader)} (${GYMS[GYMS.length - 1].type}). Each leader needs you to have caught more athletes first (${GYMS.map((x) => catchesNeeded(x)).join(', ')}). Pick a team of athletes you've caught. Battles use their ratings and types, so choose athletes strong against the gym's type. You get <b>one challenge a week</b> (resets Monday at midnight ET), and practice battles are unlimited. Each win earns a gym badge.</p>
    <h3>📅 Past puzzles</h3>
    <p>Missed a day? Scroll to the bottom to play any earlier puzzle. Catches go to your Dex and your partner earns XP, but past puzzles don't count toward streaks or leaderboards.</p>
    <h3>👥 Friends, groups & your Trainer Card</h3>
    <p>Sign in (👤) to sync your progress, add friends, trade creatures with them (some evolve when traded!) and join groups with a daily, weekly and all-time leaderboard. Make a shareable 🪪 Trainer Card from the Dex or your profile.</p>
    <h3>Comparing stats</h3>
    <p>After each guess, the card's stat bars show a marker for your guess, and ▲ / ▼ tells you if the mystery athlete is higher or lower in each stat. Tap any earlier guess to compare against it instead.</p>
    <p>When the puzzle ends you'll also see <b>why</b> they play like that creature.</p>
    <h3>Types</h3>
    <ul class="type-list">${typeList}</ul>
    <h3>What the athlete ratings mean</h3>
    <div class="table-wrap"><table class="stat-table"><thead><tr><th></th>${sports.map((sp) => `<th>${sp.emoji} ${sp.label}</th>`).join('')}</tr></thead><tbody>${statRows}</tbody></table></div>
    <p class="small">Athlete ratings are 1–150, based on real performance. They describe the athlete, not the creature. New puzzles drop every day at midnight Eastern Time.</p>`);
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
      <div><b>${displayStreak(s, S.todayNo)}</b><span>Streak</span></div>
      <div><b>${s.maxStreak}</b><span>Best</span></div>
    </div>
    <h3>Guess distribution</h3>
    <div class="dist">${bars}</div>
    <p class="small">Stats are saved on this device, and sync to your profile when you're signed in.</p>`);
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
const toastEl = document.getElementById('toast');
function toast(msg, ms = 2200) {
  const t = toastEl;
  // An open dialog sits above the page, so show the message inside it.
  const open = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
  if (t.parentElement !== open) open.appendChild(t);
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

init();

// Local testing only: lets the developer preview social screens with sample data.
if (location.hostname === 'localhost') window.__modidexTest = { openTrade, receiveCreature, openPerson, openGroup, publicSummary, renderMeTab, openDialog, checkBadges, openBadges, openPartner, openTrainerCard, showEvolution, feedMyPartner, openGyms, openTeamPicker };
