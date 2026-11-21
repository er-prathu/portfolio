'use strict';
/*
 * Content, SEO and structure checks for the portfolio page (room.html). They read the file as text, so they need no
 * browser. They exist to keep the page honest as it changes: the positioning, the five roles and their dates, the
 * seven-part case studies, no invented numbers, working internal links, and the tags that recruiters' tools read.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'room.html'), 'utf8').replace(/\r\n/g, '\n');
const labJs = fs.readFileSync(path.join(ROOT, 'lab.js'), 'utf8');
const siteCfg = fs.readFileSync(path.join(ROOT, 'site.config.js'), 'utf8');
const text = h => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
const meta = (attr, key) => (html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`)) || [])[1];
const body = html.slice(html.indexOf('<body>'));
const cases = html.slice(html.indexOf('<ul class="cases"'), html.indexOf('class="case-next"'));

test('search tags: title, description, canonical, Open Graph and Twitter card', () => {
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  assert.match(title, /Senior Full Stack Engineer/);
  assert.ok(title.length <= 70, `title is ${title.length} characters`);
  const desc = meta('name', 'description');
  assert.ok(desc && desc.length >= 100 && desc.length <= 175, `description is ${desc && desc.length} characters`);
  assert.match(desc, /8\+ years/);
  assert.match(html, /<link rel="canonical" href="https:\/\/portfolio\.prathpatil3\.workers\.dev\/">/);
  assert.match(html, /<html lang="en"/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  for (const k of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type']) assert.ok(meta('property', k), `missing ${k}`);
  for (const k of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) assert.ok(meta('name', k), `missing ${k}`);
  assert.ok(fs.existsSync(path.join(ROOT, 'og-image.jpg')));
});

test('structured data is valid JSON and describes only the person and the page', () => {
  const raw = (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
  const ld = JSON.parse(raw);
  const person = ld['@graph'].find(n => n['@type'] === 'Person');
  const page = ld['@graph'].find(n => n['@type'] === 'ProfilePage');
  assert.ok(person && page);
  assert.equal(person.name, 'Prathamesh Patil');
  assert.equal(person.jobTitle, 'Senior Software Engineer', 'the structured job title stays the real current title');
  assert.deepEqual(person.sameAs, ['https://www.linkedin.com/in/prathu123', 'https://github.com/er-prathu']);
  assert.ok(!/aggregateRating|review|award/i.test(raw), 'no ratings, reviews or awards');
  for (const k of ['PHP', 'Laravel', 'JavaScript', 'MySQL', 'REST APIs']) assert.ok(person.knowsAbout.includes(k), k);
  for (const bad of ['C#', '.NET', 'Angular', 'Python', 'Go', 'TypeScript']) assert.ok(!person.knowsAbout.includes(bad), bad);
});

test('positioning: the hero message, the supporting line and the title', () => {
  assert.match(text(html), /Building products\. Solving problems\. Engineering what.s next\./);
  assert.match(text(html), /I.m Prathamesh, a Senior Full Stack Engineer with 8\+ years of experience building web applications, backend systems and AI-powered solutions\./);
  assert.match(html, /Senior Full Stack Engineer · Backend · AI Integration/);
  assert.equal((body.match(/<h1[ >]/g) || []).length, 1, 'exactly one h1');
  // the hero calls to action
  for (const label of ['Explore my work', 'View résumé', 'Contact me', 'LinkedIn', 'GitHub']) assert.ok(html.includes(label), label);
});

test('no outdated or unsupported claims', () => {
  const t = text(html) + ' ' + labJs;
  for (const bad of [/\b9\+/, /nine years/i, /Tech Lead/, /Solution Architect/, /\bC#/, /\.NET\b/, /\bAngular\b/, /\bPython\b/, /\bTypeScript\b/]) assert.ok(!bad.test(t), `found ${bad}`);
  assert.ok(!/<img[^>]+(logo|client)/i.test(html), 'no client logos');
  assert.ok(!/testimonial|★|⭐|5 stars|\brated\b/i.test(text(html)), 'no reviews or ratings');
});

test('the six roles and their dates match LinkedIn', () => {
  const tl = html.slice(html.indexOf('<ol class="tl">'), html.indexOf('</ol>', html.indexOf('<ol class="tl">')));
  const roles = [...tl.matchAll(/<li[^>]*data-from="([\d-]+)" data-to="([\w-]+)"[^>]*><time>([^<]+)<\/time><h3>([^<]+)<\/h3><span class="co">([^<]+)<\/span>/g)].map(m => m.slice(1));
  assert.deepEqual(roles.map(r => [r[3], r[4], r[0], r[1]]), [
    ['Senior Software Engineer', 'WebMD · Nolo legal team', '2024-08', 'now'],
    ['Software Developer', 'MediSage', '2023-10', '2024-08'],
    ['Software Engineer', 'The Information Company', '2021-09', '2023-10'],
    ['Senior Software Engineer', 'Neolite Infotech', '2020-01', '2021-09'],
    ['Full-stack Developer', 'Centillion', '2018-06', '2019-08'],
    ['Software Engineer', 'Techfryday', '2017-08', '2018-05'],
  ]);
  assert.deepEqual(roles.map(r => r[2]), ['Aug 2024 — Now', 'Oct 2023 — Aug 2024', 'Sep 2021 — Oct 2023', 'Jan 2020 — Sep 2021', 'Jun 2018 — Aug 2019', 'Aug 2017 — May 2018']);
  assert.match(html, /across six companies/);
  // earlier roles carry no invented responsibilities: only the current role lists bullets
  assert.equal((tl.match(/<ul class="tl-pts">/g) || []).length, 1);
});

test('three featured case studies plus this site, each with the seven required parts', () => {
  const titles = [...cases.matchAll(/<h3 class="cs-h"[^>]*>([^<]+)<\/h3>/g)].map(m => m[1]);
  assert.deepEqual(titles, ['Nolo CMS', 'AI lead qualification engine', 'Figma-to-HTML engineering skill', "Prathamesh's Desk"]);
  const parts = ['Problem', 'My responsibility', 'Technical approach', 'Architecture', 'Engineering decisions', 'Implementation', 'Outcome'];
  for (const body of cases.split('<li class="case" data-case=').slice(1)) {
    const heads = [...body.matchAll(/<section class="doc[^"]*"><h4><span>[^<]*<\/span>([^<]+)<\/h4>/g)].map(m => m[1]).filter(h => parts.includes(h));
    assert.deepEqual(heads, parts);
  }
});

test('case studies state no performance metrics, and WebMD detail stays marked Not public', () => {
  const t = text(cases);
  assert.ok(!/\d\s?%/.test(t), 'no percentages');
  assert.ok(!/\b\d+\s?(x|×)\s/.test(t), 'no multipliers');
  assert.ok(!/\b\d[\d,.]*\s?(ms|seconds?|hours?|users|leads|customers|requests)\b/i.test(t), 'no counts of users, leads or time saved');
  const nolo = cases.slice(cases.indexOf('data-case="0"'), cases.indexOf('data-case="1"'));
  assert.ok((nolo.match(/Not public/g) || []).length >= 4, 'unshared Nolo CMS details are marked Not public');
  // the sample workflow is labelled a simulation, not production
  assert.match(cases, /simulation on sample data<\/b>, not the production system/);
});

test('sections, TV menu and lab links stay consistent', () => {
  const order = (html.match(/const ORDER = \[([^\]]+)\]/) || [])[1].split(',').map(s => s.trim().replace(/'/g, ''));
  const sections = [...html.matchAll(/<section class="sec" id="(\w+)" data-section="\w+"/g)].map(m => m[1]);
  assert.deepEqual(sections, order);
  const menu = (html.match(/const MENU = \[([^;]+)\];/) || [])[1].match(/\['[A-Z ]+', '\w+'\]/g);
  assert.equal(menu.length, order.length);
  assert.equal((html.match(/role="menuitem" data-i="\d"/g) || []).length, order.length);
  for (const sec of order) assert.ok(new RegExp(`const SHOTS[\\s\\S]*?\\b${sec}:\\s*\\{`).test(html) || sec === 'contact', `camera shot for ${sec}`);
  // lab.js links to case studies by index: every index must exist, and the keys used by case buttons must exist
  const idx = [...labJs.split('\n').filter(l => /proj: \[\[/.test(l)).join('\n').matchAll(/\[(\d), '/g)].map(m => +m[1]);
  assert.ok(idx.length >= 6 && Math.max(...idx) < 4, 'lab project links point at existing case studies');
  for (const m of html.matchAll(/data-lab="(\w+)"/g)) assert.ok(new RegExp(`keys: '[^']*\\b${m[1]}\\b`).test(labJs), `lab key ${m[1]}`);
  // the desk objects open the intended sections
  assert.match(html, /hotspot\(lt, 'work', 'Laptop · <b>Projects<\/b>'\)/);
  assert.match(html, /hotspot\(pc, 'lab', 'Computer · <b>Engineering Lab<\/b>'\)/);
  assert.match(html, /hotspot\(nb, 'timeline', 'Notebook/);
  assert.match(html, /hotspot\(books, 'stack', 'Books/);
  assert.match(html, /hotspot\(phone, 'contact', 'Phone/);
});

test('internal links resolve and ids are unique', () => {
  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids: ' + ids.filter((x, i) => ids.indexOf(x) !== i));
  for (const m of body.matchAll(/href="#([^"]*)"/g)) {
    if (m[1] === '' || m[1] === 'home' || m[1] === 'tv') continue;   // #tv is a keyboard control wired in script
    assert.ok(ids.includes(m[1]), `#${m[1]} has no target`);
  }
  assert.ok(!/href="#"/.test(body), 'no dead placeholder links');
  assert.ok(/<a class="skip" href="\/recruiter"/.test(html), 'skip link to Recruiter Mode');
});

test('Recruiter Mode: visible entry, own address, no 3D libraries in the static page, résumé present', () => {
  assert.match(html, /id="modeBtn"[^>]*>[^<]*<span class="long">Recruiter mode<\/span>/);
  assert.match(html, /<html lang="en" class="text-mode">/, 'the static HTML is the readable text version');
  assert.ok(!/<script src="https:\/\/cdn[^"]*three/.test(html), 'three.js is loaded on demand, not by a script tag');
  assert.match(html, /window\.__textOnly/);
  const m = siteCfg.match(/^\s*resumePdf:\s*'([^']*)'/m);
  assert.ok(m && m[1], 'a résumé is configured');
  assert.ok(fs.existsSync(path.join(ROOT, m[1])), 'the résumé file exists');
  assert.equal(fs.readFileSync(path.join(ROOT, m[1])).subarray(0, 5).toString(), '%PDF-');
  // everything a recruiter needs is in the static HTML
  for (const needle of ['id="about"', 'id="timeline"', 'id="work"', 'id="stack"', 'id="contactForm"', 'js-linkedin', 'js-github', 'js-cv']) assert.ok(html.includes(needle), needle);
});

test('sitemap and robots point at the site', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/portfolio\.prathpatil3\.workers\.dev\/<\/loc>/);
  assert.match(fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/portfolio\.prathpatil3\.workers\.dev\/sitemap\.xml/);
});
