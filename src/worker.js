/*
 * Cloudflare Worker entry (wrangler.jsonc). Static files in public/ are served by Cloudflare directly; anything
 * that isn't a file comes here:
 *   POST /api/contact  the contact form (shared with the Pages Function and server.js, see lib/contact.js)
 *   GET  /api/geo      the visitor's approximate city, from Cloudflare's own request data (request.cf), used by the
 *                      weather when the browser's location isn't shared. No third-party lookup, no key, nothing stored.
 * Everything else gets the static assets (or their 404).
 */
import { onRequest as contact } from '../functions/api/contact.js';

export function geo(request) {
  const cf = request.cf || {};
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
  if (request.method !== 'GET') return new Response(JSON.stringify({ ok: false }), { status: 405, headers: { ...headers, allow: 'GET' } });
  const lat = parseFloat(cf.latitude), lon = parseFloat(cf.longitude);
  if (!isFinite(lat) || !isFinite(lon)) return new Response(JSON.stringify({ ok: false }), { status: 200, headers });   // unknown: the page asks instead
  return new Response(JSON.stringify({
    ok: true,
    city: String(cf.city || '').slice(0, 80) || null,
    region: String(cf.region || '').slice(0, 80) || null,
    country: String(cf.country || '').slice(0, 2) || null,
    latitude: Math.round(lat * 100) / 100,     // city-level only
    longitude: Math.round(lon * 100) / 100,
    timezone: String(cf.timezone || '').slice(0, 64) || null,
  }), { status: 200, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), { pathname } = url;
    // plain HTTP → HTTPS (workers.dev answers on both); local development stays on http://localhost
    if (url.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)) {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    if (pathname === '/api/contact') return contact({ request, env });
    if (pathname === '/api/geo') return geo(request);
    // Recruiter Mode: the same page as "/", which switches to the text view (and skips the 3D libraries) when the path is /recruiter
    if (pathname === '/recruiter' || pathname === '/recruiter/') { url.pathname = '/'; return env.ASSETS.fetch(new Request(url, request)); }
    return env.ASSETS.fetch(request);
  },
};
