/*
 * POST /api/contact as a Cloudflare Pages Function (Cloudflare routes functions/api/contact.js to /api/contact).
 * The contact logic itself lives in lib/contact.js, shared with server.js and api/contact.js.
 *
 * Settings come from the Pages project's environment variables (Settings → Variables and Secrets), never from this
 * file: RESEND_API_KEY (add it as a Secret), CONTACT_EMAIL, CONTACT_FROM_EMAIL and optionally ALLOWED_ORIGIN.
 */
import contact from '../../lib/contact.js';

let handle = null;   // one handler per Cloudflare isolate, so its rate limiter persists between requests on that isolate

const crash = () => new Response(JSON.stringify({ ok: false, error: 'Something went wrong on our side. Nothing was sent.' }),
  { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

// every method comes here, so GET and the rest get a proper 405 from the shared handler
export async function onRequest({ request, env }) {
  try {
    if (!handle) handle = contact.createContactHandler({ env });
    const headers = {};
    for (const [k, v] of request.headers) headers[k.toLowerCase()] = v;
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    // read at most a little past the size limit, so a huge body is refused without buffering all of it
    let rawBody = '';
    if (request.method === 'POST' && request.body) {
      const reader = request.body.getReader(), dec = new TextDecoder();
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > contact.LIMITS.body) { rawBody = 'x'.repeat(contact.LIMITS.body + 1); reader.cancel(); break; }
        rawBody += dec.decode(value, { stream: true });
      }
      if (size <= contact.LIMITS.body) rawBody += dec.decode();
    }
    const out = await handle({ method: request.method, headers, ip, rawBody });
    return new Response(out.body, { status: out.status, headers: out.headers });
  } catch (e) {
    console.error(JSON.stringify({ at: new Date().toISOString(), level: 'error', event: 'contact.crash', name: e && e.name }));
    return crash();
  }
}
