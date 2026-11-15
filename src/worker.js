/*
 * Cloudflare Worker entry (wrangler.jsonc). Static files in public/ are served by Cloudflare directly; anything
 * that isn't a file comes here: POST /api/contact runs the contact form, everything else gets the 404 page.
 * The contact logic is shared with the Pages Function, server.js and api/contact.js (see lib/contact.js).
 */
import { onRequest as contact } from '../functions/api/contact.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/contact') return contact({ request, env });
    return env.ASSETS.fetch(request);
  },
};
