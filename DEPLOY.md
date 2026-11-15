# Deploying to Cloudflare (free)

The site runs as a **Cloudflare Worker** connected to GitHub (`er-prathu/portfolio`), at
`https://portfolio.<your-subdomain>.workers.dev`. Every push to `main` rebuilds and redeploys it.

- `npm run build` creates `public/` with only what visitors need: the 3D room (as `index.html`, also at
  `/room.html`), its two config files and the 3D models. Server code, tests and `.env` are never copied into it.
- `wrangler.jsonc` tells Cloudflare to serve `public/` and to run `src/worker.js` for anything that isn't a file.
- `src/worker.js` sends `/api/contact` to the contact form (`functions/api/contact.js` → `lib/contact.js`).

## 1. Resend (free)

resend.com → sign up → **API Keys → Create API Key** with "Sending access". Copy the key (starts with `re_`);
it is shown only once.

## 2. Cloudflare build settings

Worker → **Settings → Build**:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

The Worker must be named **portfolio**, matching `"name"` in `wrangler.jsonc`. If yours has another name,
change that line to match it.

## 3. Contact form settings

Worker → **Settings → Variables and Secrets** → Add:

| Name | Type | Value |
|---|---|---|
| `RESEND_API_KEY` | **Secret** | your `re_...` key |
| `CONTACT_EMAIL` | Text | the email address your Resend account uses (see below) |
| `CONTACT_FROM_EMAIL` | Text | `Portfolio <onboarding@resend.dev>` |
| `ALLOWED_ORIGIN` | Text (optional) | `https://portfolio.<your-subdomain>.workers.dev` |

**Without your own domain**, Resend's test sender `onboarding@resend.dev` only delivers to the address your Resend
account was created with, so `CONTACT_EMAIL` must be that address. Check spam the first time.

Saving variables in the dashboard deploys them; `keep_vars` in `wrangler.jsonc` stops later deploys from
wiping them.

## 4. Prove delivery

Open the live site, go to **Contact**, send a real message, and check your inbox (and spam). The form only says
"Message sent." when Resend has accepted the email; any failure shows an error and keeps the text.

If it fails: Worker → **Observability → Logs**. Log lines are events like `contact.send_failed` or
`contact.not_configured` with Resend's status code; they never contain the key, addresses or messages.

## Later: your own domain

1. Buy the domain (e.g. `prathameshpatil.dev`).
2. Worker → **Settings → Domains & Routes → Add → Custom domain**.
3. Resend → **Domains → Add Domain**, add the DNS records it lists, wait for "Verified".
4. Set `CONTACT_FROM_EMAIL` to e.g. `Portfolio <contact@prathameshpatil.dev>`, `CONTACT_EMAIL` to any inbox,
   update `ALLOWED_ORIGIN`.

## What the Worker serves besides files

- `POST /api/contact`: the contact form (above).
- `GET /api/geo`: the visitor's approximate city from Cloudflare's own request data (`request.cf`), used by the
  weather when the browser's location isn't shared. No key, no third-party lookup, nothing stored. Turn it off with
  `ipLocationUrl: ''` in `weather.config.js`.

## Résumé

`resume.html` is the source; `resume.pdf` is printed from it. After editing the page, regenerate the PDF with
Microsoft Edge while `npm start` is running:

```bash
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --no-pdf-header-footer --virtual-time-budget=8000 --print-to-pdf="%CD%\resume.pdf" http://localhost:3000/resume.html
```

## Known limits

- The rate limit (5 messages per visitor per 10 minutes) is kept in memory per Cloudflare instance, so it is
  softer than on a single server. The honeypot, validation and duplicate checks are unaffected.
- `index.html` (the older page) and `index-classic.html` are not published; the 3D room is the home page.

## Local commands

```bash
npm test
```

```bash
npm start
```

`npm start` serves the site and form at http://localhost:3000 using `.env`.
