'use strict';
/* The opening and the view from the window (pano.js): real CC0 photographs, gated, skippable, never in the way. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pano = fs.readFileSync(path.join(ROOT, 'pano.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'room.html'), 'utf8');
const build = fs.readFileSync(path.join(ROOT, 'scripts/build.js'), 'utf8');

test('pano.js parses and exposes the window view and the opening', () => {
  const win = {};
  new Function('window', pano)(win);
  assert.equal(typeof win.Pano.windowView, 'function');
  assert.equal(typeof win.Pano.intro, 'function');
  assert.equal(typeof win.Pano.palms, 'function');
  for (const p of Object.values(win.Pano.PANOS)) for (const [suffix, max] of [['.jpg', 450], ['-m.jpg', 150]]) {   // desktop and phone versions
    const f = path.join(ROOT, p.src + suffix);
    assert.ok(fs.existsSync(f), `${p.src + suffix} exists`);
    assert.ok(fs.statSync(f).size < max * 1024, `${p.src + suffix} stays under ${max} KB`);
  }
});

test('the photographs are local files, credited, and nothing else is downloaded', () => {
  assert.doesNotMatch(pano, /https?:\/\/(?!polyhaven\.com)/);
  assert.match(pano, /CC0/);
  assert.doesNotMatch(pano, /\b(GTA|Rockstar|Vice City)\b/i);
});

test('the opening is gated: once per visitor, never with reduced motion, deep links, ?shot or the text view', () => {
  const gate = html.match(/window\.__cityPlay = [^;]+;/s);
  assert.ok(gate, 'gate expression present');
  for (const needle of ['!textOnly', "q.get('intro') !== '0'", "!q.get('shot')", 'location.hash.length < 2', 'prefers-reduced-motion', '!seen'])
    assert.ok(gate[0].includes(needle), `gate checks ${needle}`);
  assert.match(html, /localStorage\.setItem\('city-intro', 'seen'\)/);
  assert.ok(html.includes("window.__cityJs = !textOnly ? load('pano.js')"));   // never fetched by Recruiter Mode or the text view
});

test('the opening has the title, the tagline, an accessible skip control and Escape, and can be replayed', () => {
  assert.ok(html.includes('<h2>Prathamesh Patil</h2><span class="label">Senior Full Stack Engineer</span>'));
  assert.ok(html.includes('Building products. Solving problems. Engineering what’s next.'));
  assert.ok(html.includes('Replay intro'));
  assert.ok(html.includes('lite: lite || touchDev'));   // phones get the light version
  assert.match(html, /<button type="button" class="city-skip" id="citySkip">Skip intro/);
  assert.match(html, /e\.key === 'Escape'/);
  assert.match(html, /id="qCity"/);
});

test('the room does not render under the opening, and failures still fall back to text', () => {
  assert.match(html, /!paused && !cityActive && !document\.hidden/);
  assert.match(html, /if \(cityRun\) cityRun\.skip\(\);/);
});

test('the window shows the photograph, with the painted skyline as the fallback', () => {
  assert.ok(html.includes('window.Pano.windowView('));
  assert.ok(html.includes("keeping the painted city"));
  assert.ok(html.includes('function enterRoom('));   // the camera move into the room
});

test('the build ships pano.js and the photographs, not the old generated city', () => {
  assert.match(build, /copy\('pano\.js'\)/);
  assert.doesNotMatch(build, /city\.(js|html)/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'city.js')));
});
