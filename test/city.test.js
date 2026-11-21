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
  for (const p of Object.values(win.Pano.PANOS)) {
    assert.ok(fs.existsSync(path.join(ROOT, p.src)), `${p.src} exists`);
    assert.ok(fs.statSync(path.join(ROOT, p.src)).size < 600 * 1024, `${p.src} stays small`);
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

test('the opening has an accessible skip control and Escape, and can be replayed', () => {
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
