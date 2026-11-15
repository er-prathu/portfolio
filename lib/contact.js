'use strict';
/*
 * Contact form: validation, spam protection and email delivery through Resend (https://resend.com).
 * Shared by the local server (server.js), the Vercel-style function (api/contact.js) and the Cloudflare Pages
 * Function (functions/api/contact.js). It uses only web-standard APIs (fetch, Web Crypto, TextEncoder), so the same
 * file runs on Node 20+ and on Cloudflare's runtime.
 *
 * Configuration (environment variables, never sent to the browser):
 *   RESEND_API_KEY      Resend API key (re_...)
 *   CONTACT_EMAIL       inbox that receives the messages
 *   CONTACT_FROM_EMAIL  sender on a domain verified in Resend, e.g. "Portfolio <contact@yourdomain.com>"
 *
 * Nothing is stored: a message is validated, emailed and forgotten. The only state kept is short-lived and in memory
 * (request counts per IP for rate limiting, and a hash of recent messages to catch double submissions).
 */
const LIMITS = { name: 100, email: 254, subject: 150, message: 5000, messageMin: 10, body: 16 * 1024 };
const RATE = { max: 5, windowMs: 10 * 60 * 1000 };      // 5 submissions per IP per 10 minutes
const DUPLICATE_MS = 10 * 60 * 1000;                     // the same message twice within 10 minutes is a double submit
const RESEND_URL = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10000;

// a practical address check (RFC 5322 is far looser, but this is what real inboxes look like)
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/* ---------- input cleaning ---------- */
// drop control characters (keeping newlines/tabs only where a message allows them) and trim
const CTRL_LINE = new RegExp('[\\u0000-\\u001F\\u007F' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');   // single-line fields: no CR/LF at all (header injection)
const CTRL_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const oneLine = v => String(v).replace(CTRL_LINE, ' ').replace(/\s+/g, ' ').trim();
const multiLine = v => String(v).replace(/\r\n?/g, '\n').replace(CTRL_TEXT, '').replace(/\n{4,}/g, '\n\n\n').trim();
const byteLength = s => new TextEncoder().encode(String(s || '')).length;
// one-way hash (Web Crypto: available in Node 20+ and on Cloudflare), used so that no IP or message is ever kept
async function sha256(s) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}
const escapeHtml = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Validate a submission. Returns { ok: true, data } or { ok: false, fields: { name: 'message', … } }.
 * The browser runs the same rules for instant feedback; this is the one that counts.
 */
function validate(input) {
  const src = input && typeof input === 'object' ? input : {};
  const raw = k => (typeof src[k] === 'string' ? src[k] : '');
  const rawEmail = raw('email');
  const data = { name: oneLine(raw('name')), email: oneLine(rawEmail), subject: oneLine(raw('subject')), message: multiLine(raw('message')) };
  const fields = {};
  if (!data.name) fields.name = 'Please enter your name.';
  else if (data.name.length > LIMITS.name) fields.name = `Please keep your name under ${LIMITS.name} characters.`;
  if (!data.email) fields.email = 'Please enter your email address.';
  else if (/[\r\n]/.test(rawEmail) || data.email.length > LIMITS.email || !EMAIL_RE.test(data.email)) fields.email = 'Please enter a valid email address, like name@example.com.';
  if (!data.subject) fields.subject = 'Please add a subject.';
  else if (data.subject.length > LIMITS.subject) fields.subject = `Please keep the subject under ${LIMITS.subject} characters.`;
  if (!data.message) fields.message = 'Please write a message.';
  else if (data.message.length < LIMITS.messageMin) fields.message = `Please write at least ${LIMITS.messageMin} characters.`;
  else if (data.message.length > LIMITS.message) fields.message = `Please keep the message under ${LIMITS.message} characters.`;
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, data };
}

/* ---------- rate limiting and double-submit detection (in memory, per server instance) ---------- */
function createLimiter({ max = RATE.max, windowMs = RATE.windowMs, now = Date.now } = {}) {
  const hits = new Map();
  return {
    // true if this key may proceed (and counts the attempt)
    take(key) {
      const t = now(), list = (hits.get(key) || []).filter(x => t - x < windowMs);
      if (list.length >= max) { hits.set(key, list); return false; }
      list.push(t); hits.set(key, list);
      if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || t - v[v.length - 1] > windowMs) hits.delete(k);   // keep memory bounded
      return true;
    },
    retryAfter(key) { const list = hits.get(key) || []; return list.length ? Math.max(1, Math.ceil((list[0] + windowMs - now()) / 1000)) : 0; },
  };
}
function createDuplicateGuard({ ttlMs = DUPLICATE_MS, now = Date.now } = {}) {
  const seen = new Map();   // keys are hashes of the message (see duplicateKey): no content kept
  return {
    seen(k) { const t = now(); for (const [x, at] of seen) if (t - at > ttlMs) seen.delete(x); return seen.has(k); },
    remember(k) { seen.set(k, now()); },
  };
}
function duplicateKey(d) {
  return sha256([d.email.toLowerCase(), d.subject, d.message].join('\u0000'));
}

