/*
 * Engineering lab: the Skills section as five CRT workstations (#lab in room.html).
 * Each module lists the technologies, what I work with, the related case studies, and a small demo.
 *
 * The demos are connected: one sample enquiry can be written in the Frontend Studio, posted to the sample API in the
 * Backend Engine, found in the Database Console, qualified in the AI Research Lab and traced in System Architecture.
 * Each module also works on its own. Every demo runs in the visitor's browser on sample data and is labelled as
 * simulated; nothing typed here leaves the page. The one exception is labelled LIVE: a GET to this site's /api/geo.
 *
 * "View the code" prints the real functions below (validateEnquiry, leadsApi, searchFullText, qualifyByRules) with
 * Function.prototype.toString, so they are written to be read.
 * No framework: plain DOM, GSAP (already on the page) for motion, and the desk's own sound switch (off by default)
 * for the blips. Reduced motion skips every animation.
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
  const put = (box, ...kids) => kids.flat().forEach(c => { if (c != null) box.append(c); });
  // a row of toggle buttons where exactly one is pressed
  function choice(labels, onPick, name, start = 0) {
    const btns = labels.map((l, i) => h('button', { type: 'button', class: 'dm-btn', 'aria-pressed': i === start ? 'true' : 'false', onclick: () => { btns.forEach((b, k) => b.setAttribute('aria-pressed', k === i ? 'true' : 'false')); blip(700); onPick(i); } }, l));
    return h('div', { class: 'dm-row', role: 'group', 'aria-label': name }, btns);
  }
  // JSON with keys, strings and literals coloured (everything is escaped first)
  const paint = v => esc(JSON.stringify(v, null, 2)).replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?/g,
    (m, s, colon) => s ? (colon ? `<i class="k">${s}</i>:` : `<i class="s">${s}</i>`) : `<i class="n">${m}</i>`);
  // "View the code": the source of the functions a demo really runs
  const source = fn => { const l = fn.toString().split('\n'), ind = Math.min(...l.slice(1).filter(x => x.trim()).map(x => x.match(/^ */)[0].length)); return l.map((x, i) => i ? x.slice(ind) : x).join('\n'); };
  function codeView(...fns) {
    const pre = h('pre', { class: 'dm-out code', hidden: true, tabindex: '0', 'aria-label': 'Source code of this demo' }, fns.map(source).join('\n\n'));
    const b = h('button', { type: 'button', class: 'dm-btn ghost', 'aria-expanded': 'false', onclick: () => { pre.hidden = !pre.hidden; b.setAttribute('aria-expanded', String(!pre.hidden)); b.textContent = pre.hidden ? '</> View the code' : '</> Hide the code'; blip(700); } }, '</> View the code');
    return [h('div', { class: 'dm-row' }, b), pre];
  }

  /* ---------- shared state: the sample store, and the visitor's one enquiry ---------- */
  const S = {
    lead: null,            // { name, email, subject, message, id, found, verdict, traced }
    visited: new Set(), allShown: false,
    nextId: 7,
    store: [
      { id: 1, name: 'Sample Lead A', email: 'a@example.test', status: 'new', subject: 'Deposit not returned', message: 'My landlord has kept my deposit for three months since I moved out.' },
      { id: 2, name: 'Sample Lead B', email: 'b@example.test', status: 'contacted', subject: 'Question about a contract', message: 'I signed a contract for building work and the builder has stopped replying.' },
      { id: 3, name: 'Sample Lead C', email: 'c@example.test', status: 'new', subject: 'Something at work', message: 'I think I might need a lawyer for something at work.' },
      { id: 4, name: 'Sample Lead D', email: 'd@example.test', status: 'new', subject: 'Unpaid invoices', message: 'A client has not paid three invoices and ignores my emails.' },
      { id: 5, name: 'Sample Lead E', email: 'e@example.test', status: 'closed', subject: 'Parking fine', message: 'I want to dispute a parking fine I received last month.' },
      { id: 6, name: 'Sample Lead F', email: 'f@example.test', status: 'new', subject: 'Returning a faulty laptop', message: 'The shop refuses to refund a laptop that stopped working after a week.' },
    ],
  };

  /* ---------- the code the demos run (shown by "View the code") ---------- */

  // Used twice: by the form before it sends, and by the API when the request arrives.
  function validateEnquiry(input) {
    const text = key => (typeof input[key] === 'string' ? input[key].trim() : '');
    const errors = {};
    if (!text('name')) errors.name = 'Name is required.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text('email'))) errors.email = 'Enter a valid email address.';
    if (!text('subject')) errors.subject = 'Subject is required.';
    if (text('message').length < 10) errors.message = 'Write at least 10 characters.';
    return errors;
  }

  // The sample REST API. Returns [status, body, headers].
  function leadsApi(method, path, bodyText) {
    const [route, queryString] = path.split('?');
    const match = route.match(/^\/leads(?:\/(\d+))?$/);
    if (!match) return [404, { error: 'not_found', message: 'No such route.' }];
    const id = match[1] ? Number(match[1]) : null;

    if (method === 'GET' && id === null) {
      const status = new URLSearchParams(queryString || '').get('status');
      const rows = S.store.filter(lead => !status || lead.status === status);
      const data = rows.map(({ id, name, subject, status }) => ({ id, name, subject, status }));
      return [200, { data, meta: { count: data.length } }];
    }
    if (method === 'GET') {
      const lead = S.store.find(row => row.id === id);
      return lead ? [200, { data: lead }] : [404, { error: 'not_found', message: `Lead ${id} does not exist.` }];
    }
    if (method === 'POST' && id === null) {
      let input;
      try { input = JSON.parse(bodyText); } catch (e) { return [400, { error: 'bad_request', message: 'The body is not valid JSON.' }]; }
      if (!input || typeof input !== 'object') return [400, { error: 'bad_request', message: 'Send a JSON object.' }];
      const errors = validateEnquiry(input);          // never trust the client: validate again
      if (Object.keys(errors).length) return [422, { error: 'validation_failed', errors }];
      const email = input.email.trim();
      if (S.store.some(row => row.email === email)) return [409, { error: 'conflict', message: 'A lead with this email already exists.' }];
      const lead = { id: S.nextId++, name: input.name.trim().slice(0, 80), email: email.slice(0, 120), status: 'new', subject: input.subject.trim().slice(0, 120), message: input.message.trim().slice(0, 500) };
      S.store.push(lead);
      return [201, { data: lead }, { Location: '/leads/' + lead.id }];
    }
    if (method === 'DELETE' && id !== null) {
      return [401, { error: 'unauthorized', message: 'This route needs an Authorization header.' }, { 'WWW-Authenticate': 'Bearer' }];
    }
    return [405, { error: 'method_not_allowed' }, { Allow: id === null ? 'GET, POST' : 'GET, DELETE' }];
  }

  // Full-text search: analyse the words, match any term, rank by rarity and field.
  const STOP_WORDS = new Set('the a an to of for and or is are has have your you by on in as we from be use my how do i it that'.split(' '));
  function stem(word) {
    let s = word.length > 4 ? word.replace(/(ing|ed|es|s)$/, '') : word;   // passwords -> password
    s = s.replace(/(.)\1$/, '$1');                                         // resett -> reset
    return s.replace(/e$/, '');                                            // invoice -> invoic
  }
  function analyse(text) {
    return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(word => !STOP_WORDS.has(word)).map(stem);
  }
  function searchFullText(rows, query) {
    const terms = [...new Set(analyse(query))];
    const docs = rows.map(row => ({ row, subject: analyse(row.subject), message: analyse(row.message) }));
    const count = (list, term) => list.filter(t => t === term).length;
    const hits = docs.map(doc => {
      let score = 0;
      for (const term of terms) {
        const docsWithTerm = docs.filter(d => d.subject.includes(term) || d.message.includes(term)).length;
        if (!docsWithTerm) continue;
        const rarity = Math.log(1 + docs.length / docsWithTerm);            // rarer terms count for more
        score += rarity * (2 * count(doc.subject, term) + count(doc.message, term));   // subject^2
      }
      return { row: doc.row, score };
    });
    return { terms, hits: terms.length ? hits.filter(hit => hit.score > 0).sort((a, b) => b.score - a.score || a.row.id - b.row.id) : hits };
  }

  // Stand-in for the model in this demo: three keyword rules, so the result can be explained.
  function qualifyByRules(text) {
    const signals = {
      specific: text.trim().split(/\s+/).length >= 12,
      timeframe: /\b(yesterday|today|last|ago|since|\d+\s*(day|week|month|year)s?|a (day|week|month|year))\b/i.test(text),
      documents: /\b(agreement|contract|receipt|invoice|letter|email|document|record)s?\b/i.test(text),
    };
    const met = Object.values(signals).filter(Boolean).length;
    const verdict = met === 3 ? 'Strong lead' : met === 0 ? 'Weak lead' : 'Needs more information';
    return { signals, verdict };
  }

  /* ---------- the thread through the lab: Form -> API -> Search -> Qualify -> Flow ---------- */
  const TRAIL = [['Form', 1, l => !!l], ['API', 0, l => l && l.id], ['Search', 2, l => l && l.found], ['Qualify', 3, l => l && l.verdict], ['Flow', 4, l => l && l.traced]];
  let trailHost = null, openIdx = -1;
  function drawTrail() {
    if (!trailHost) return;
    trailHost.replaceChildren(h('span', { class: 'dm-lbl' }, S.lead ? 'Your enquiry’s path' : 'Follow one enquiry: start at the form'),
      h('ol', {}, TRAIL.map(([label, mod, done], k) => h('li', {}, h('button', { type: 'button', class: done(S.lead) ? 'done' : '', 'aria-current': mod === openIdx ? 'step' : null, 'aria-label': `Step ${k + 1}, ${label}${done(S.lead) ? ', done' : ''}`, onclick: () => show(mod) }, h('i', { 'aria-hidden': 'true' }, done(S.lead) ? '✓' : String(k + 1)), label)))));
  }
  // the "next stop" button a demo shows when its step is done
  const offer = (box, text, mod) => { if (box.dataset.mod === String(mod)) return; box.dataset.mod = mod; box.replaceChildren(h('button', { type: 'button', class: 'dm-btn go', onclick: () => show(mod) }, text + ' →')); };

  /* ---------- 02 Frontend: the enquiry form ---------- */
  function demoFrontend(box) {
    const ACC = [['Amber', '#E8913C'], ['Green', '#86EFAC'], ['Teal', '#5FA3AB']];
    const st = { accent: ACC[0][1], radius: 10 };
    const start = S.lead || { name: 'Sample Visitor', email: 'visitor@example.test', subject: 'Flat sale fell through', message: 'The buyer pulled out of my flat sale a day before completion, after we had signed the agreement. Can I recover my costs?' };
    const FIELDS = [['name', 'Name', 'input'], ['email', 'Email', 'input'], ['subject', 'Subject', 'input'], ['message', 'Message', 'textarea']];
    const ins = {}, errs = {};
    const rows = FIELDS.map(([key, label, tag]) => {
      ins[key] = h(tag, { class: 'dm-in', id: 'labF_' + key, name: key, rows: tag === 'textarea' ? 3 : null, type: tag === 'input' ? (key === 'email' ? 'email' : 'text') : null, maxlength: key === 'message' ? 500 : 120, autocomplete: 'off', 'aria-describedby': 'labE_' + key });
      ins[key].value = start[key]; errs[key] = h('p', { class: 'dm-err', id: 'labE_' + key });
      return h('div', { class: 'dm-field' }, h('label', { for: 'labF_' + key }, label), ins[key], errs[key]);
    });
    const btn = h('button', { type: 'submit', class: 'fx-btn', 'data-state': 'idle' }, h('span', { class: 'fx-ico', 'aria-hidden': 'true' }), h('span', { class: 'fx-lbl' }, 'Send enquiry'));
    const state = h('p', { class: 'fx-state', 'aria-live': 'polite' }, 'state: idle');
    const next = h('div', { class: 'dm-row' });
    const css = h('pre', { class: 'dm-out', 'aria-label': 'The button’s CSS variables' });
    const set = s => { btn.dataset.state = s; btn.setAttribute('aria-busy', s === 'loading' ? 'true' : 'false'); btn.querySelector('.fx-lbl').textContent = { idle: 'Send enquiry', loading: 'Sending…', done: 'Sent' }[s]; state.textContent = 'state: ' + s; };
    function paintCss() {
      btn.style.setProperty('--fx-accent', st.accent); btn.style.setProperty('--fx-radius', st.radius + 'px');
      css.innerHTML = `<i class="k">.send-btn</i> {\n  --accent: <i class="s">${st.accent}</i>;\n  --radius: <i class="n">${st.radius}px</i>;\n}`;
    }
    async function submit(e) {
      e.preventDefault(); if (btn.dataset.state === 'loading') return;
      const input = {}; FIELDS.forEach(([k]) => { input[k] = ins[k].value; });
      const errors = validateEnquiry(input);
      FIELDS.forEach(([k]) => { errs[k].textContent = errors[k] || ''; ins[k].setAttribute('aria-invalid', errors[k] ? 'true' : 'false'); });
      const bad = FIELDS.find(([k]) => errors[k]);
      if (bad) { blip(220); state.textContent = 'state: invalid'; ins[bad[0]].focus(); return; }
      blip(620); set('loading'); await wait(800); if (!btn.isConnected) return;
      S.lead = { name: input.name.trim(), email: input.email.trim(), subject: input.subject.trim(), message: input.message.trim(), id: null, found: false, verdict: null, traced: false };
      blip(940); set('done'); drawTrail(); delete next.dataset.mod; offer(next, 'Post it to the Backend Engine', 0);
      setTimeout(() => btn.isConnected && set('idle'), 1500);
    }
    put(box, 
      h('p', { class: 'sim' }, 'Simulated: nothing leaves your browser. The form is pre-filled with sample text, so there is no need to enter real details.'),
      h('form', { class: 'fx-stage', novalidate: true, onsubmit: submit, 'aria-label': 'Sample enquiry form' }, rows, btn, state), next,
      h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'Restyle the button'), choice(ACC.map(a => a[0]), i => { st.accent = ACC[i][1]; paintCss(); }, 'Accent colour')),
      h('div', { class: 'dm-field' }, h('label', { for: 'labRad' }, 'Corner radius'), h('input', { type: 'range', id: 'labRad', min: 0, max: 22, value: st.radius, oninput: e => { st.radius = +e.target.value; paintCss(); } })),
      css, codeView(validateEnquiry));
    paintCss();
    if (S.lead && !S.lead.id) offer(next, 'Post it to the Backend Engine', 0);
  }

  /* ---------- 01 Backend: an API console ---------- */
  function demoBackend(box) {
    const REASON = { 200: 'OK', 201: 'Created', 400: 'Bad Request', 401: 'Unauthorized', 404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 422: 'Unprocessable Content' };
    const L = S.lead, mine = L && !L.id;
    const presets = [
      mine ? { label: 'Your enquiry', method: 'POST', path: '/leads', body: { name: L.name, email: L.email, subject: L.subject, message: L.message } }
        : { label: 'Create', method: 'POST', path: '/leads', body: { name: 'Sample Lead G', email: 'g@example.test', subject: 'Late delivery', message: 'An order I paid for last week has still not arrived.' } },
      { label: 'List', method: 'GET', path: '/leads?status=new' },
      { label: 'Not found', method: 'GET', path: '/leads/99' },
      { label: 'Invalid', method: 'POST', path: '/leads', body: { name: '', email: 'not-an-email', subject: 'Hello', message: 'Hi' } },
      { label: 'No token', method: 'DELETE', path: '/leads/2' },
      { label: 'Live: /api/geo', method: 'GET', path: '/api/geo' },
    ];
    let run = 0;
    const note = h('p', { class: 'sim' });
    const method = h('select', { class: 'dm-in', id: 'labMethod', 'aria-label': 'Method', onchange: sync }, ['GET', 'POST', 'PUT', 'DELETE'].map(m => h('option', {}, m)));
    const path = h('input', { class: 'dm-in', id: 'labPath', type: 'text', 'aria-label': 'Path', maxlength: 80, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', oninput: sync, onkeydown: e => { if (e.key === 'Enter') fire(); } });
    const bodyIn = h('textarea', { class: 'dm-in', id: 'labBody', rows: 6, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off' });
    const bodyWrap = h('div', { class: 'dm-field' }, h('label', { for: 'labBody' }, 'Request body'), bodyIn);
    const res = h('pre', { class: 'dm-out res', 'aria-live': 'polite', 'aria-label': 'Response' });
    const send = h('button', { type: 'button', class: 'dm-btn go', onclick: fire }, 'Send request');
    const next = h('div', { class: 'dm-row' });
    const isLive = () => method.value === 'GET' && path.value.trim().split('?')[0] === '/api/geo';
    function sync() {
      const live = isLive();
      note.textContent = live
        ? 'Live: a real request to this site’s own Worker. It returns your approximate city from Cloudflare’s network data. Nothing is stored.'
        : 'Simulated: a sample API running in your browser on made-up records. Routing, validation and status codes are real code. Try any method and path.';
      note.classList.toggle('live', live);
      bodyWrap.hidden = !/^(POST|PUT)$/.test(method.value);
    }
    function load(i) { const p = presets[i]; run++; method.value = p.method; path.value = p.path; bodyIn.value = p.body ? JSON.stringify(p.body, null, 2) : ''; sync(); res.textContent = 'Press “Send request”.'; res.dataset.s = ''; send.disabled = false; }
    function print(status, body, headers, ms) {
      const head = Object.entries(Object.assign({ 'Content-Type': 'application/json' }, headers)).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('\n');
      res.dataset.s = String(status)[0];
      res.innerHTML = `<b>HTTP/1.1 ${status} ${esc(REASON[status] || '')}</b>\n${head}\n\n${typeof body === 'string' ? esc(body) : paint(body)}` + (ms != null ? `\n\n<i class="c"># ${ms} ms, measured in your browser</i>` : '');
    }
    async function fire() {
      const me = ++run; blip(520); send.disabled = true; res.dataset.s = ''; res.textContent = 'Sending…';
      try {
        if (isLive()) {
          const t0 = performance.now(), ac = new AbortController(), to = setTimeout(() => ac.abort(), 8000);
          const r = await fetch('/api/geo', { headers: { Accept: 'application/json' }, signal: ac.signal, credentials: 'omit' });
          const text = await r.text(); clearTimeout(to); if (me !== run) return;
          let body = 'The response was not JSON: this server does not run the Worker. /api/geo answers on the deployed site.'; try { body = JSON.parse(text); } catch (e) {}
          print(r.status, body, { 'Content-Type': r.headers.get('content-type') || 'unknown' }, Math.round(performance.now() - t0));
        } else {
          await wait(380); if (me !== run) return;
          const p = path.value.trim() || '/';
          const [status, body, headers] = leadsApi(method.value, p.startsWith('/') ? p : '/' + p, bodyIn.value);
          print(status, body, headers);
          if (status === 201 && S.lead && !S.lead.id && body.data.email === S.lead.email) { S.lead.id = body.data.id; drawTrail(); offer(next, 'Find it in the Database Console', 2); }
        }
        blip(880);
      } catch (e) {
        if (me === run) { res.dataset.s = '5'; res.textContent = 'The request failed: /api/geo could not be reached from this page. Nothing is shown in its place.'; }
      } finally { if (me === run) send.disabled = false; }
    }
    put(box, note, choice(presets.map(p => p.label), load, 'Sample requests'),
      h('div', { class: 'dm-req' }, method, path), bodyWrap, h('div', { class: 'dm-row' }, send), res, next, codeView(leadsApi, validateEnquiry));
    load(0);
    if (S.lead && S.lead.id && !S.lead.found) offer(next, 'Find it in the Database Console', 2);
  }

  /* ---------- 03 Database: LIKE against ranked full-text search ---------- */
  function demoDatabase(box) {
    let mode = 0;
    const input = h('input', { class: 'dm-in', id: 'labQ', type: 'search', placeholder: 'Try: refund laptops', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: 60, oninput: search });
    const query = h('pre', { class: 'dm-out', 'aria-label': 'The query this search runs' });
    const why = h('p', { class: 'dm-why' });
    const count = h('p', { class: 'dm-count', 'aria-live': 'polite' });
    const list = h('ol', { class: 'dm-res' });
    const next = h('div', { class: 'dm-row' });
    const markLike = (text, q) => { const i = q ? text.toLowerCase().indexOf(q) : -1; return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length)); };
    const markTerms = (text, set) => text.split(/([A-Za-z0-9]+)/).map(p => /^[A-Za-z0-9]+$/.test(p) && set.has(stem(p.toLowerCase())) ? '<mark>' + esc(p) + '</mark>' : esc(p)).join('');
    function search() {
      const raw = input.value.trim(), q = raw.toLowerCase(), sq = esc(raw.replace(/'/g, "''"));
      let hits;
      if (mode === 0) {
        hits = S.store.filter(r => !q || r.subject.toLowerCase().includes(q) || r.message.toLowerCase().includes(q)).map(r => ({ row: r, t: markLike(r.subject, q), b: markLike(r.message, q) }));
        query.innerHTML = q ? `<i class="k">SELECT</i> id, subject <i class="k">FROM</i> leads\n<i class="k">WHERE</i> subject <i class="k">LIKE</i> <i class="s">'%${sq}%'</i>\n   <i class="k">OR</i> message <i class="k">LIKE</i> <i class="s">'%${sq}%'</i>\n<i class="k">ORDER BY</i> id;` : `<i class="k">SELECT</i> id, subject <i class="k">FROM</i> leads <i class="k">ORDER BY</i> id;`;
        why.textContent = 'LIKE looks for these exact characters, in this order. It cannot rank: rows come back in id order, and “laptops” will not find “laptop”.';
      } else {
        const found = searchFullText(S.store, raw), set = new Set(found.terms);
        hits = found.hits.map(x => ({ row: x.row, score: found.terms.length ? x.score : null, t: markTerms(x.row.subject, set), b: markTerms(x.row.message, set) }));
        query.innerHTML = found.terms.length
          ? `<b>GET</b> /leads/_search\n{\n  <i class="k">"query"</i>: {\n    <i class="k">"multi_match"</i>: {\n      <i class="k">"query"</i>: <i class="s">"${esc(raw.replace(/["\\]/g, ''))}"</i>,\n      <i class="k">"fields"</i>: [<i class="s">"subject^2"</i>, <i class="s">"message"</i>]\n    }\n  }\n}`
          : `<b>GET</b> /leads/_search\n{ <i class="k">"query"</i>: { <i class="k">"match_all"</i>: {} } }`;
        why.textContent = found.terms.length
          ? `The text is split into terms and reduced to stems (${found.terms.join(', ')}). Any term can match. Rarer terms and matches in the subject count for more, so the best row comes first. The scores are a simplified model worked out in your browser.`
          : 'Full-text search analyses the words instead of matching characters. Type a query to see the terms and the ranking.';
      }
      const L = S.lead;
      count.textContent = hits.length + (hits.length === 1 ? ' row' : ' rows') + ' of ' + S.store.length;
      list.innerHTML = hits.map(x => `<li${L && x.row.id === L.id ? ' class="yours"' : ''}><span class="t">${x.t}</span><span class="b">${x.b}</span><span class="m">id ${x.row.id} · ${esc(x.row.name)} · ${x.row.status}${x.score != null ? ' · score ' + x.score.toFixed(2) : ''}${L && x.row.id === L.id ? ' · your enquiry' : ''}</span></li>`).join('') || '<li class="none">No rows match.</li>';
      if (L && L.id && q && hits.some(x => x.row.id === L.id)) { if (!L.found) { L.found = true; drawTrail(); blip(940); } offer(next, 'Qualify it in the AI Research Lab', 3); }
    }
    const L = S.lead;
    const samples = ['deposit', 'refund laptops', 'builder contracts'];
    put(box, 
      h('p', { class: 'sim' }, 'Simulated: sample enquiries written for this demo' + (L && L.id ? ', plus the one you posted' : '') + '. No database is connected; both searches run in your browser.'),
      L && !L.id ? h('p', { class: 'dm-why' }, 'Your enquiry is not stored yet. Post it from the Backend Engine and it will appear here.') : null,
      choice(['MySQL LIKE', 'Full-text search'], i => { mode = i; search(); }, 'Search method'),
      h('div', { class: 'dm-field' }, h('label', { for: 'labQ' }, 'Search the sample enquiries'), input),
      h('div', { class: 'dm-row' }, samples.map(s => h('button', { type: 'button', class: 'dm-btn ghost', onclick: () => { input.value = s; blip(700); search(); } }, s))),
      query, why, count, list, next, codeView(searchFullText, analyse, stem));
    search();
  }

  /* ---------- 04 AI: a lead qualification workflow ---------- */
  function demoAI(box) {
    const SAMPLES = [
      { label: 'Enquiry A', msg: 'My landlord has kept my deposit for three months since I moved out. Can someone help?',
        ask: 'Do you have the tenancy agreement, and roughly how much is the deposit?', ans: 'Yes, I have the agreement. It was two months of rent.',
        fields: { topic: 'tenancy deposit', documents: true, timeframe: '3 months', follow_up_answered: true },
        verdict: 'Strong lead', why: ['Specific problem', 'Documents available', 'Clear timeframe'] },
      { label: 'Enquiry B', msg: 'I think I might need a lawyer for something at work.',
        ask: 'What happened at work, and when?', ans: 'I would rather not say yet.',
        fields: { topic: 'employment (unclear)', documents: null, timeframe: null, follow_up_answered: false },
        verdict: 'Needs more information', why: ['Topic is vague', 'No timeframe', 'Follow-up not answered'] },
      { label: 'Enquiry C', msg: 'What is the capital of France?',
        ask: null, fields: { topic: 'not a legal request', documents: null, timeframe: null, follow_up_answered: null },
        verdict: 'Not a lead', why: ['Not a request for help with a legal problem'] },
    ];
    const ROUTE = { 'Strong lead': 'Passed on, with the summary attached.', 'Needs more information': 'Not passed on yet. The user is invited to share more.', 'Weak lead': 'Not passed on. The user is pointed to general help.', 'Not a lead': 'Answered politely and closed.' };
    const TONE = { 'Strong lead': 'ok', 'Needs more information': 'mid', 'Weak lead': 'no', 'Not a lead': 'no' };
    const RULES = { specific: 'At least 12 words', timeframe: 'Mentions when it happened', documents: 'Mentions a document' };
    const opts = (S.lead ? [{ label: 'Your enquiry', msg: S.lead.message, own: true }] : []).concat(SAMPLES);
    let cur = 0, run = 0;
    const steps = h('ol', { class: 'ai-steps', 'aria-live': 'polite' });
    const go = h('button', { type: 'button', class: 'dm-btn go', onclick: play }, 'Run workflow');
    const how = h('p', { class: 'dm-why' });
    const next = h('div', { class: 'dm-row' });
    const li = (n, title, body) => h('li', { class: 'ai-step' }, h('span', { class: 'ai-n' }, n), h('div', {}, h('b', {}, title), body));
    const intake = o => li('01', 'Intake', h('p', { class: 'ai-q' }, '“' + o.msg + '”'));
    function reset(i) {
      cur = i; run++; steps.replaceChildren(intake(opts[i])); go.disabled = false; go.textContent = 'Run workflow';
      how.textContent = opts[i].own ? 'Your enquiry is checked by three keyword rules in your browser, standing in for the model so the result can be explained.' : 'A fictional enquiry with pre-written outputs.';
    }
    async function play() {
      const me = ++run, o = opts[cur]; go.disabled = true; blip(520);
      steps.replaceChildren(intake(o));
      const add = async el => { await wait(650); if (me !== run) return false; steps.append(el); blip(760); if (!still() && G) G.from(el, { opacity: 0, y: 8, duration: .35, ease: 'power2.out', clearProps: 'opacity,transform' }); return true; };
      let fields = o.fields, verdict = o.verdict, why;
      if (o.own) {
        const r = qualifyByRules(o.msg); fields = r.signals; verdict = r.verdict;
        why = h('ul', { class: 'ai-why' }, Object.keys(RULES).map(k => h('li', { class: r.signals[k] ? 'yes' : 'no' }, (r.signals[k] ? '✓ ' : '✗ ') + RULES[k])));
      } else why = h('ul', { class: 'ai-why' }, o.why.map(w => h('li', {}, w)));
      const follow = o.own ? h('p', {}, 'Skipped in this demo: the rules read only what you wrote.') : o.ask ? h('div', {}, h('p', { class: 'ai-llm' }, 'Model asks: ' + o.ask), h('p', { class: 'ai-q' }, 'User: “' + o.ans + '”')) : h('p', {}, 'Skipped: nothing to clarify.');
      if (!await add(li('02', 'Follow-up question', follow))) return;
      if (!await add(li('03', o.own ? 'Check the rules' : 'Extract fields', h('pre', { class: 'dm-out', html: paint(fields) })))) return;
      if (!await add(li('04', 'Qualify', h('div', {}, h('p', { class: 'ai-v ' + TONE[verdict] }, verdict), why)))) return;
      if (!await add(li('05', 'Route', h('p', {}, ROUTE[verdict])))) return;
      go.disabled = false; go.textContent = 'Run again';
      if (o.own && S.lead) { S.lead.verdict = verdict; drawTrail(); offer(next, 'See how the real site handles a message', 4); }
    }
    put(box, 
      h('p', { class: 'sim' }, 'Simulated: no model is called. Sample enquiries are fictional with pre-written outputs. It shows the general pattern, not WebMD’s system or its rules.'),
      choice(opts.map(o => o.label), reset, 'Enquiries'), how, h('div', { class: 'dm-row' }, go), steps, next, codeView(qualifyByRules));
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
      const me = ++run; clear(); log.replaceChildren(); if (G) G.killTweensOf(dot);
      const moving = G && !still();
      for (const [a, b, text] of FLOWS[i].steps) {
        if (moving) clear();
        lines[a + b].classList.add('on'); nodes[a].classList.add('lit'); nodes[b].classList.add('lit');
        log.append(h('li', {}, h('span', {}, N[a].name + ' → ' + N[b].name), text));
        if (moving) {
          dot.hidden = false;
          await new Promise(r => G.fromTo(dot, { left: N[a].x + '%', top: N[a].y + '%' }, { left: N[b].x + '%', top: N[b].y + '%', duration: .85, ease: 'power1.inOut', onComplete: r, onInterrupt: r }));
          if (me !== run || !map.isConnected) return;
          blip(760); await wait(350);
          if (me !== run || !map.isConnected) return;
        }
      }
      dot.hidden = true; if (moving) clear();
    }
    const L = S.lead, first = L ? 1 : 0;
    let journey = null;
    if (L) {
      L.traced = true; drawTrail();
      journey = h('div', { class: 'ar-info' }, h('b', {}, 'Your sample enquiry'),
        h('p', {}, 'It never left this browser. In the lab it went: form, validated' + (L.id ? `; sample API, stored as id ${L.id}` : '; sample API, not posted yet') + (L.found ? '; found by search' : '') + (L.verdict ? `; rules, “${L.verdict}”` : '') + '.'),
        h('p', {}, 'On the real site, a contact message takes the path below.'));
    }
    put(box, 
      h('p', { class: 'sim live' }, 'Real architecture: this is how this site works. The animation is a diagram; it sends no requests.'), journey,
      h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'Follow a request'), choice(FLOWS.map(f => f.label), play, 'Data flows', first)),
      map, log, info);
    play(first);
  }

  /* ---------- the five modules ---------- */
  const MODS = [
    { name: 'Backend Engine', keys: 'backend back api php laravel', line: 'APIs and server-side code', tech: ['PHP', 'Laravel', 'CodeIgniter', 'Node.js', 'REST APIs'],
      know: ['Server-side application code in PHP, with Laravel and CodeIgniter.', 'REST API design: resources, validation, status codes and consistent error shapes.', 'Keeping keys and third-party calls on the server, out of page code.'],
      proj: [[2, 'Nolo CMS', 'Sole developer. WebMD, confidential.'], [3, 'This site’s API', 'A Cloudflare Worker with two endpoints. Public code.']],
      demoName: 'API console', demo: demoBackend },
    { name: 'Frontend Studio', keys: 'frontend front ui javascript js css html', line: 'Interfaces in the browser', tech: ['JavaScript', 'jQuery', 'HTML', 'CSS'],
      know: ['Interfaces in plain JavaScript and jQuery, without depending on a framework.', 'Semantic HTML, keyboard access and responsive CSS.', 'Turning designs into working HTML.'],
      proj: [[1, 'Figma-to-HTML skill', 'Turns Figma designs into HTML. Used across the IB team.'], [3, 'Prathamesh’s Desk', 'This site: one HTML page, no framework or bundler.']],
      demoName: 'Enquiry form', demo: demoFrontend },
    { name: 'Database Console', keys: 'database db data mysql elasticsearch search sql', line: 'Data modelling and search', tech: ['MySQL', 'Elasticsearch', 'Data modelling', 'Search'],
      know: ['Relational data modelling and queries in MySQL.', 'Full-text search with Elasticsearch: analysed text and relevance ranking.', 'Choosing between an exact database lookup and a ranked search.'],
      proj: [], projNote: 'Used in product and client work. Those projects and their data are not public.',
      demoName: 'Search console', demo: demoDatabase },
    { name: 'AI Research Lab', keys: 'ai llm mcp claude research', line: 'LLM features and agent tooling', tech: ['LLM integrations', 'MCP', 'Claude Code', 'Claude API', 'Figma MCP', 'Cline'],
      know: ['Working on LLM features that run in a production product.', 'Connecting tools to coding agents through the Model Context Protocol.', 'Writing agent skills a whole team can reuse, to speed up development.'],
      proj: [[0, 'AI lead qualification engine', 'An LLM asks follow-up questions and scores leads. WebMD, confidential.'], [1, 'Figma-to-HTML skill', 'Figma MCP with Claude Code and Cline.']],
      demoName: 'Lead qualification workflow', demo: demoAI },
    { name: 'System Architecture', keys: 'architecture system arch design flow', line: 'How the parts fit together', tech: ['API architecture', 'Application design', 'Data flow', 'Engineering decisions'],
      know: ['Deciding what runs in the browser, on the server and in outside services.', 'Designing so that failures are reported, never hidden.', 'Keeping a system small enough for one person to own end to end.'],
      proj: [[3, 'Prathamesh’s Desk', 'The architecture below. Public code.'], [2, 'Nolo CMS', 'Sole developer. Architecture not public.']],
      demoName: 'Data flow of this site', demo: demoArch },
  ];
  const no = i => String(i + 1).padStart(2, '0');

  let busy = false;
  const status = h('p', { class: 'lab-status', 'aria-live': 'polite' });
  const rack = h('ul', { class: 'lab-rack', 'aria-label': 'Engineering modules' });
  const stage = h('div', { class: 'lab-stage', hidden: true });
  const mons = MODS.map((m, i) => {
    const b = h('button', { type: 'button', class: 'mon', 'aria-label': `Module ${no(i)}, ${m.name}: ${m.tech.join(', ')}. Switch on.`, onclick: () => power(i) },
      h('span', { class: 'mon-scr' }, h('span', { class: 'mon-no' }, 'MODULE ' + no(i)), h('span', { class: 'mon-name' }, m.name), h('span', { class: 'mon-tech' }, m.tech.join(' · ')), h('span', { class: 'mon-cta' }, '▸ Power on'), h('span', { class: 'mon-beam' })),
      h('span', { class: 'mon-plate', 'aria-hidden': 'true' }, 'PP-LAB ' + no(i)));
    rack.append(h('li', {}, b)); return b;
  });
  function drawStatus() {
    const n = S.visited.size, all = n === MODS.length;
    status.textContent = all ? 'All systems online' : `${n} of ${MODS.length} systems online`;
    status.classList.toggle('all', all);
    mons.forEach((b, i) => { const on = S.visited.has(i); b.classList.toggle('lit', on); b.querySelector('.mon-cta').textContent = on ? '● Online' : '▸ Power on'; });
  }
  host.replaceChildren(status, rack, stage);
  host.classList.add('ready'); drawStatus();

  // arrow keys walk the rack; Escape steps back from a module before it closes the panel
  rack.addEventListener('keydown', e => {
    const i = mons.indexOf(document.activeElement), d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (i < 0 || !d) return; e.preventDefault(); mons[(i + d + mons.length) % mons.length].focus();
  });
  host.addEventListener('keydown', e => { if (e.key === 'Escape' && openIdx >= 0) { e.stopPropagation(); close(true); } });

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
    const m = MODS[i]; openIdx = i; blip(880);
    S.visited.add(i); drawStatus();
    const title = h('h3', { tabindex: '-1' }, m.name);
    const demo = h('div', { class: 'dm' });
    trailHost = h('nav', { class: 'lab-trail', 'aria-label': 'One enquiry through the lab' });
    const scr = h('div', { class: 'ws-scr' },
      h('p', { class: 'ws-id' }, `MODULE ${no(i)} // ${m.line}`), title,
      h('ul', { class: 'ws-tech', 'aria-label': 'Technologies' }, m.tech.map(t => h('li', {}, t))),
      h('h4', {}, 'What I work with'), h('ul', { class: 'ws-list' }, m.know.map(t => h('li', {}, t))),
      h('h4', {}, 'Related projects'),
      m.proj.length ? h('ul', { class: 'ws-proj' }, m.proj.map(([c, name, text]) => h('li', {}, h('button', { type: 'button', onclick: () => { if (hook().openCase) hook().openCase(c); else location.hash = 'work'; } }, h('b', {}, name), h('span', {}, text), h('i', { 'aria-hidden': 'true' }, 'Case study →'))))) : h('p', { class: 'ws-note' }, m.projNote),
      h('h4', {}, 'Try it: ' + m.demoName), trailHost, demo);
    const ws = h('div', { class: 'ws', role: 'region', 'aria-label': m.name + ' workstation' },
      h('div', { class: 'ws-bar' }, h('button', { type: 'button', class: 'lab-back', onclick: () => close(true) }, '← All modules'), h('span', { class: 'ws-led', 'aria-hidden': 'true' })),
      scr,
      h('button', { type: 'button', class: 'lab-next', onclick: () => show((i + 1) % MODS.length) }, 'Next: ' + MODS[(i + 1) % MODS.length].name + ' →'));
    stage.replaceChildren(ws); stage.hidden = false; rack.hidden = true; status.hidden = true; host.classList.add('open');
    m.demo(demo); drawTrail();
    // bring the workstation to the top of the panel (or of the page, in Quick read)
    const sb = document.getElementById('sheetBody');
    if (document.documentElement.classList.contains('text-mode')) scrollBy(0, host.getBoundingClientRect().top - 90);
    else if (sb) sb.scrollTop += host.getBoundingClientRect().top - sb.getBoundingClientRect().top - 14;
    title.focus({ preventScroll: true });
    if (!still() && G) {
      G.fromTo(scr, { scaleY: .02, filter: 'brightness(2.4)' }, { scaleY: 1, filter: 'brightness(1)', duration: .4, ease: 'power3.out', clearProps: 'transform,filter' });
      G.from(scr.children, { opacity: 0, y: 6, duration: .3, stagger: .035, delay: .22, ease: 'power2.out', clearProps: 'opacity,transform' });
    }
    // the fifth system coming online: the desk notices, once
    if (S.visited.size === MODS.length && !S.allShown) { S.allShown = true; blip(660); setTimeout(() => blip(990), 140); try { if (hook().allOnline) hook().allOnline(); } catch (e) {} }
  }
  function close(focusBack) {
    const i = openIdx; if (i < 0) return; openIdx = -1; trailHost = null;
    stage.replaceChildren(); stage.hidden = true; rack.hidden = false; status.hidden = false; host.classList.remove('open');
    if (focusBack) { blip(330); mons[i].focus({ preventScroll: true }); }
  }
  addEventListener('hashchange', () => { if (location.hash !== '#stack') close(false); });

  // for the terminal ("lab", "lab 2", "lab backend") and for tests
  const find = q => { q = String(q || '').trim().toLowerCase(); if (!q) return -1; if (/^[1-5]$/.test(q)) return +q - 1; return MODS.findIndex(m => m.keys.split(' ').includes(q.split(/\s+/)[0]) || m.name.toLowerCase() === q); };
  window.__lab = { open: show, close, find, names: MODS.map(m => m.name), state: S };
})();
