// Accessible autocomplete for the guess box.
import { SPORTS } from './config.js';
import { esc } from './card.js';

export function normalize(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/-/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function score(athlete, q) {
  let best = 0;
  for (const n of [athlete.name, ...(athlete.aliases || [])]) {
    const name = normalize(n);
    if (name === q) return 100;
    if (name.startsWith(q)) best = Math.max(best, 80);
    else if (name.split(' ').some((w) => w.startsWith(q))) best = Math.max(best, 60);
    else if (name.includes(q)) best = Math.max(best, 40);
  }
  return best;
}

export function search(pool, query, exclude = new Set(), limit = 8) {
  const q = normalize(query);
  if (!q) return [];
  return pool
    .filter((a) => !exclude.has(a.id))
    .map((a) => ({ a, s: score(a, q) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || x.a.name.localeCompare(y.a.name))
    .slice(0, limit)
    .map((x) => x.a);
}

/**
 * Wires an <input> + <ul> into a combobox.
 * getPool() returns athletes to search, getExclude() returns ids already guessed,
 * onPick(athlete) is called when the player chooses someone.
 */
export function attachAutocomplete({ input, list, getPool, getExclude, onPick }) {
  let results = [];
  let active = -1;

  function close() {
    list.hidden = true;
    list.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function render() {
    if (!results.length) {
      if (normalize(input.value)) {
        list.innerHTML = `<li class="ac-empty">No match in this mode</li>`;
        list.hidden = false;
      } else close();
      return;
    }
    list.innerHTML = results.map((a, i) => `
      <li id="ac-${i}" role="option" class="ac-item${i === active ? ' is-active' : ''}" aria-selected="${i === active}" data-i="${i}">
        <span class="ac-name">${esc(a.name)}</span>
        <span class="ac-meta">${SPORTS[a.sport]?.emoji || ''} ${esc(a.teamAbbr)} · ${esc(a.position)}</span>
      </li>`).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', `ac-${active}`);
  }

  function update() {
    results = search(getPool(), input.value, getExclude());
    active = results.length ? 0 : -1;
    render();
  }

  function pick(i) {
    const a = results[i];
    if (!a) return;
    input.value = '';
    close();
    onPick(a);
  }

  input.addEventListener('input', update);
  input.addEventListener('focus', () => input.value && update());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault(); active = (active + 1) % results.length; render();
    } else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault(); active = (active - 1 + results.length) % results.length; render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0) pick(active);
    } else if (e.key === 'Escape') {
      close();
    }
  });
  // pointerdown so the pick happens before the input loses focus
  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) { e.preventDefault(); pick(Number(li.dataset.i)); }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!list.contains(e.target) && e.target !== input) close();
  });

  return {
    close,
    submitTop() {
      update();
      if (results.length) pick(Math.max(active, 0));
    },
  };
}