/* ---------- email ---------- */
function buildEmail(d, { to, from }) {
  const subject = `Portfolio: ${d.subject}`.slice(0, 200);
  const text = `New message from your portfolio contact form\n\nName: ${d.name}\nEmail: ${d.email}\nSubject: ${d.subject}\n\n${d.message}\n\n— Reply to this email to answer ${d.name} directly.`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;color:#1d1d1f">
  <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#b9682a;margin:0 0 16px">Portfolio contact form</p>
  <table style="font-size:14px;border-collapse:collapse;margin-bottom:18px">
    <tr><td style="padding:3px 14px 3px 0;color:#6c7378">Name</td><td>${escapeHtml(d.name)}</td></tr>
    <tr><td style="padding:3px 14px 3px 0;color:#6c7378">Email</td><td>${escapeHtml(d.email)}</td></tr>
    <tr><td style="padding:3px 14px 3px 0;color:#6c7378">Subject</td><td>${escapeHtml(d.subject)}</td></tr>
  </table>
  <div style="font-size:15px;line-height:1.6;white-space:pre-wrap;border-top:1px solid #e5e1d8;padding-top:16px">${escapeHtml(d.message)}</div>
  <p style="font-size:12px;color:#6c7378;margin-top:24px">Reply to this email to answer ${escapeHtml(d.name)} directly.</p>
</div>`;
  // the visitor is the Reply-To, never the sender: the sender must be on your verified domain
  return { from, to: [to], reply_to: d.email, subject, text, html };
}

async function sendWithResend(payload, { apiKey, fetchImpl = globalThis.fetch, timeoutMs = SEND_TIMEOUT_MS }) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(RESEND_URL, {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let body = null; try { body = await res.json(); } catch (_) {}
    if (!res.ok || !body || !body.id) return { ok: false, status: res.status, code: body && (body.name || body.statusCode) };
    return { ok: true, id: body.id };
  } catch (e) {
    return { ok: false, status: 0, code: e && e.name === 'AbortError' ? 'timeout' : 'network_error' };
  } finally { clearTimeout(timer); }
}

/* ---------- the endpoint ---------- */
function getConfig(env) {
  const cfg = { apiKey: (env.RESEND_API_KEY || '').trim(), to: (env.CONTACT_EMAIL || '').trim(), from: (env.CONTACT_FROM_EMAIL || '').trim() };
  cfg.missing = ['RESEND_API_KEY', 'CONTACT_EMAIL', 'CONTACT_FROM_EMAIL'].filter((k, i) => ![cfg.apiKey, cfg.to, cfg.from][i]);
  return cfg;
}

/**
 * createContactHandler({ env, fetchImpl, log, limiter, dupes }) → async ({ method, headers, ip, rawBody }) → { status, headers, body }
 * Framework-free, so the same code runs in server.js, a serverless function, and the tests.
 */
function createContactHandler(opts = {}) {
  const env = opts.env || (typeof process !== 'undefined' ? process.env : {});
  const log = opts.log || ((level, event, extra) => console[level === 'error' ? 'error' : 'log'](JSON.stringify({ at: new Date().toISOString(), level, event, ...extra })));
  const limiter = opts.limiter || createLimiter();
  const dupes = opts.dupes || createDuplicateGuard();
  const fetchImpl = opts.fetchImpl;
  const json = (status, body, headers = {}) => ({ status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }, body: JSON.stringify(body) });

  return async function handle({ method, headers = {}, ip = 'unknown', rawBody = '' }) {
    if (method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' }, { Allow: 'POST' });
    const type = String(headers['content-type'] || '');
    if (!type.toLowerCase().startsWith('application/json')) return json(415, { ok: false, error: 'Please send the form as JSON.' });
    if (byteLength(rawBody) > LIMITS.body) return json(413, { ok: false, error: 'That message is too long.' });

    // same-origin only when the site's own origin is configured (ALLOWED_ORIGIN, comma-separated)
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    if (allowed.length && headers.origin && !allowed.includes(headers.origin)) { log('warn', 'contact.origin_rejected', {}); return json(403, { ok: false, error: 'Forbidden.' }); }

    const ipKey = (await sha256(ip)).slice(0, 16);   // never keep the raw IP
    if (!limiter.take(ipKey)) {
      log('warn', 'contact.rate_limited', {});
      return json(429, { ok: false, error: 'Too many messages in a short time. Please try again in a few minutes.' }, { 'Retry-After': String(limiter.retryAfter(ipKey)) });
    }

    let input;
    try { input = JSON.parse(rawBody || '{}'); } catch (_) { return json(400, { ok: false, error: 'The form data could not be read.' }); }

    // honeypot: a field people never see. Bots fill it; they get a normal-looking reply and nothing is sent.
    if (input && typeof input.website === 'string' && input.website.trim() !== '') { log('info', 'contact.honeypot', {}); return json(200, { ok: true }); }

    const v = validate(input);
    if (!v.ok) return json(422, { ok: false, error: 'Please check the highlighted fields.', fields: v.fields });

    const dupKey = await duplicateKey(v.data);
    if (dupes.seen(dupKey)) return json(409, { ok: false, duplicate: true, error: 'This message was already sent. No need to send it again.' });

    const cfg = getConfig(env);
    if (cfg.missing.length) { log('error', 'contact.not_configured', { missing: cfg.missing }); return json(503, { ok: false, error: 'The contact form isn’t set up yet, so your message was not sent.' }); }

    const sent = await sendWithResend(buildEmail(v.data, cfg), { apiKey: cfg.apiKey, fetchImpl });
    if (!sent.ok) {
      log('error', 'contact.send_failed', { status: sent.status, code: sent.code });   // provider status only: no message, no address, no key
      return json(502, { ok: false, error: 'Your message couldn’t be delivered right now, so nothing was sent.' });
    }
    dupes.remember(dupKey);
    log('info', 'contact.sent', { id: sent.id });
    return json(200, { ok: true });
  };
}

module.exports = { createContactHandler, createLimiter, createDuplicateGuard, validate, buildEmail, sendWithResend, getConfig, LIMITS, RATE };
