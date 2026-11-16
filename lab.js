/*
 * Engineering lab: the Skills section as five CRT workstations (#lab in room.html).
 * Each module lists the technologies, what I work with, the related case studies, and a small demo.
 * Every demo runs in the visitor's browser on sample data written for this page and is labelled as simulated.
 * The one exception is labelled LIVE: a GET to this site's own /api/geo.
 * No framework: plain DOM, GSAP (already on the page) for the power-on and data-flow motion, and the desk's own
 * sound switch (off by default) for the blips. Reduced motion skips every animation.
 */
(() => {
  'use strict';
  const host = document.getElementById('lab'); if (!host) return;
  const G = window.gsap;
  const still = () => !/[?&]motion\b/.test(location.search) && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hook = () => window.DESK_LAB || {};
  const blip = f => { try { if (hook().blip) hook().blip(f); } catch (e) {} };
  const wait = ms => new Promise(r => setTimeout(r, still() ? 0 : ms));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function h(tag, a, ...kids) {
    const el = document.createElement(tag);
    for (const k in a || {}) {
      const v = a[k]; if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach(c => { if (c != null) el.append(c); });
    return el;
  }
  // a row of toggle buttons where exactly one is pressed
  function choice(labels, onPick, name) {
    const btns = labels.map((l, i) => h('button', { type: 'button', class: 'dm-btn', 'aria-pressed': i === 0 ? 'true' : 'false', onclick: () => { btns.forEach((b, k) => b.setAttribute('aria-pressed', k === i ? 'true' : 'false')); blip(700); onPick(i); } }, l));
    return h('div', { class: 'dm-row', role: 'group', 'aria-label': name }, btns);
  }
  // JSON with keys, strings and literals coloured (everything is escaped first)
  const paint = v => esc(JSON.stringify(v, null, 2)).replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?/g,
    (m, s, colon) => s ? (colon ? `<i class="k">${s}</i>:` : `<i class="s">${s}</i>`) : `<i class="n">${m}</i>`);

  /* ---------- 01 Backend: an API console ---------- */
  function demoBackend(box) {
    const leads = [
      { id: 1, name: 'Sample Lead A', email: 'a@example.test', status: 'new' },
      { id: 2, name: 'Sample Lead B', email: 'b@example.test', status: 'contacted' },
      { id: 3, name: 'Sample Lead C', email: 'c@example.test', status: 'new' },
    ];
    let nextId = 4;
    const REASON = { 200: 'OK', 201: 'Created', 400: 'Bad Request', 401: 'Unauthorized', 404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 422: 'Unprocessable Content' };
    // the sample API: real routing and validation, over the array above
    function route(method, path, bodyText) {
      const [p, qs] = path.split('?'), q = new URLSearchParams(qs || ''), m = p.match(/^\/leads(?:\/(\d+))?$/);
      if (!m) return [404, { error: 'not_found', message: 'No such route.' }];
      const id = m[1] ? +m[1] : null;
      if (method === 'GET' && !id) { const s = q.get('status'), rows = leads.filter(r => !s || r.status === s); return [200, { data: rows, meta: { count: rows.length } }]; }
      if (method === 'GET') { const r = leads.find(x => x.id === id); return r ? [200, { data: r }] : [404, { error: 'not_found', message: `Lead ${id} does not exist.` }]; }
      if (method === 'POST' && !id) {
        let b; try { b = JSON.parse(bodyText); } catch (e) { return [400, { error: 'bad_request', message: 'The body is not valid JSON.' }]; }
        const errors = {}, name = b && typeof b.name === 'string' ? b.name.trim() : '', email = b && typeof b.email === 'string' ? b.email.trim() : '';
        if (!name) errors.name = 'Name is required.';
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Enter a valid email address.';
        if (Object.keys(errors).length) return [422, { error: 'validation_failed', errors }];
        if (leads.some(r => r.email === email)) return [409, { error: 'conflict', message: 'A lead with this email already exists.' }];
        const row = { id: nextId++, name: name.slice(0, 80), email: email.slice(0, 120), status: 'new' }; leads.push(row);
        return [201, { data: row }, { Location: '/leads/' + row.id }];
      }
      if (method === 'DELETE' && id) return [401, { error: 'unauthorized', message: 'This route needs an Authorization header.' }, { 'WWW-Authenticate': 'Bearer' }];
      return [405, { error: 'method_not_allowed' }, { Allow: id ? 'GET, DELETE' : 'GET, POST' }];
    }
    const presets = [
      { label: 'List', method: 'GET', path: '/leads?status=new' },
      { label: 'Not found', method: 'GET', path: '/leads/7' },
      { label: 'Create', method: 'POST', path: '/leads', body: { name: 'Sample Lead D', email: 'd@example.test' } },
      { label: 'Invalid', method: 'POST', path: '/leads', body: { name: '', email: 'not-an-email' } },
      { label: 'No token', method: 'DELETE', path: '/leads/2' },
      { label: 'Live: /api/geo', method: 'GET', path: '/api/geo', live: true },
    ];
    let cur = presets[0], run = 0;
    const note = h('p', { class: 'sim' });
    const req = h('pre', { class: 'dm-out', 'aria-label': 'Request' });
    const bodyIn = h('textarea', { class: 'dm-in', id: 'labBody', rows: 4, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off' });
    const bodyWrap = h('div', { class: 'dm-field' }, h('label', { for: 'labBody' }, 'Request body: edit it, then send'), bodyIn);
    const res = h('pre', { class: 'dm-out res', 'aria-live': 'polite', 'aria-label': 'Response' });
    const send = h('button', { type: 'button', class: 'dm-btn go', onclick: fire }, 'Send request');
    function show(i) {
      cur = presets[i]; run++;
      note.textContent = cur.live
        ? 'Live: a real request to this site’s own Worker. It returns your approximate city from Cloudflare’s network data. Nothing is stored.'
        : 'Simulated: a sample API running in your browser on made-up records. Routing, validation and status codes are real code.';
      note.classList.toggle('live', !!cur.live);
      req.innerHTML = `<b>${cur.method}</b> ${esc(cur.path)} HTTP/1.1\nHost: ${cur.live ? esc(location.host || 'this site') : 'sample.api'}\nAccept: application/json` + (cur.body ? '\nContent-Type: application/json' : '');
      bodyWrap.hidden = !cur.body; if (cur.body) bodyIn.value = JSON.stringify(cur.body, null, 2);
      res.textContent = 'Press “Send request”.'; res.dataset.s = ''; send.disabled = false;
    }
    function print(status, body, headers, ms) {
      const head = Object.entries(Object.assign({ 'Content-Type': 'application/json' }, headers)).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('\n');
      res.dataset.s = String(status)[0];
      res.innerHTML = `<b>HTTP/1.1 ${status} ${esc(REASON[status] || '')}</b>\n${head}\n\n${typeof body === 'string' ? esc(body) : paint(body)}` + (ms != null ? `\n\n<i class="c"># ${ms} ms, measured in your browser</i>` : '');
    }
    async function fire() {
      const mine = ++run; blip(520); send.disabled = true; res.dataset.s = ''; res.textContent = 'Sending…';
      try {
        if (cur.live) {
          const t0 = performance.now(), ac = new AbortController(), to = setTimeout(() => ac.abort(), 8000);
          const r = await fetch('/api/geo', { headers: { Accept: 'application/json' }, signal: ac.signal, credentials: 'omit' });
          const text = await r.text(); clearTimeout(to); if (mine !== run) return;
          let body = 'The response was not JSON: this server does not run the Worker. /api/geo answers on the deployed site.'; try { body = JSON.parse(text); } catch (e) {}
          print(r.status, body, { 'Content-Type': r.headers.get('content-type') || 'unknown' }, Math.round(performance.now() - t0));
        } else {
          await wait(380); if (mine !== run) return;
          const [status, body, headers] = route(cur.method, cur.path, bodyIn.value);
          print(status, body, headers);
        }
        blip(880);
      } catch (e) {
        if (mine === run) { res.dataset.s = '5'; res.textContent = 'The request failed: /api/geo could not be reached from this page. Nothing is shown in its place.'; }
      } finally { if (mine === run) send.disabled = false; }
    }
    box.append(note, choice(presets.map(p => p.label), show, 'Sample requests'), req, bodyWrap, h('div', { class: 'dm-row' }, send), res);
    show(0);
  }

  /* ---------- 02 Frontend: a component bench ---------- */
  function demoFrontend(box) {
    const ACC = [['Amber', '#E8913C'], ['Green', '#86EFAC'], ['Teal', '#5FA3AB']];
    const st = { accent: ACC[0][1], radius: 10, size: 14 };
    let timer = 0;
    const btn = h('button', { type: 'button', class: 'fx-btn', 'data-state': 'idle', onclick: press }, h('span', { class: 'fx-ico', 'aria-hidden': 'true' }), h('span', { class: 'fx-lbl' }, 'Save changes'));
    const state = h('p', { class: 'fx-state', 'aria-live': 'polite' }, 'state: idle');
    const css = h('pre', { class: 'dm-out', 'aria-label': 'The component’s CSS variables' });
    function paintCss() {
      btn.style.setProperty('--fx-accent', st.accent); btn.style.setProperty('--fx-radius', st.radius + 'px'); btn.style.setProperty('--fx-size', st.size + 'px');
      css.innerHTML = `<i class="k">.save-btn</i> {\n  --accent: <i class="s">${st.accent}</i>;\n  --radius: <i class="n">${st.radius}px</i>;\n  --size:   <i class="n">${st.size}px</i>;\n}`;
    }
    function set(s) { btn.dataset.state = s; btn.setAttribute('aria-busy', s === 'loading' ? 'true' : 'false'); btn.querySelector('.fx-lbl').textContent = { idle: 'Save changes', loading: 'Saving…', done: 'Saved' }[s]; state.textContent = 'state: ' + s; }
    function press() {
      if (btn.dataset.state !== 'idle') return;
      blip(620); set('loading'); clearTimeout(timer);
      timer = setTimeout(() => { if (!btn.isConnected) return; blip(940); set('done'); timer = setTimeout(() => btn.isConnected && set('idle'), 1500); }, 1100);
    }
    const range = (id, label, key, min, max) => h('div', { class: 'dm-field' }, h('label', { for: id }, label),
      h('input', { type: 'range', id, min, max, value: st[key], oninput: e => { st[key] = +e.target.value; paintCss(); } }));
    box.append(
      h('p', { class: 'sim' }, 'Simulated: nothing is saved. The button is a real component: plain HTML, CSS variables and a small state machine.'),
      h('div', { class: 'fx-stage' }, btn, state),
      h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'Accent'), choice(ACC.map(a => a[0]), i => { st.accent = ACC[i][1]; paintCss(); }, 'Accent colour')),
      range('labRad', 'Corner radius', 'radius', 0, 22), range('labSize', 'Text size', 'size', 12, 18), css);
    paintCss();
  }

  /* ---------- 03 Database: LIKE against ranked full-text search ---------- */
  function demoDatabase(box) {
    const ROWS = [
      [1, 'Resetting your password', 'Use the reset link on the sign-in page to choose a new password.'],
      [2, 'Updating billing details', 'Change the card or billing address used for your invoices.'],
      [3, 'Downloading an invoice', 'Invoices are available as PDF files from the billing page.'],
      [4, 'Password rules', 'Passwords need twelve characters and are never sent by email.'],
      [5, 'Inviting team members', 'Send an invite by email and choose a role for each member.'],
      [6, 'Changing your email address', 'Confirm the new address from the link we send you.'],
      [7, 'Exporting your data', 'Export projects and invoices as CSV files.'],
      [8, 'Two-step sign-in', 'Add a second step when signing in to protect your account.'],
    ];
    const STOP = new Set('the a an to of for and or is are your you by on in as we from be use my how do i'.split(' '));
    const stem = w => { let s = w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w; s = s.replace(/(.)\1$/, '$1'); return s.replace(/e$/, ''); };
    const terms = t => (t.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => !STOP.has(w)).map(stem);
    const idx = ROWS.map(r => ({ id: r[0], title: r[1], body: r[2], tt: terms(r[1]), bt: terms(r[2]) }));
    let mode = 0;
    const input = h('input', { class: 'dm-in', id: 'labQ', type: 'search', placeholder: 'Try: reset passwords', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: 60, oninput: search });
    const query = h('pre', { class: 'dm-out', 'aria-label': 'The query this search runs' });
    const why = h('p', { class: 'dm-why' });
    const count = h('p', { class: 'dm-count', 'aria-live': 'polite' });
    const list = h('ol', { class: 'dm-res' });
    const markLike = (text, q) => { const i = q ? text.toLowerCase().indexOf(q) : -1; return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length)); };
    const markTerms = (text, set) => text.split(/([A-Za-z0-9]+)/).map(p => /^[A-Za-z0-9]+$/.test(p) && set.has(stem(p.toLowerCase())) ? '<mark>' + esc(p) + '</mark>' : esc(p)).join('');
    function search() {
      const raw = input.value.trim(), q = raw.toLowerCase(), sq = esc(raw.replace(/'/g, "''"));
      let hits;
      if (mode === 0) {
        hits = idx.filter(r => !q || r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q)).map(r => ({ r, t: markLike(r.title, q), b: markLike(r.body, q) }));
        query.innerHTML = q ? `<i class="k">SELECT</i> id, title <i class="k">FROM</i> articles\n<i class="k">WHERE</i> title <i class="k">LIKE</i> <i class="s">'%${sq}%'</i>\n   <i class="k">OR</i> body  <i class="k">LIKE</i> <i class="s">'%${sq}%'</i>\n<i class="k">ORDER BY</i> id;` : `<i class="k">SELECT</i> id, title <i class="k">FROM</i> articles <i class="k">ORDER BY</i> id;`;
        why.textContent = 'LIKE looks for these exact characters, in this order. It cannot rank: rows come back in id order, and “passwords” will not find “password”.';
      } else {
        const qt = [...new Set(terms(raw))], set = new Set(qt);
        hits = idx.map(r => {
          let score = 0;
          qt.forEach(t => { const df = idx.filter(x => x.tt.includes(t) || x.bt.includes(t)).length; if (!df) return; score += Math.log(1 + idx.length / df) * (2 * r.tt.filter(x => x === t).length + r.bt.filter(x => x === t).length); });
          return { r, score: qt.length ? score : null, t: markTerms(r.title, set), b: markTerms(r.body, set) };
        }).filter(x => !qt.length || x.score > 0).sort((a, b) => b.score - a.score || a.r.id - b.r.id);
        query.innerHTML = qt.length
          ? `<b>GET</b> /articles/_search\n{\n  <i class="k">"query"</i>: {\n    <i class="k">"multi_match"</i>: {\n      <i class="k">"query"</i>: <i class="s">"${esc(raw.replace(/["\\]/g, ''))}"</i>,\n      <i class="k">"fields"</i>: [<i class="s">"title^2"</i>, <i class="s">"body"</i>]\n    }\n  }\n}`
          : `<b>GET</b> /articles/_search\n{ <i class="k">"query"</i>: { <i class="k">"match_all"</i>: {} } }`;
        why.textContent = qt.length
          ? `The text is split into terms and reduced to stems (${qt.join(', ')}). Any term can match. Rarer terms and matches in the title count for more, so the best row comes first. The scores are a simplified model worked out in your browser.`
          : 'Full-text search analyses the words instead of matching characters. Type a query to see the terms and the ranking.';
      }
      count.textContent = hits.length + (hits.length === 1 ? ' row' : ' rows') + ' of ' + idx.length;
      list.innerHTML = hits.map(x => `<li><span class="t">${x.t}</span><span class="b">${x.b}</span><span class="m">id ${x.r.id}${x.score != null ? ' · score ' + x.score.toFixed(2) : ''}</span></li>`).join('') || '<li class="none">No rows match.</li>';
    }
    const modes = choice(['MySQL LIKE', 'Full-text search'], i => { mode = i; search(); }, 'Search method');
    const samples = h('div', { class: 'dm-row' }, ['password', 'reset passwords', 'export invoices'].map(s => h('button', { type: 'button', class: 'dm-btn ghost', onclick: () => { input.value = s; blip(700); search(); } }, s)));
    box.append(
      h('p', { class: 'sim' }, 'Simulated: eight sample help articles written for this demo. No database is connected; both searches run in your browser.'),
      modes, h('div', { class: 'dm-field' }, h('label', { for: 'labQ' }, 'Search the sample articles'), input), samples, query, why, count, list);
    search();
  }

  /* ---------- 04 AI: a lead qualification workflow ---------- */
  function demoAI(box) {
    const LEADS = [
      { msg: 'My landlord has kept my deposit for three months since I moved out. Can someone help?',
        ask: 'Do you have the tenancy agreement, and roughly how much is the deposit?', ans: 'Yes, I have the agreement. It was two months of rent.',
        fields: { topic: 'tenancy deposit', documents: true, timeframe: '3 months', follow_up_answered: true },
        verdict: 'Strong lead', tone: 'ok', why: ['Specific problem', 'Documents available', 'Clear timeframe'], route: 'Passed on, with the summary attached.' },
      { msg: 'I think I might need a lawyer for something at work.',
        ask: 'What happened at work, and when?', ans: 'I would rather not say yet.',
        fields: { topic: 'employment (unclear)', documents: null, timeframe: null, follow_up_answered: false },
        verdict: 'Needs more information', tone: 'mid', why: ['Topic is vague', 'No timeframe', 'Follow-up not answered'], route: 'Not passed on yet. The user is invited to share more.' },
      { msg: 'What is the capital of France?',
        ask: null, ans: null,
        fields: { topic: 'not a legal request', documents: null, timeframe: null, follow_up_answered: null },
        verdict: 'Not a lead', tone: 'no', why: ['Not a request for help with a legal problem'], route: 'Answered politely and closed.' },
    ];
    let cur = 0, run = 0;
    const steps = h('ol', { class: 'ai-steps', 'aria-live': 'polite' });
    const go = h('button', { type: 'button', class: 'dm-btn go', onclick: play }, 'Run workflow');
    const li = (n, title, body) => h('li', { class: 'ai-step' }, h('span', { class: 'ai-n' }, n), h('div', {}, h('b', {}, title), body));
    function reset(i) { cur = i; run++; steps.replaceChildren(li('01', 'Intake', h('p', { class: 'ai-q' }, '“' + LEADS[i].msg + '”'))); go.disabled = false; go.textContent = 'Run workflow'; }
    async function play() {
      const mine = ++run, L = LEADS[cur]; go.disabled = true; blip(520);
      steps.replaceChildren(li('01', 'Intake', h('p', { class: 'ai-q' }, '“' + L.msg + '”')));
      const add = async el => { await wait(650); if (mine !== run) return false; steps.append(el); blip(760); if (!still() && G) G.from(el, { opacity: 0, y: 8, duration: .35, ease: 'power2.out', clearProps: 'opacity,transform' }); return true; };
      if (!await add(li('02', 'Follow-up question', L.ask ? h('div', {}, h('p', { class: 'ai-llm' }, 'Model asks: ' + L.ask), h('p', { class: 'ai-q' }, 'User: “' + L.ans + '”')) : h('p', {}, 'Skipped: nothing to clarify.')))) return;
      if (!await add(li('03', 'Extract fields', h('pre', { class: 'dm-out', html: paint(L.fields) })))) return;
      if (!await add(li('04', 'Qualify', h('div', {}, h('p', { class: 'ai-v ' + L.tone }, L.verdict), h('ul', { class: 'ai-why' }, L.why.map(w => h('li', {}, w))))))) return;
      if (!await add(li('05', 'Route', h('p', {}, L.route)))) return;
      go.disabled = false; go.textContent = 'Run again';
    }
    box.append(
      h('p', { class: 'sim' }, 'Simulated: fictional enquiries and pre-written outputs. No model is called. It shows the general pattern, not WebMD’s system or its rules.'),
      choice(['Enquiry A', 'Enquiry B', 'Enquiry C'], reset, 'Sample enquiries'), h('div', { class: 'dm-row' }, go), steps);
    reset(0);
  }

  /* ---------- 05 Architecture: this site's real data flow ---------- */
  function demoArch(box) {
    const N = {
      browser: { x: 17, y: 40, name: 'Browser', sub: 'the 3D page', what: 'Renders the desk with three.js and runs every interaction. It calls the weather and GitHub APIs itself.', why: 'Both are public and need no key, so there is nothing to hide behind a server.' },
      edge: { x: 50, y: 13, name: 'Cloudflare', sub: 'static files', what: 'Serves the page, the 3D models and the textures from the edge.', why: 'The page is static, so no server has to build HTML and there is little that can break.' },
      worker: { x: 50, y: 46, name: 'Worker', sub: '/api routes', what: 'Runs only for /api/contact and /api/geo. It validates input, limits repeat requests and holds the email key.', why: 'Secrets and third-party calls that need a key stay on the server, never in page code.' },
      resend: { x: 84, y: 46, name: 'Resend', sub: 'email', what: 'Delivers contact-form messages. Only the Worker calls it, with the visitor’s address as Reply-To.', why: 'The page reports success only when the email was accepted. A failure is shown as a failure.' },
      meteo: { x: 50, y: 84, name: 'Open-Meteo', sub: 'weather', what: 'Provides the weather that changes the scene outside the window.', why: 'Results are reused for 15 minutes, so the page does not repeat requests.' },
      github: { x: 17, y: 84, name: 'GitHub API', sub: 'public repos', what: 'Provides the public repository list in Projects, read live.', why: 'The list is cached in the browser for 6 hours. Only what GitHub returns is shown.' },
    };
    const LINKS = [['browser', 'edge'], ['browser', 'worker'], ['worker', 'resend'], ['browser', 'meteo'], ['browser', 'github']];
    const FLOWS = [
      { label: 'Page load', steps: [['browser', 'edge', 'The browser asks for the page.'], ['edge', 'browser', 'Cloudflare returns the HTML, then the models and textures. No server builds the page.']] },
      { label: 'Contact form', steps: [['browser', 'worker', 'The form posts JSON to /api/contact.'], ['worker', 'resend', 'The Worker validates the message, limits repeats and sends the email with a server-side key.'], ['resend', 'worker', 'Resend accepts or rejects the email.'], ['worker', 'browser', 'The page shows success only if the email was accepted.']] },
      { label: 'Weather', steps: [['browser', 'worker', 'If location is not shared, /api/geo returns an approximate city from Cloudflare’s network data.'], ['worker', 'browser', 'Nothing about the visitor is stored.'], ['browser', 'meteo', 'The browser asks Open-Meteo directly. It needs no key, so no proxy is needed.'], ['meteo', 'browser', 'The result is reused for 15 minutes.']] },
      { label: 'Projects list', steps: [['browser', 'github', 'Opening Projects reads the public repositories from the GitHub API.'], ['github', 'browser', 'The list is cached in the browser for 6 hours.']] },
    ];
    let run = 0;
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
    const lines = {};
    LINKS.forEach(([a, b]) => { const l = document.createElementNS(NS, 'line'); l.setAttribute('x1', N[a].x); l.setAttribute('y1', N[a].y); l.setAttribute('x2', N[b].x); l.setAttribute('y2', N[b].y); svg.append(l); lines[a + b] = lines[b + a] = l; });
    const dot = h('span', { class: 'ar-dot', 'aria-hidden': 'true', hidden: true });
    const info = h('div', { class: 'ar-info', 'aria-live': 'polite' }, h('p', {}, 'Select a component to see what it does and why it sits there.'));
    const nodes = {};
    Object.keys(N).forEach(k => {
      const n = N[k];
      nodes[k] = h('button', { type: 'button', class: 'ar-node', style: `left:${n.x}%;top:${n.y}%`, 'aria-pressed': 'false', onclick: () => {
        blip(700); Object.values(nodes).forEach(b => b.setAttribute('aria-pressed', b === nodes[k] ? 'true' : 'false'));
        info.replaceChildren(h('b', {}, n.name + ' · ' + n.sub), h('p', {}, n.what), h('p', { class: 'ar-why' }, h('span', {}, 'Decision: '), n.why));
      } }, h('b', {}, n.name), h('span', {}, n.sub));
    });
    const map = h('div', { class: 'ar-map' }, svg, Object.values(nodes), dot);
    const log = h('ol', { class: 'ar-log', 'aria-live': 'polite' });
    const clear = () => { Object.values(lines).forEach(l => l.classList.remove('on')); Object.values(nodes).forEach(b => b.classList.remove('lit')); };
    async function play(i) {
      const mine = ++run; clear(); log.replaceChildren(); if (G) G.killTweensOf(dot);
      const moving = G && !still();
      for (const [a, b, text] of FLOWS[i].steps) {
        if (moving) clear();
        lines[a + b].classList.add('on'); nodes[a].classList.add('lit'); nodes[b].classList.add('lit');
        log.append(h('li', {}, h('span', {}, N[a].name + ' → ' + N[b].name), text));
        if (moving) {
          dot.hidden = false;
          await new Promise(r => G.fromTo(dot, { left: N[a].x + '%', top: N[a].y + '%' }, { left: N[b].x + '%', top: N[b].y + '%', duration: .85, ease: 'power1.inOut', onComplete: r, onInterrupt: r }));
          if (mine !== run || !map.isConnected) return;
          blip(760); await wait(350);
          if (mine !== run || !map.isConnected) return;
        }
      }
      dot.hidden = true; if (moving) clear();
    }
    box.append(
      h('p', { class: 'sim live' }, 'Real architecture: this is how this site works. The animation is a diagram; it sends no requests.'),
      h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'Follow a request'), choice(FLOWS.map(f => f.label), play, 'Data flows')),
      map, log, info);
    play(0);
  }

  /* ---------- the five modules ---------- */
  const MODS = [
    { name: 'Backend Engine', line: 'APIs and server-side code', tech: ['PHP', 'Laravel', 'CodeIgniter', 'Node.js', 'REST APIs'],
      know: ['Server-side application code in PHP, with Laravel and CodeIgniter.', 'REST API design: resources, validation, status codes and consistent error shapes.', 'Keeping keys and third-party calls on the server, out of page code.'],
      proj: [[2, 'Nolo CMS', 'Sole developer. WebMD, confidential.'], [3, 'This site’s API', 'A Cloudflare Worker with two endpoints. Public code.']],
      demoName: 'API console', demo: demoBackend },
    { name: 'Frontend Studio', line: 'Interfaces in the browser', tech: ['JavaScript', 'jQuery', 'HTML', 'CSS'],
      know: ['Interfaces in plain JavaScript and jQuery, without depending on a framework.', 'Semantic HTML, keyboard access and responsive CSS.', 'Turning designs into working HTML.'],
      proj: [[1, 'Figma-to-HTML skill', 'Turns Figma designs into HTML. Used across the IB team.'], [3, 'Prathamesh’s Desk', 'This site: one HTML page, no framework or bundler.']],
      demoName: 'Component bench', demo: demoFrontend },
    { name: 'Database Console', line: 'Data modelling and search', tech: ['MySQL', 'Elasticsearch', 'Data modelling', 'Search'],
      know: ['Relational data modelling and queries in MySQL.', 'Full-text search with Elasticsearch: analysed text and relevance ranking.', 'Choosing between an exact database lookup and a ranked search.'],
      proj: [], projNote: 'Used in product and client work. Those projects and their data are not public.',
      demoName: 'Search console', demo: demoDatabase },
    { name: 'AI Research Lab', line: 'LLM features and agent tooling', tech: ['LLM integrations', 'MCP', 'Claude Code', 'Claude API', 'Figma MCP', 'Cline'],
      know: ['Working on LLM features that run in a production product.', 'Connecting tools to coding agents through the Model Context Protocol.', 'Writing agent skills a whole team can reuse, to speed up development.'],
      proj: [[0, 'AI lead qualification engine', 'An LLM asks follow-up questions and scores leads. WebMD, confidential.'], [1, 'Figma-to-HTML skill', 'Figma MCP with Claude Code and Cline.']],
      demoName: 'Lead qualification workflow', demo: demoAI },
    { name: 'System Architecture', line: 'How the parts fit together', tech: ['API architecture', 'Application design', 'Data flow', 'Engineering decisions'],
      know: ['Deciding what runs in the browser, on the server and in outside services.', 'Designing so that failures are reported, never hidden.', 'Keeping a system small enough for one person to own end to end.'],
      proj: [[3, 'Prathamesh’s Desk', 'The architecture below. Public code.'], [2, 'Nolo CMS', 'Sole developer. Architecture not public.']],
      demoName: 'Data flow of this site', demo: demoArch },
  ];
  const no = i => String(i + 1).padStart(2, '0');

  let open = -1, busy = false;
  const rack = h('ul', { class: 'lab-rack', 'aria-label': 'Engineering modules' });
  const stage = h('div', { class: 'lab-stage', hidden: true });
  const mons = MODS.map((m, i) => {
    const b = h('button', { type: 'button', class: 'mon', 'aria-label': `Module ${no(i)}, ${m.name}: ${m.tech.join(', ')}. Switch on.`, onclick: () => power(i) },
      h('span', { class: 'mon-scr' }, h('span', { class: 'mon-no' }, 'MODULE ' + no(i)), h('span', { class: 'mon-name' }, m.name), h('span', { class: 'mon-tech' }, m.tech.join(' · ')), h('span', { class: 'mon-cta' }, '▸ Power on'), h('span', { class: 'mon-beam' })),
      h('span', { class: 'mon-plate', 'aria-hidden': 'true' }, 'PP-LAB ' + no(i)));
    rack.append(h('li', {}, b)); return b;
  });
  host.replaceChildren(rack, stage);
  host.classList.add('ready');

  // arrow keys walk the rack; Escape steps back from a module before it closes the panel
  rack.addEventListener('keydown', e => {
    const i = mons.indexOf(document.activeElement), d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (i < 0 || !d) return; e.preventDefault(); mons[(i + d + mons.length) % mons.length].focus();
  });
  host.addEventListener('keydown', e => { if (e.key === 'Escape' && open >= 0) { e.stopPropagation(); close(true); } });

  function power(i) {
    if (busy) return; blip(440);
    if (still() || !G) return show(i);
    busy = true; const beam = mons[i].querySelector('.mon-beam'); mons[i].classList.add('on');
    G.timeline({ onComplete: () => { busy = false; mons[i].classList.remove('on'); G.set(beam, { clearProps: 'all' }); show(i); } })
      .fromTo(beam, { scaleY: .03, scaleX: .2, opacity: 1 }, { scaleX: 1, duration: .16, ease: 'power2.out' })
      .to(beam, { scaleY: 1, duration: .2, ease: 'power3.out' })
      .to(beam, { opacity: 0, duration: .16 });
  }
  function show(i) {
    const m = MODS[i]; open = i; blip(880);
    const title = h('h3', { tabindex: '-1' }, m.name);
    const demo = h('div', { class: 'dm' });
    const scr = h('div', { class: 'ws-scr' },
      h('p', { class: 'ws-id' }, `MODULE ${no(i)} // ${m.line}`), title,
      h('ul', { class: 'ws-tech', 'aria-label': 'Technologies' }, m.tech.map(t => h('li', {}, t))),
      h('h4', {}, 'What I work with'), h('ul', { class: 'ws-list' }, m.know.map(t => h('li', {}, t))),
      h('h4', {}, 'Related projects'),
      m.proj.length ? h('ul', { class: 'ws-proj' }, m.proj.map(([c, name, text]) => h('li', {}, h('button', { type: 'button', onclick: () => { if (hook().openCase) hook().openCase(c); else location.hash = 'work'; } }, h('b', {}, name), h('span', {}, text), h('i', { 'aria-hidden': 'true' }, 'Case study →'))))) : h('p', { class: 'ws-note' }, m.projNote),
      h('h4', {}, 'Try it: ' + m.demoName), demo);
    const ws = h('div', { class: 'ws', role: 'region', 'aria-label': m.name + ' workstation' },
      h('div', { class: 'ws-bar' }, h('button', { type: 'button', class: 'lab-back', onclick: () => close(true) }, '← All modules'), h('span', { class: 'ws-led', 'aria-hidden': 'true' })),
      scr,
      h('button', { type: 'button', class: 'lab-next', onclick: () => show((i + 1) % MODS.length) }, 'Next: ' + MODS[(i + 1) % MODS.length].name + ' →'));
    stage.replaceChildren(ws); stage.hidden = false; rack.hidden = true; host.classList.add('open');
    m.demo(demo);
    const sb = document.getElementById('sheetBody');
    // bring the workstation to the top of the panel (or of the page, in Quick read)
    if (document.documentElement.classList.contains('text-mode')) scrollBy(0, host.getBoundingClientRect().top - 90);
    else if (sb) sb.scrollTop += host.getBoundingClientRect().top - sb.getBoundingClientRect().top - 14;
    title.focus({ preventScroll: true });
    if (!still() && G) {
      G.fromTo(scr, { scaleY: .02, filter: 'brightness(2.4)' }, { scaleY: 1, filter: 'brightness(1)', duration: .4, ease: 'power3.out', clearProps: 'transform,filter' });
      G.from(scr.children, { opacity: 0, y: 6, duration: .3, stagger: .035, delay: .22, ease: 'power2.out', clearProps: 'opacity,transform' });
    }
  }
  function close(focusBack) {
    const i = open; if (i < 0) return; open = -1;
    stage.replaceChildren(); stage.hidden = true; rack.hidden = false; host.classList.remove('open');
    if (focusBack) { blip(330); mons[i].focus({ preventScroll: true }); }
  }
  addEventListener('hashchange', () => { if (location.hash !== '#stack') close(false); });
  window.__lab = { open: show, close, mods: MODS.length };
})();
