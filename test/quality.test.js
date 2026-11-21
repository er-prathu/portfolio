'use strict';
/* Guards for things a browser would only reveal at runtime: scripts that fail to parse, and the lab's SQL console. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'room.html'), 'utf8');
const lab = fs.readFileSync(path.join(ROOT, 'lab.js'), 'utf8');

test('every inline script in the page parses', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(scripts.length >= 3);
  // the main script is an async IIFE; wrapping it in an async function lets the parser accept its awaits
  scripts.forEach((src, i) => assert.doesNotThrow(() => new Function(`return (async () => {\n${src}\n})`), `inline script ${i + 1}`));
  for (const f of ['lab.js', 'pano.js']) assert.doesNotThrow(() => new Function(fs.readFileSync(path.join(ROOT, f), 'utf8')), f);
});

// pull runSql out of lab.js and run it against sample rows
const src = lab.slice(lab.indexOf('  function runSql('), lab.indexOf('  function sqlConsole('));
const runSql = new Function(src + '\nreturn runSql;')();
const leads = [
  { id: 1, name: 'A', email: 'a@example.test', status: 'new', subject: 'Deposit not returned', message: 'landlord kept my deposit' },
  { id: 2, name: 'B', email: 'b@example.test', status: 'contacted', subject: 'Contract', message: 'builder stopped' },
  { id: 3, name: 'C', email: 'c@example.test', status: 'new', subject: 'Refund for a flight', message: 'airline' },
  { id: 4, name: 'D', email: 'd@example.test', status: 'closed', subject: 'Parking fine', message: 'dispute' },
];
const q = sql => runSql(sql, { leads });

test('SQL console: filters, sorting, limits', () => {
  assert.deepEqual(q("SELECT id FROM leads WHERE status = 'new' ORDER BY id DESC").rows, [[3], [1]]);
  assert.deepEqual(q('SELECT id, name FROM leads LIMIT 2').rows, [[1, 'A'], [2, 'B']]);
  assert.deepEqual(q("SELECT id FROM leads WHERE subject LIKE '%refund%' OR message LIKE '%deposit%'").rows, [[1], [3]]);
  assert.deepEqual(q('SELECT id FROM leads WHERE id IN (1, 4) AND NOT status = \'closed\'').rows, [[1]]);
  assert.deepEqual(q('SELECT id FROM leads WHERE id >= 3').rows, [[3], [4]]);
});

test('SQL console: grouping, counting, distinct', () => {
  assert.deepEqual(q('SELECT status, COUNT(*) AS n FROM leads GROUP BY status ORDER BY n DESC LIMIT 1').rows, [['new', 2]]);
  assert.deepEqual(q('SELECT COUNT(*) FROM leads').rows, [[4]]);
  assert.deepEqual(q('SELECT DISTINCT status FROM leads ORDER BY status').rows, [['closed'], ['contacted'], ['new']]);
  assert.deepEqual(q('SELECT * FROM leads LIMIT 1').header, ['id', 'name', 'email', 'status', 'subject', 'message']);
});

test('SQL console: read-only and helpful errors', () => {
  for (const bad of ['DELETE FROM leads', 'UPDATE leads SET status = 1', 'DROP TABLE leads', "INSERT INTO leads VALUES (1)"])
    assert.throws(() => q(bad), /Read-only/);
  assert.throws(() => q('SELECT nope FROM leads'), /Unknown column/);
  assert.throws(() => q('SELECT id FROM users'), /Unknown table/);
  assert.throws(() => q('SELECT id, status FROM leads GROUP BY status'), /grouped column/);
  assert.throws(() => q("SELECT id FROM leads WHERE"), /ended too early|Expected/);
  assert.throws(() => q("SELECT id FROM leads WHERE name = 'A"), /closing quote/);
  assert.throws(() => q('SELECT id FROM leads LIMIT -1'), /Negative numbers/);
  assert.throws(() => q(''), /SELECT/);
});

test('the lab labels every simulation and never claims production access', () => {
  assert.match(lab, /isolated Web Worker/);
  assert.match(lab, /no database server is connected/);
  assert.match(lab, /runs in the visitor's browser on sample data/i);
});
