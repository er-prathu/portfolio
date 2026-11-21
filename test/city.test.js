'use strict';
/* The city intro (city.js): self-contained, gated, skippable, and never in the way of the content. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const city = fs.readFileSync(path.join(ROOT, 'city.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'room.html'), 'utf8');
const build = fs.readFileSync(path.join(ROOT, 'scripts/build.js'), 'utf8');

test('city.js parses and exposes CityIntro.create', () => {
  const win = {};
  new Function('window', city)(win);
  assert.equal(typeof win.CityIntro.create, 'function');
});

test('city.js downloads nothing: no external URLs, models or texture files', () => {
  assert.doesNotMatch(city, /https?:\/\//);
  assert.doesNotMatch(city, /\.(glb|gltf|jpe?g|png|hdr|ktx2|webp)\b/i);
  assert.doesNotMatch(city, /\b(GTA|Rockstar|Vice City)\b/i);   // an original city, no borrowed names or assets
});

test('city.js has device tiers, a skip, and a slow-device bail-out', () => {
  assert.match(city, /tier === 'high'/);
  assert.match(city, /tier === 'low'/);
  assert.match(city, /skip\(\)/);
  assert.match(city, /finish\('slow'\)/);
  assert.match(city, /InstancedMesh/);
});

test('the intro is gated: once per visitor, never with reduced motion, deep links, ?shot or the text view', () => {
  const gate = html.match(/window\.__cityPlay = [^;]+;/s);
  assert.ok(gate, 'gate expression present');
  for (const needle of ['!textOnly', "q.get('intro') !== '0'", "!q.get('shot')", 'location.hash.length < 2', 'prefers-reduced-motion', '!seen'])
    assert.ok(gate[0].includes(needle), `gate checks ${needle}`);
  assert.match(html, /localStorage\.setItem\('city-intro', 'seen'\)/);
  // city.js (intro and the live window view) is never fetched by Recruiter Mode or the text view
  assert.ok(html.includes("window.__cityJs = !textOnly ? load('city.js')"));
});

test('the intro has an accessible skip control and Escape', () => {
  assert.match(html, /<button type="button" class="city-skip" id="citySkip">Skip intro/);
  assert.match(html, /e\.key === 'Escape'/);
  assert.match(html, /id="qCity"/);   // and it can be replayed
});

test('the room does not render under the intro, and failures still fall back to text', () => {
  assert.match(html, /!paused && !cityActive && !document\.hidden/);
  assert.match(html, /if \(cityRun\) cityRun\.skip\(\);/);
});

test('the window shows the live city, with the painted skyline as the fallback', () => {
  const win = {};
  new Function('window', city)(win);
  assert.equal(typeof win.CityIntro.createWindow, 'function');
  assert.ok(html.includes('CityIntro.createWindow('));
  assert.ok(html.includes('if (live || lite || !window.CityIntro'));          // lite devices keep the painted city
  assert.ok(html.includes('if (!frus.intersectsBox(winBox)) return;'));       // no city render when the window is out of shot
  assert.ok(html.includes('function enterRoom('));                            // the camera move into the room
});

test('the build ships city.js', () => {
  assert.match(build, /copy\('city\.js'\)/);
  assert.doesNotMatch(build, /copy\('city\.html'\)/);   // the dev preview stays local
});
