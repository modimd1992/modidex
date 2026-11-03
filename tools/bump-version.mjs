// Stamps a new version on every script and the stylesheet in index.html, so
// browsers never mix an old cached file with a new one after you push code.
//   node tools/bump-version.mjs
// Run it after changing anything in js/ or css/ (data-only changes don't need it).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const v = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const modules = readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js')).sort();

const map = {
  imports: Object.fromEntries(modules.map((f) => [`./js/${f}`, `./js/${f}?v=${v}`])),
};
const mapTag = `<script type="importmap">\n${JSON.stringify(map, null, 2)}\n  </script>`;

const file = join(root, 'index.html');
let html = readFileSync(file, 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
html = html.replace(/<script type="module" src="js\/main\.js[^"]*"><\/script>/,
  `${mapTag}\n  <script type="module" src="js/main.js?v=${v}"></script>`);
html = html.replace(/href="css\/styles\.css[^"]*"/, `href="css/styles.css?v=${v}"`);
writeFileSync(file, html);
console.log(`Version ${v} stamped on ${modules.length} scripts and the stylesheet.`);
