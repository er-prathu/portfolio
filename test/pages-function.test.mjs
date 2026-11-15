// The Cloudflare Pages Function (functions/api/contact.js), driven with web-standard Request objects the way
// Cloudflare calls it. Resend is replaced by a stub; nothing leaves the machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/contact.js';

const env = { RESEND_API_KEY: 're_test', CONTACT_EMAIL: 'inbox@example.test', CONTACT_FROM_EMAIL: 'Portfolio <contact@example.test>' };
const sent = [];
let resendMode = 'ok';
globalThis.fetch = async (url, init) => {
  assert.equal(url, 'https://api.resend.com/emails');
  if (resendMode === 'fail') return new Response(JSON.stringify({ name: 'validation_error' }), { status: 403 });
  sent.push(JSON.parse(init.body));
  return new Response(JSON.stringify({ id: 'stub_' + sent.length }), { status: 200 });
};

let ipN = 0;
const post = (body, { ip = `203.0.113.${++ipN}`, type = 'application/json', method = 'POST' } = {}) =>
  onRequest({
    env,
    request: new Request('https://example.pages.dev/api/contact', {
      method, headers: { 'content-type': type, 'cf-connecting-ip': ip },
      body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
  });
const msg = (extra = {}) => ({ name: 'Ada Lovelace', email: 'ada@example.test', subject: 'Hello', message: 'A test message from the Pages Function test.', ...extra });

test('valid message is sent through Resend with the visitor as Reply-To', async () => {
  const before = sent.length;
  const res = await post(msg({ subject: 'Valid' }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  const p = sent[before];
  assert.equal(p.from, env.CONTACT_FROM_EMAIL);
  assert.deepEqual(p.to, [env.CONTACT_EMAIL]);
  assert.equal(p.reply_to, 'ada@example.test');
});

test('invalid and empty fields are refused with 422', async () => {
  const res = await post({ name: '', email: 'not-an-email', subject: '', message: '' });
  assert.equal(res.status, 422);
  const b = await res.json();
  assert.deepEqual(Object.keys(b.fields).sort(), ['email', 'message', 'name', 'subject']);
});

test('the same message twice is a 409 duplicate', async () => {
  assert.equal((await post(msg({ subject: 'Dup' }))).status, 200);
  assert.equal((await post(msg({ subject: 'Dup' }))).status, 409);
});

test('honeypot looks fine to the bot but sends nothing', async () => {
  const before = sent.length;
  const res = await post(msg({ subject: 'Bot', website: 'spam.example' }));
  assert.equal(res.status, 200);
  assert.equal(sent.length, before);
});

test('rate limit: the sixth message from one IP in 10 minutes gets 429', async () => {
  const ip = '198.51.100.7';
  for (let i = 0; i < 5; i++) assert.equal((await post(msg({ subject: 'Rate ' + i }), { ip })).status, 200);
  const res = await post(msg({ subject: 'Rate 5' }), { ip });
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get('retry-after')) > 0);
});

test('Resend failure is a 502 and is never reported as sent', async () => {
  resendMode = 'fail';
  try {
    const res = await post(msg({ subject: 'Fails' }));
    assert.equal(res.status, 502);
    assert.equal((await res.json()).ok, false);
  } finally { resendMode = 'ok'; }
});

test('wrong method, wrong type and oversized bodies are refused', async () => {
  assert.equal((await post(null, { method: 'GET' })).status, 405);
  assert.equal((await post('name=x', { type: 'application/x-www-form-urlencoded' })).status, 415);
  assert.equal((await post(msg({ message: 'x'.repeat(40000) }))).status, 413);
});
