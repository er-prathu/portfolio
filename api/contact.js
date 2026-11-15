'use strict';
/*
 * POST /api/contact as a serverless function (Vercel's Node runtime picks up files in /api automatically; the same
 * (req, res) signature works with Netlify's or any Node host's adapters). Locally, server.js serves this same logic.
 */
const { createContactHandler, LIMITS } = require('../lib/contact');

const handle = createContactHandler();   // module scope: the rate limiter lives as long as the function instance

function readBody(req) {
  if (req.body !== undefined && typeof req.body !== 'string' && !Buffer.isBuffer(req.body)) return Promise.resolve(JSON.stringify(req.body));   // already parsed by the platform
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) return Promise.resolve(String(req.body));
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > LIMITS.body + 1) { resolve('x'.repeat(LIMITS.body + 1)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

module.exports = async function contact(req, res) {
  let out;
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
    out = await handle({ method: req.method, headers: req.headers, ip, rawBody: req.method === 'POST' ? await readBody(req) : '' });
  } catch (e) {
    console.error(JSON.stringify({ at: new Date().toISOString(), level: 'error', event: 'contact.crash', name: e && e.name }));
    out = { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: 'Something went wrong on our side. Nothing was sent.' }) };
  }
  res.statusCode = out.status;
  for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
  res.end(out.body);
};
