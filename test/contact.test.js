'use strict';
// node --test test/   — the contact endpoint, with Resend replaced by a stub (no network, no real email)
const test = require('node:test');
const assert = require('node:assert/strict');
const { createContactHandler, createLimiter, validate } = require('../lib/contact');

const ENV = { RESEND_API_KEY: 're_test_key', CONTACT_EMAIL: 'inbox@example.com', CONTACT_FROM_EMAIL: 'Portfolio <contact@example.com>' };
const GOOD = { name: 'Ada Lovelace', email: 'ada@example.com', subject: 'Hello there', message: 'I would like to talk about a project.', website: '' };

function setup({ env = ENV, resend = { status: 200, body: { id: 'email_123' } }, limiter } = {}) {
  const calls = [], logs = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, payload: JSON.parse(init.body) });
    if (resend instanceof Error) throw resend;
    return { ok: resend.status < 300, status: resend.status, json: async () => resend.body };
  };
  const handle = createContactHandler({ env, fetchImpl, limiter, log: (level, event, extra) => logs.push({ level, event, extra }) });
  const post = (body, { ip = '203.0.113.7', headers = {} } = {}) =>
    handle({ method: 'POST', ip, headers: { 'content-type': 'application/json', ...headers }, rawBody: typeof body === 'string' ? body : JSON.stringify(body) })
      .then(r => ({ ...r, json: JSON.parse(r.body) }));
  return { post, handle, calls, logs };
}

test('1. a valid submission is emailed, with the visitor as Reply-To and the verified address as sender', async () => {
  const { post, calls } = setup();
  const r = await post(GOOD);
  assert.equal(r.status, 200); assert.equal(r.json.ok, true);
  assert.equal(calls.length, 1);
  const { url, init, payload } = calls[0];
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(init.headers.Authorization, 'Bearer re_test_key');
  assert.equal(payload.from, 'Portfolio <contact@example.com>');
  assert.deepEqual(payload.to, ['inbox@example.com']);
  assert.equal(payload.reply_to, 'ada@example.com');
  assert.match(payload.subject, /Hello there/);
  assert.match(payload.text, /I would like to talk about a project\./);
});

test('2. an invalid email is refused with a field message', async () => {
  const { post, calls } = setup();
  for (const email of ['not-an-email', 'a@b', 'a@@b.com', 'a b@c.com', 'x@example.com\r\nBcc: victim@example.com']) {
    const r = await post({ ...GOOD, email, message: GOOD.message + email });
    assert.equal(r.status, 422, email); assert.ok(r.json.fields.email, email);
  }
  assert.equal(calls.length, 0);
});

test('3. empty and missing fields are each reported', async () => {
  const { post, calls } = setup();
  const r = await post({ name: ' ', email: '', subject: '', message: '   ' });
  assert.equal(r.status, 422);
  assert.deepEqual(Object.keys(r.json.fields).sort(), ['email', 'message', 'name', 'subject']);
  const r2 = await post({});
  assert.equal(r2.status, 422); assert.equal(Object.keys(r2.json.fields).length, 4);
  assert.equal(calls.length, 0);
});

test('4. the same message submitted twice is only sent once', async () => {
  const { post, calls } = setup();
  assert.equal((await post(GOOD)).status, 200);
  const again = await post(GOOD);
  assert.equal(again.status, 409); assert.equal(again.json.duplicate, true);
  assert.equal(calls.length, 1);
});

test('5. the honeypot field silently drops bots: nothing is sent', async () => {
  const { post, calls, logs } = setup();
  const r = await post({ ...GOOD, website: 'http://spam.example' });
  assert.equal(r.status, 200);
  assert.equal(calls.length, 0);
  assert.ok(logs.some(l => l.event === 'contact.honeypot'));
});

test('6. rate limiting: the 6th request in the window gets 429 with Retry-After', async () => {
  const { post, calls } = setup({ limiter: createLimiter({ max: 5, windowMs: 60000 }) });
  for (let i = 0; i < 5; i++) assert.equal((await post({ ...GOOD, message: GOOD.message + ' #' + i })).status, 200);
  const r = await post({ ...GOOD, message: GOOD.message + ' #6' });
  assert.equal(r.status, 429); assert.ok(Number(r.headers['Retry-After']) > 0);
  assert.equal(calls.length, 5);
  assert.equal((await post({ ...GOOD, message: 'From somebody else entirely.' }, { ip: '198.51.100.2' })).status, 200);   // other visitors unaffected
});

test('7. an email API failure is reported as a failure (never a fake success) and logged without secrets', async () => {
  for (const resend of [{ status: 403, body: { name: 'validation_error', message: 'domain not verified' } }, { status: 500, body: null }, new Error('ECONNRESET')]) {
    const { post, logs } = setup({ resend });
    const r = await post(GOOD);
    assert.equal(r.status, 502); assert.equal(r.json.ok, false);
    const line = JSON.stringify(logs);
    assert.ok(logs.some(l => l.event === 'contact.send_failed'));
    assert.ok(!line.includes('re_test_key') && !line.includes('ada@example.com') && !line.includes('talk about a project'), 'no key, address or message in logs');
  }
  // a failed send is not remembered as sent: the visitor can retry the same message
  const s = setup({ resend: { status: 500, body: null } });
  assert.equal((await s.post(GOOD)).status, 502);
  assert.equal((await s.post(GOOD)).status, 502);
});

test('8. missing configuration refuses with 503 and sends nothing', async () => {
  const { post, calls, logs } = setup({ env: { RESEND_API_KEY: '', CONTACT_EMAIL: '', CONTACT_FROM_EMAIL: '' } });
  const r = await post(GOOD);
  assert.equal(r.status, 503); assert.equal(calls.length, 0);
  assert.deepEqual(logs.find(l => l.event === 'contact.not_configured').extra.missing, ['RESEND_API_KEY', 'CONTACT_EMAIL', 'CONTACT_FROM_EMAIL']);
});

test('header injection: line breaks never reach single-line fields', () => {
  const v = validate({ ...GOOD, name: 'Eve\r\nBcc: x@example.com', subject: 'Hi\nX-Injected: 1' });
  assert.equal(v.ok, true);
  assert.ok(!/[\r\n]/.test(v.data.name) && !/[\r\n]/.test(v.data.subject));
});

test('HTML in the message is escaped in the email body', async () => {
  const { post, calls } = setup();
  await post({ ...GOOD, message: '<script>alert(1)</script> and <b>bold</b> text' });
  assert.ok(!calls[0].payload.html.includes('<script>'));
  assert.ok(calls[0].payload.html.includes('&lt;script&gt;'));
});

test('size limits, wrong method and wrong content type', async () => {
  const { post, handle } = setup();
  assert.equal((await post({ ...GOOD, message: 'x'.repeat(5001) })).status, 422);
  assert.equal((await post({ ...GOOD, name: 'n'.repeat(101) })).status, 422);
  assert.equal((await post('{"a":"' + 'x'.repeat(20000) + '"}')).status, 413);
  assert.equal((await post('{not json')).status, 400);
  assert.equal((await handle({ method: 'GET', headers: {} })).status, 405);
  assert.equal((await handle({ method: 'POST', headers: { 'content-type': 'text/plain' }, rawBody: 'hi' })).status, 415);
});

test('ALLOWED_ORIGIN blocks posts from other sites', async () => {
  const { post } = setup({ env: { ...ENV, ALLOWED_ORIGIN: 'https://prathamesh.example' } });
  assert.equal((await post(GOOD, { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await post(GOOD, { headers: { origin: 'https://prathamesh.example' } })).status, 200);
});
