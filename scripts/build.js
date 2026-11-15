'use strict';
/*
 * npm run build → public/ : only the files visitors need, ready to deploy to Cloudflare Pages (or any static host).
 * Server code, tests, .env and tooling are never copied, so they can't be published by accident.
 * The 3D room is the home page (public/index.html); /room.html keeps working too.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public');

const copy = (from, to = from) => {
  const dest = path.join(OUT, to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(ROOT, from), dest);
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);

copy('room.html', 'index.html');
copy('room.html');
copy('tv.config.js');
copy('weather.config.js');
copy('festival.config.js');
copy('festival.dates.js');
copy('site.config.js');
// icons, social preview and crawler files
['favicon.svg', 'apple-touch-icon.png', 'og-image.jpg', 'robots.txt', 'sitemap.xml'].forEach(f => copy(f));

// the résumé: only a real PDF that site.config.js points at (resume/…). A path to a missing file stops the build,
// so the site never ships a "Download résumé" button that 404s.
const siteCfg = fs.readFileSync(path.join(ROOT, 'site.config.js'), 'utf8');
const resumePdf = (siteCfg.match(/^\s*resumePdf:\s*'([^']*)'/m) || [])[1] || '';   // the setting itself, not the example in the comment
if (resumePdf) {
  if (!/^resume\/[^/]+\.pdf$/i.test(resumePdf)) throw new Error(`site.config.js resumePdf must look like 'resume/Your-Name.pdf' (got '${resumePdf}')`);
  if (!fs.existsSync(path.join(ROOT, resumePdf))) throw new Error(`site.config.js points at ${resumePdf}, but that file doesn't exist. Add the PDF or clear resumePdf.`);
  copy(resumePdf);
  console.log(`résumé: ${resumePdf}`);
} else console.log('résumé: none configured (the site offers it on request)');

// models: the glTF JSON (buffer embedded) and its textures; the .gltf/.bin originals aren't loaded by the page
for (const id of fs.readdirSync(path.join(ROOT, 'models'))) {
  const dir = path.join('models', id);
  if (!fs.statSync(path.join(ROOT, dir)).isDirectory()) continue;
  copy(path.join(dir, `${id}_1k.json`));
  const tex = path.join(dir, 'textures');
  if (fs.existsSync(path.join(ROOT, tex))) for (const f of fs.readdirSync(path.join(ROOT, tex))) copy(path.join(tex, f));
}

// Cloudflare Pages response headers
fs.writeFileSync(path.join(OUT, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  X-Frame-Options: SAMEORIGIN',
  '/models/*',
  '  Cache-Control: public, max-age=604800',
  '',
].join('\n'));

let files = 0, bytes = 0;
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p); if (s.isDirectory()) walk(p); else { files++; bytes += s.size; } } })(OUT);
console.log(`public/ ready: ${files} files, ${(bytes / 1048576).toFixed(1)} MB`);
