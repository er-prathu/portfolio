# Deploying to Cloudflare Pages (free)

The site goes live at `https://<project-name>.pages.dev`. The contact form runs as a Pages Function
(`functions/api/contact.js`) and emails you through Resend.

## What gets published

`npm run build` creates `public/` with only what visitors need: the 3D room (as `index.html`, and also at
`/room.html`), its two config files, and the 3D models. Server code, tests and `.env` are never copied into it.

Cloudflare publishes two things: the `public/` folder as the website, and the `functions/` folder as the
contact endpoint (`functions/` pulls in `lib/contact.js` when Cloudflare builds it).

> Cloudflare's **drag-and-drop upload does not run Functions**, so the contact form would not work that way.
> Use one of the two options below.

## 1. Accounts (free)

1. **Resend** (resend.com): sign up, then **API Keys → Create API Key** with "Sending access". Copy the key
   (starts with `re_`); it is shown only once.
2. **Cloudflare** (dash.cloudflare.com): sign up.

## 2. Deploy, option A: GitHub (redeploys on every push)

1. Put this folder in a GitHub repository. `.gitignore` already keeps `.env` and `public/` out of it.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**, pick the repository.
3. Build settings:
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `public`
   - Environment variable `NODE_VERSION` = `20`
4. Save and deploy.

## 2. Deploy, option B: from this computer with Wrangler

```bash
npm run build
```

```bash
npx wrangler pages deploy public --project-name prathameshpatil
```

Run it from this folder (so Wrangler finds `functions/`). The first run asks you to log in to Cloudflare in
the browser and offers to create the project.

## 3. Contact form settings

Cloudflare dashboard → your Pages project → **Settings → Variables and Secrets** (Production):

| Name | Type | Value |
|---|---|---|
| `RESEND_API_KEY` | **Secret** | your `re_...` key |
| `CONTACT_EMAIL` | Text | the inbox that should receive messages |
| `CONTACT_FROM_EMAIL` | Text | `Portfolio <onboarding@resend.dev>` for now |
| `ALLOWED_ORIGIN` | Text (optional) | `https://<project-name>.pages.dev` |

**Without your own domain**, Resend's test sender `onboarding@resend.dev` only delivers to the email address
your Resend account was created with, so `CONTACT_EMAIL` must be that address. Messages from the test sender are
more likely to land in spam; check there the first time.

**Redeploy after changing variables** (Deployments → latest → Retry deployment, or deploy again); they apply
only to new deployments.

## 4. Prove delivery

Open the live site, go to **Contact**, send a real message, and check your inbox (and spam). The form only
shows "Message sent." when Resend has accepted the email; any failure shows an error and keeps the text.

If it fails: Pages project → **Deployments → latest → Functions → Real-time logs**. Log lines are events
like `contact.send_failed` with Resend's status code; they never contain the key, addresses or messages.

## Later: your own domain

1. Buy the domain (e.g. `prathameshpatil.dev`).
2. Pages project → **Custom domains → Set up a domain**.
3. Resend → **Domains → Add Domain**, then add the DNS records it lists (in Cloudflare DNS if the domain is
   there) and wait for "Verified".
4. Change `CONTACT_FROM_EMAIL` to e.g. `Portfolio <contact@prathameshpatil.dev>`, set `CONTACT_EMAIL` to any
   inbox you like, update `ALLOWED_ORIGIN`, and redeploy.

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
