// Spoiler-free share text (emoji grid).
import { GAME } from './config.js';

const SQUARE = { hit: '🟩', close: '🟨', miss: '⬛' };

export function shareText({ mode, puzzleNo, won, rows, cluesUsed, url }) {
  const score = won ? `${rows.length}/${GAME.maxGuesses}` : `X/${GAME.maxGuesses}`;
  const lines = [`${GAME.name} #${puzzleNo} ${mode.emoji} ${mode.label} ${score}`];
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
