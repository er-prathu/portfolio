// The Cloudflare Worker entry (src/worker.js): /api/contact goes to the contact handler, everything else to the
// static assets binding. Resend and ASSETS are stubs; nothing leaves the machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const sent = [];
globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: 'stub' }), { status: 200 }); };
const assetsSeen = [];
const env = {
  RESEND_API_KEY: 're_test', CONTACT_EMAIL: 'inbox@example.test', CONTACT_FROM_EMAIL: 'Portfolio <onboarding@resend.dev>',
  ASSETS: { fetch: async req => { assetsSeen.push(new URL(req.url).pathname); return new Response('asset', { status: 200 }); } },
};

test('POST /api/contact is handled by the contact form and emails through Resend', async () => {
  const res = await worker.fetch(new Request('https://portfolio.example.workers.dev/api/contact', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1' },
    body: JSON.stringify({ name: 'Ada', email: 'ada@example.test', subject: 'Worker', message: 'Hello from the Worker test.' }),
  }), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(sent.at(-1).reply_to, 'ada@example.test');
  assert.deepEqual(assetsSeen, []);
});

test('GET /api/contact is a 405, not a static file', async () => {
  const res = await worker.fetch(new Request('https://portfolio.example.workers.dev/api/contact'), env);
  assert.equal(res.status, 405);
});

test('GET /api/geo returns the approximate city from request.cf, rounded, never cached', async () => {
  const req = new Request('https://portfolio.example.workers.dev/api/geo');
  Object.defineProperty(req, 'cf', { value: { city: 'Pune', region: 'Maharashtra', country: 'IN', latitude: '18.52043', longitude: '73.85674', timezone: 'Asia/Kolkata' } });
  const res = await worker.fetch(req, env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await res.json(), { ok: true, city: 'Pune', region: 'Maharashtra', country: 'IN', latitude: 18.52, longitude: 73.86, timezone: 'Asia/Kolkata' });
});

test('GET /api/geo without location data says ok:false, so the page falls back to asking', async () => {
  const res = await worker.fetch(new Request('https://portfolio.example.workers.dev/api/geo'), env);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, false);
});

test('other paths fall through to the static assets', async () => {
  const res = await worker.fetch(new Request('https://portfolio.example.workers.dev/missing-page'), env);
  assert.equal(await res.text(), 'asset');
  assert.deepEqual(assetsSeen, ['/missing-page']);
});
