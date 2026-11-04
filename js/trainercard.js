// Trainer Card: a shareable 1080x1350 image (good for Instagram, X and stories).
// Original design, drawn on a canvas. No official artwork.

const W = 1080;
const H = 1350;
const C = {
  bg: '#0b1020', panel: '#161f3d', panel2: '#1d284d', line: '#2a376a',
  text: '#eef2ff', muted: '#9aa6cf', accent: '#c6ff3d', accent2: '#22d3ee', gold: '#ffd54a',
};
const DISPLAY = "'Russo One', system-ui, sans-serif";
const BODY = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Draws text, shrinking the font until it fits maxW.
function fitText(ctx, text, x, y, maxW, size, family, weight = '') {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${family}`.trim(); s -= 2; } while (ctx.measureText(text).width > maxW && s > 12);
  ctx.fillText(text, x, y);
}

/**
 * data: { handle, trainerId, since, partner: { name, level, emoji, via, progress, note } | null,
 *         total, totalMax, perSport: [{ emoji, label, n }], shinies, bestStreak,
 *         favBall: { icon, name } | null, badges: [{ icon, earned, gold }], gymBadges: [{ icon, earned }],
 *         badgeCount, url, hashtag }
 */
export async function drawTrainerCard(data) {
  try { await Promise.all([document.fonts.load(`64px ${DISPLAY}`), document.fonts.load(`32px ${BODY}`)]); } catch { /* fonts optional */ }
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  // Background with soft glows.
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, col] of [[W / 2, -120, 760, 'rgba(34,211,238,0.22)'], [W, 0, 520, 'rgba(198,255,61,0.10)']]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Card body.
  const M = 48;
  roundRect(ctx, M, M, W - 2 * M, H - 2 * M, 40);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = C.accent;
  ctx.stroke();

  // Header band.
  const L = M + 48;
  const R = W - M - 48;
  ctx.fillStyle = C.accent;
  ctx.font = `56px ${DISPLAY}`;
  ctx.fillText('MODIDEX', L, M + 104);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.muted;
  ctx.font = `30px ${DISPLAY}`;
  ctx.fillText('TRAINER CARD', R, M + 100);
  ctx.textAlign = 'left';
  ctx.fillStyle = C.line;
  ctx.fillRect(L, M + 132, R - L, 3);

  // Name and ID.
  ctx.fillStyle = C.text;
  fitText(ctx, `@${data.handle}`, L, M + 236, R - L, 88, DISPLAY);
  ctx.fillStyle = C.muted;
  ctx.font = `600 30px ${BODY}`;
  ctx.fillText(`ID No. ${data.trainerId}  ·  Trainer since ${data.since}`, L, M + 290);

  // Partner box.
  let y = M + 322;
  roundRect(ctx, L, y, R - L, 230, 28);
  ctx.fillStyle = C.panel2;
  ctx.fill();
  const cx = L + 125;
  const cy = y + 115;
  ctx.beginPath();
  ctx.arc(cx, cy, 86, 0, Math.PI * 2);
  ctx.fillStyle = C.bg;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = data.partner ? C.accent2 : C.line;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = `90px ${BODY}`;
  ctx.fillText(data.partner ? data.partner.emoji : '❔', cx, cy + 32);
  ctx.textAlign = 'left';
  const px = L + 255;
  const pw = R - px - 30;
  ctx.fillStyle = C.muted;
  ctx.font = `800 26px ${BODY}`;
  ctx.fillText('PARTNER', px, y + 58);
  if (data.partner) {
    ctx.fillStyle = C.text;
    fitText(ctx, data.partner.name, px, y + 118, pw - 150, 58, DISPLAY);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.accent;
    ctx.font = `46px ${DISPLAY}`;
    ctx.fillText(`Lv ${data.partner.level}`, R - 30, y + 116);
    ctx.textAlign = 'left';
    roundRect(ctx, px, y + 140, pw, 16, 8);
    ctx.fillStyle = C.bg;
    ctx.fill();
    roundRect(ctx, px, y + 140, Math.max(16, pw * data.partner.progress), 16, 8);
    ctx.fillStyle = C.accent2;
    ctx.fill();
    ctx.fillStyle = C.muted;
    ctx.font = `600 26px ${BODY}`;
    fitText(ctx, data.partner.via, px, y + 196, pw, 26, BODY, '600');
  } else {
    ctx.fillStyle = C.muted;
    ctx.font = `600 34px ${BODY}`;
    ctx.fillText('Choose one in your Dex', px, y + 124);
  }

  // Stat tiles (3 x 2).
  y += 260;
  const tiles = [
    ['📚 Total Dex', `${data.total}/${data.totalMax}`],
    ['🗂️ By sport', data.perSport.map((s) => `${s.emoji}${s.n}`).join(' ')],
    ['🎖️ Badges', `${data.badgeCount}/${data.badges.length + data.gymBadges.length}`],
    ['✨ Shinies', String(data.shinies)],
    ['🔥 Best streak', String(data.bestStreak)],
    ['🎯 Favorite ball', data.favBall ? `${data.favBall.icon} ${data.favBall.name.replace(' Ball', '')}` : '—'],
  ];
  const gap = 16;
  const tw = (R - L - 2 * gap) / 3;
  const th = 124;
  tiles.forEach(([label, value], i) => {
    const tx = L + (i % 3) * (tw + gap);
    const ty = y + Math.floor(i / 3) * (th + gap);
    roundRect(ctx, tx, ty, tw, th, 22);
    ctx.fillStyle = C.bg;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.line;
    ctx.stroke();
    ctx.fillStyle = C.muted;
    fitText(ctx, label, tx + 22, ty + 44, tw - 44, 26, BODY, '600');
    ctx.fillStyle = C.text;
    fitText(ctx, value, tx + 22, ty + 102, tw - 44, 48, DISPLAY);
  });

  // A row of badge circles: earned ones lit with their emoji.
  const badgeRow = (list, top, cols, maxRad) => {
    const cell = (R - L) / cols;
    const rad = Math.min(cell / 2 - 4, maxRad);
    ctx.textAlign = 'center';
    list.forEach((b, i) => {
      const bx = L + (i % cols) * cell + cell / 2;
      const by = top + Math.floor(i / cols) * (2 * rad + 8) + rad;
      ctx.beginPath();
      ctx.arc(bx, by, rad, 0, Math.PI * 2);
      ctx.fillStyle = b.gold ? 'rgba(255,213,74,0.18)' : b.earned ? 'rgba(198,255,61,0.10)' : C.bg;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = b.gold ? C.gold : b.earned ? C.accent : C.line;
      ctx.stroke();
      if (b.earned) {
        ctx.fillStyle = '#fff'; // opaque, so the emoji isn't drawn faded
        ctx.font = `${Math.round(rad * 1.3)}px ${BODY}`;
        ctx.fillText(b.icon, bx, by + rad * 0.46);
      }
    });
    ctx.textAlign = 'left';
  };
  const label = (text, at) => {
    ctx.fillStyle = C.muted;
    ctx.font = `800 24px ${BODY}`;
    ctx.fillText(text, L, at);
  };

  // Gym badges (8), then the badge case (collection + play badges).
  y += 2 * th + gap + 46;
  label(`GYM BADGES  ${data.gymBadges.filter((b) => b.earned).length}/8`, y);
  badgeRow(data.gymBadges, y + 14, 8, 32);
  y += 14 + 64 + 46;
  label('BADGE CASE', y);
  badgeRow(data.badges, y + 14, 14, 24);

  // Footer.
  ctx.textAlign = 'center';
  ctx.fillStyle = C.accent;
  ctx.font = `40px ${DISPLAY}`;
  ctx.fillText(data.url, W / 2, H - M - 70);
  ctx.fillStyle = C.muted;
  ctx.font = `600 28px ${BODY}`;
  ctx.fillText(`Scout athletes. Catch creatures. Daily.  ${data.hashtag}`, W / 2, H - M - 28);
  ctx.textAlign = 'left';
  return cv;
}
