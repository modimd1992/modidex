// Spoiler-free share text (emoji grid).
import { GAME } from './config.js';

const SQUARE = { hit: '🟩', close: '🟨', miss: '⬛' };

export function shareText({ mode, puzzleNo, won, rows, cluesUsed, url, catchLine = '' }) {
  const score = won ? `${rows.length}/${GAME.maxGuesses}` : `X/${GAME.maxGuesses}`;
  const lines = [`${GAME.name} #${puzzleNo} ${mode.emoji} ${mode.label} ${score}`];
  if (catchLine) lines.push(catchLine);
  if (cluesUsed > 0) lines.push(`🔎 ${cluesUsed} clue${cluesUsed > 1 ? 's' : ''} used`);
  for (const cells of rows) lines.push(cells.map((c) => SQUARE[c.status]).join(''));
  lines.push('');
  lines.push(`${url}  ${GAME.hashtag}`);
  return lines.join('\n');
}

// Uses the phone's share sheet when available, otherwise copies.
export async function shareOrCopy(text) {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

// One compact post covering every mode played today.
// Each guess becomes one square: 🟩 correct, 🟨 at least half the tiles green/yellow, ⬛ mostly misses.
export function combinedShareText({ puzzleNo, entries, url }) {
  const solved = entries.filter((e) => e.status === 'won').length;
  const lines = [`${GAME.name} #${puzzleNo} · ${solved}/${entries.length} solved`];
  for (const e of entries) {
    const finished = e.status === 'won' || e.status === 'lost';
    if (!finished) { lines.push(`${e.mode.emoji} —`); continue; }
    const score = e.status === 'won' ? `${e.rows.length}/${GAME.maxGuesses}` : `X/${GAME.maxGuesses}`;
    const squares = e.rows.map((r) => {
      if (r.correct) return '🟩';
      const near = r.cells.filter((c) => c.status !== 'miss').length;
      return near * 2 >= r.cells.length ? '🟨' : '⬛';
    }).join('');
    lines.push(`${e.mode.emoji} ${score} ${squares}${e.caught ? ' 🎯' : ''}`);
  }
  lines.push('');
  lines.push(`${url}  ${GAME.hashtag}`);
  return lines.join('\n');
}
