'use strict';
/*
 * Local server for the portfolio: serves the static site and the contact endpoint (POST /api/contact).
 *   npm start           → http://localhost:3000/room.html
 * Reads RESEND_API_KEY, CONTACT_EMAIL and CONTACT_FROM_EMAIL from the environment or from a .env file next to this one.
 * No dependencies beyond Node 18+.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
loadEnv(path.join(ROOT, '.env'));
const contact = require('./api/contact');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon' };
// never serve server code, secrets or tooling as static files
const PRIVATE = /^(\.env[^/]*|\.git[^/]*|\.claude|node_modules|lib|api|functions|scripts|public|test|server\.js|package(-lock)?\.json)(\/|$)/i;

function loadEnv(file) {
  let text; try { text = fs.readFileSync(file, 'utf8'); } catch (_) { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i); if (!m || line.trim().startsWith('#')) continue;
    let v = m[2]; if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' };

http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v);
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/contact') return contact(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); return res.end(); }

  let rel; try { rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'room.html'; } catch (_) { res.statusCode = 400; return res.end(); }
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep) || PRIVATE.test(path.relative(ROOT, file).split(path.sep).join('/'))) { res.statusCode = 404; return res.end('Not found'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Content-Length', st.size);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, HOST, () => {
  const missing = ['RESEND_API_KEY', 'CONTACT_EMAIL', 'CONTACT_FROM_EMAIL'].filter(k => !process.env[k]);
  console.log(`Portfolio on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/room.html`);
  console.log(missing.length ? `Contact form: NOT configured (missing ${missing.join(', ')}); submissions will be refused with a clear error.` : 'Contact form: configured.');
});
