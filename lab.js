/*
 * Engineering lab: the Skills section as five CRT workstations (#labHost in room.html).
 * Each module is a working tool, followed by what I work with and the related case studies.
 *
 * The demos are connected: one sample enquiry can be written in the Frontend Studio, posted to the sample API in the
 * Backend Engine, found in the Database Console, qualified in the AI Research Lab and traced in System Architecture.
 * Each module also works on its own. Every demo runs in the visitor's browser on sample data and is labelled as
 * simulated; nothing typed here leaves the page. The one exception is labelled LIVE: a GET to this site's /api/geo.
 *
 * "View the code" prints the real functions below (validateEnquiry, leadsApi, searchFullText, parseModelOutput,
 * decide, mcpServer) with Function.prototype.toString, so they are written to be read.
 * No framework: plain DOM, GSAP (already on the page) for motion, and the desk's own sound switch (off by default)
 * for the blips. Reduced motion skips every animation. A demo is only built when its workstation is switched on.
 */
(() => {
  'use strict';
  const host = document.getElementById('labHost'); if (!host) return;
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
  // "View the code": the source of the functions a demo really runs (a string is printed as it is)
  const source = fn => { if (typeof fn === 'string') return fn; const l = fn.toString().split('\n'), ind = Math.min(...l.slice(1).filter(x => x.trim()).map(x => x.match(/^ */)[0].length)); return l.map((x, i) => i ? x.slice(ind) : x).join('\n'); };
  function codeView(...fns) {
    const pre = h('pre', { class: 'dm-out code', hidden: true, tabindex: '0', 'aria-label': 'Source code of this demo' }, fns.map(source).join('\n\n'));
    const b = h('button', { type: 'button', class: 'dm-btn ghost', 'aria-expanded': 'false', onclick: () => { pre.hidden = !pre.hidden; b.setAttribute('aria-expanded', String(!pre.hidden)); b.textContent = pre.hidden ? '</> View the code' : '</> Hide the code'; blip(700); } }, '</> View the code');
    return [h('div', { class: 'dm-row' }, b), pre];
  }
  // text that arrives a few characters at a time, like a streamed reply
  async function typeOut(el, text, alive) {
    if (!still()) for (let i = 0; i < text.length; i += 4) { el.textContent = text.slice(0, i); await new Promise(r => setTimeout(r, 14)); if (!alive()) return false; }
    el.textContent = text; return true;
  }

  /* ---------- shared state: the sample store, and the visitor's one enquiry ---------- */
  const S = {
    lead: null,            // { name, email, subject, message, id, found, verdict, traced }
    visited: new Set(), allShown: false,
    nextId: 11,
    store: [
      { id: 1, name: 'Sample Lead A', email: 'a@example.test', status: 'new', subject: 'Deposit not returned', message: 'My landlord has kept my deposit for three months since I moved out.' },
      { id: 2, name: 'Sample Lead B', email: 'b@example.test', status: 'contacted', subject: 'Question about a contract', message: 'I signed a contract for building work and the builder has stopped replying.' },
      { id: 3, name: 'Sample Lead C', email: 'c@example.test', status: 'new', subject: 'Something at work', message: 'I think I might need a lawyer for something at work.' },
      { id: 4, name: 'Sample Lead D', email: 'd@example.test', status: 'new', subject: 'Unpaid invoices', message: 'A client has not paid three invoices and ignores my emails.' },
      { id: 5, name: 'Sample Lead E', email: 'e@example.test', status: 'closed', subject: 'Parking fine', message: 'I want to dispute a parking fine I received last month.' },
      { id: 6, name: 'Sample Lead F', email: 'f@example.test', status: 'new', subject: 'Returning a faulty laptop', message: 'The shop refuses to refund a laptop that stopped working after a week.' },
      { id: 7, name: 'Sample Lead H', email: 'h@example.test', status: 'contacted', subject: 'Contract ended early', message: 'My employer ended my contract two weeks early and has not paid the notice period.' },
      { id: 8, name: 'Sample Lead I', email: 'i@example.test', status: 'new', subject: 'Refund for a cancelled flight', message: 'The airline cancelled my flight in March and has still not refunded the ticket.' },
      { id: 9, name: 'Sample Lead J', email: 'j@example.test', status: 'new', subject: 'Deposit for a wedding venue', message: 'The venue closed down and is keeping the deposit we paid last year.' },
      { id: 10, name: 'Sample Lead K', email: 'k@example.test', status: 'closed', subject: 'Faulty car repair', message: 'The garage repaired my car twice and the same fault returned within days.' },
    ],
  };
  const STATUSES = ['new', 'contacted', 'closed'];

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

  // The sample REST API. Every request passes the same stages: route, auth, validate, store, respond.
  // Returns [status, body, headers, trace]; the trace records what each stage decided.
  function leadsApi(method, path, bodyText, headers = {}) {
    const trace = [];
    const stage = (name, ok, note) => { trace.push({ stage: name, ok, note }); return ok; };
    const reply = (status, body, extra = {}) => { stage('respond', status < 400, `Status ${status}` + (body ? ', JSON body' : ', no body')); return [status, body, extra, trace]; };

    // 1. route
    const [route, queryString] = path.split('?');
    const match = route.match(/^\/leads(?:\/(\d+))?$/);
    if (!stage('route', !!match, match ? `${route} matches /leads${match[1] ? '/{id}' : ''}` : `No route matches ${route}`)) return reply(404, { error: 'not_found', message: 'No such route.' });
    const id = match[1] ? Number(match[1]) : null;
    const allowed = id === null ? ['GET', 'POST'] : ['GET', 'DELETE'];
    if (!stage('route', allowed.includes(method), allowed.includes(method) ? `${method} is allowed here` : `${method} is not allowed here`)) return reply(405, { error: 'method_not_allowed' }, { Allow: allowed.join(', ') });

    // 2. auth: reading is public in this sample, deleting needs a token
    if (method === 'DELETE') {
      const token = (headers.Authorization || '').replace(/^Bearer\s+/, '');
      if (!stage('auth', token === 'sample-token', token ? (token === 'sample-token' ? 'Bearer token accepted' : 'Bearer token rejected') : 'No Authorization header')) return reply(401, { error: 'unauthorized', message: 'This route needs a valid Authorization header.' }, { 'WWW-Authenticate': 'Bearer' });
    } else stage('auth', true, 'Public route, no token needed');

    // 3. validate, 4. store
    if (method === 'GET' && id === null) {
      const status = new URLSearchParams(queryString || '').get('status');
      if (!stage('validate', !status || STATUSES.includes(status), status ? `status=${status} ${STATUSES.includes(status) ? 'is a known value' : 'is not a known value'}` : 'No filters to check')) return reply(422, { error: 'validation_failed', errors: { status: 'Use new, contacted or closed.' } });
      const rows = S.store.filter(lead => !status || lead.status === status);
      const data = rows.map(({ id, name, subject, status }) => ({ id, name, subject, status }));   // a list never returns the message or the email
      stage('store', true, `Read ${data.length} of ${S.store.length} rows, list fields only`);
      return reply(200, { data, meta: { count: data.length } });
    }
    if (method === 'GET') {
      stage('validate', true, `id ${id} is a whole number`);
      const lead = S.store.find(row => row.id === id);
      if (!stage('store', !!lead, lead ? `Found row ${id}` : `No row with id ${id}`)) return reply(404, { error: 'not_found', message: `Lead ${id} does not exist.` });
      return reply(200, { data: lead });
    }
    if (method === 'POST') {
      let input;
      try { input = JSON.parse(bodyText); } catch (e) { input = undefined; }
      if (!stage('validate', !!input && typeof input === 'object', input && typeof input === 'object' ? 'Body parsed as a JSON object' : 'Body is not a JSON object')) return reply(400, { error: 'bad_request', message: 'Send a JSON object.' });
      const errors = validateEnquiry(input);          // never trust the client: validate again
      const bad = Object.keys(errors);
      if (!stage('validate', !bad.length, bad.length ? `Rejected: ${bad.join(', ')}` : 'All four fields pass the same rules as the form')) return reply(422, { error: 'validation_failed', errors });
      const email = input.email.trim();
      if (!stage('store', !S.store.some(row => row.email === email), S.store.some(row => row.email === email) ? 'Email already stored, nothing written' : 'Email is not stored yet')) return reply(409, { error: 'conflict', message: 'A lead with this email already exists.' });
      const lead = { id: S.nextId++, name: input.name.trim().slice(0, 80), email: email.slice(0, 120), status: 'new', subject: input.subject.trim().slice(0, 120), message: input.message.trim().slice(0, 500) };
      S.store.push(lead);
      stage('store', true, `Inserted row ${lead.id} with status "new"`);
      return reply(201, { data: lead }, { Location: '/leads/' + lead.id });
    }
    // DELETE /leads/{id}
    stage('validate', true, `id ${id} is a whole number`);
    const at = S.store.findIndex(row => row.id === id);
    if (!stage('store', at >= 0, at >= 0 ? `Deleted row ${id}` : `No row with id ${id}`)) return reply(404, { error: 'not_found', message: `Lead ${id} does not exist.` });
    S.store.splice(at, 1);
    return reply(204, null);
  }

  const LARAVEL = `// The same POST route in Laravel. Illustrative: written for this demo, not taken from a product.
Route::post('/leads', function (StoreLeadRequest $request) {
    $lead = Lead::create($request->validated() + ['status' => 'new']);

    return response()->json(['data' => $lead], 201)
        ->header('Location', "/leads/{$lead->id}");
});

class StoreLeadRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'name'    => ['required', 'string', 'max:80'],
            'email'   => ['required', 'email', 'max:120'],
            'subject' => ['required', 'string', 'max:120'],
            'message' => ['required', 'string', 'min:10', 'max:500'],
        ];
    }
}`;

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
      const parts = [];                                                       // kept so a score can be explained
      for (const term of terms) {
        const docsWithTerm = docs.filter(d => d.subject.includes(term) || d.message.includes(term)).length;
        const inSubject = count(doc.subject, term), inMessage = count(doc.message, term);
        if (!inSubject && !inMessage) continue;
        const rarity = Math.log(1 + docs.length / docsWithTerm);            // rarer terms count for more
        parts.push({ term, rarity, inSubject, inMessage, value: rarity * (2 * inSubject + inMessage) });   // subject^2
      }
      return { row: doc.row, parts, score: parts.reduce((sum, part) => sum + part.value, 0) };
    });
    return { terms, hits: terms.length ? hits.filter(hit => hit.score > 0).sort((a, b) => b.score - a.score || a.row.id - b.row.id) : hits };
  }

  // The model is asked for exactly these fields. Its reply is text, so it is checked before anything uses it.
  const LEAD_FIELDS = { is_request: 'boolean', specific: 'boolean', has_documents: 'boolean', has_timeframe: 'boolean', topic: 'string' };
  function parseModelOutput(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'The reply is not valid JSON.' }; }
    if (!data || typeof data !== 'object') return { ok: false, error: 'The reply is not a JSON object.' };
    if (typeof data.ask === 'string') return { ok: true, ask: data.ask };          // the model wants to ask a follow-up question
    for (const key in LEAD_FIELDS) {
      if (typeof data[key] !== LEAD_FIELDS[key]) return { ok: false, error: `Field "${key}" must be a ${LEAD_FIELDS[key]}.` };
    }
    return { ok: true, data };
  }
  // The model extracts facts; this code makes the decision, so the same facts always give the same answer.
  function decide(fields) {
    if (!fields.is_request) return 'Not a lead';
    const met = [fields.specific, fields.has_documents, fields.has_timeframe].filter(Boolean).length;
    return met === 3 ? 'Strong lead' : met === 0 ? 'Weak lead' : 'Needs more information';
  }
  // Stand-in for the model when the visitor's own text is checked: three keyword rules, so the result can be explained.
  function qualifyByRules(text) {
    return {
      is_request: true,
      specific: text.trim().split(/\s+/).length >= 12,
      has_documents: /\b(agreement|contract|receipt|invoice|letter|email|document|record)s?\b/i.test(text),
      has_timeframe: /\b(yesterday|today|last|ago|since|\d+\s*(day|week|month|year)s?|a (day|week|month|year))\b/i.test(text),
      topic: 'not extracted (keyword rules only)',
    };
  }

  // A sample MCP server: JSON-RPC 2.0 in, JSON-RPC 2.0 out. It exposes two read-only tools over the sample store.
  const MCP_TOOLS = [
    { name: 'search_leads', description: 'Full-text search over the sample enquiries. Returns the three best matches.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' }, status: { type: 'string', enum: STATUSES } }, required: ['query'] } },
    { name: 'get_lead', description: 'Read one sample enquiry by id.',
      inputSchema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
  ];
  function mcpServer(message) {
    const { id, method, params = {} } = message;
    const result = value => ({ jsonrpc: '2.0', id, result: value });
    const error = (code, text) => ({ jsonrpc: '2.0', id, error: { code, message: text } });

    if (method === 'initialize') return result({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'sample-leads', version: '1.0.0' } });
    if (method === 'tools/list') return result({ tools: MCP_TOOLS });
    if (method === 'tools/call') {
      const args = params.arguments || {};
      const content = (value, isError = false) => result({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], isError });
      if (params.name === 'search_leads') {
        if (typeof args.query !== 'string' || !args.query.trim()) return error(-32602, 'search_leads needs a "query" string.');
        const hits = searchFullText(S.store, args.query).hits.filter(hit => !args.status || hit.row.status === args.status);
        return content(hits.slice(0, 3).map(({ row }) => ({ id: row.id, subject: row.subject, status: row.status })));   // no names, no emails
      }
      if (params.name === 'get_lead') {
        const lead = S.store.find(row => row.id === args.id);
        return lead ? content({ id: lead.id, subject: lead.subject, status: lead.status, message: lead.message }) : content(`Lead ${args.id} not found.`, true);
      }
      return error(-32602, `Unknown tool: ${params.name}`);
    }
    return error(-32601, `Method not found: ${method}`);
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

  /* ---------- 02 Frontend: a form that explains its own events ---------- */
  function demoFrontend(box) {
    const ACC = [['Amber', '#E8913C'], ['Green', '#86EFAC'], ['Teal', '#5FA3AB']];
    const st = { accent: ACC[0][1], radius: 10 };
    const start = S.lead || { name: 'Sample Visitor', email: 'visitor@example.test', subject: 'Flat sale fell through', message: 'The buyer pulled out of my flat sale a day before completion, after we had signed the agreement. Can I recover my costs?' };
    const FIELDS = [['name', 'Name', 'input'], ['email', 'Email', 'input'], ['subject', 'Subject', 'input'], ['message', 'Message', 'textarea']];
    const ins = {}, errs = {};
    const counter = h('span', { class: 'fx-count', 'aria-hidden': 'true' });
    const rows = FIELDS.map(([key, label, tag]) => {
      ins[key] = h(tag, { class: 'dm-in', id: 'labF_' + key, name: key, rows: tag === 'textarea' ? 3 : null, type: tag === 'input' ? (key === 'email' ? 'email' : 'text') : null, maxlength: key === 'message' ? 500 : 120, autocomplete: 'off', 'aria-describedby': 'labE_' + key });
      ins[key].value = start[key]; errs[key] = h('p', { class: 'dm-err', id: 'labE_' + key });
      return h('div', { class: 'dm-field' }, h('label', { for: 'labF_' + key }, label, key === 'message' ? counter : null), ins[key], errs[key]);
    });
    const btn = h('button', { type: 'submit', class: 'fx-btn', 'data-state': 'idle' }, h('span', { class: 'fx-ico', 'aria-hidden': 'true' }), h('span', { class: 'fx-lbl' }, 'Send enquiry'));
    const state = h('p', { class: 'fx-state', 'aria-live': 'polite' }, 'state: idle');
    const next = h('div', { class: 'dm-row' });
    const css = h('pre', { class: 'dm-out', 'aria-label': 'The button’s CSS variables' });
    const preview = h('pre', { class: 'dm-out', 'aria-label': 'The form’s data, redrawn as you type' });
    const evLog = h('ol', { class: 'ev-log', 'aria-label': 'The last events the form handled' });
    const set = s => { btn.dataset.state = s; btn.setAttribute('aria-busy', s === 'loading' ? 'true' : 'false'); btn.querySelector('.fx-lbl').textContent = { idle: 'Send enquiry', loading: 'Sending…', done: 'Sent' }[s]; state.textContent = 'state: ' + s; };
    const read = () => { const data = {}; FIELDS.forEach(([key]) => { data[key] = ins[key].value; }); return data; };
    const showError = (key, text) => { errs[key].textContent = text || ''; ins[key].setAttribute('aria-invalid', text ? 'true' : 'false'); };
    const logEvent = (type, target, effect) => { evLog.prepend(h('li', {}, h('b', {}, type), h('span', {}, target), effect)); while (evLog.children.length > 6) evLog.lastChild.remove(); };
    const redraw = () => { counter.textContent = ins.message.value.length + ' / 500'; preview.innerHTML = paint(read()); };
    function paintCss() {
      btn.style.setProperty('--fx-accent', st.accent); btn.style.setProperty('--fx-radius', st.radius + 'px');
      css.innerHTML = `<i class="k">.send-btn</i> {\n  --accent: <i class="s">${st.accent}</i>;\n  --radius: <i class="n">${st.radius}px</i>;\n}`;
    }

    // Event delegation: the form listens once per event type, and works out which field the event came from.
    function onFormEvent(event) {
      if (event.type === 'submit') { event.preventDefault(); return send(); }
      const key = event.target.name;
      if (!ins[key]) return;
      if (event.type === 'input') {
        redraw();                                                               // counter and data preview follow every keystroke
        if (errs[key].textContent) showError(key, validateEnquiry(read())[key]);   // an error disappears as soon as it is fixed
        logEvent('input', '#' + key, 'preview and counter redrawn');
      }
      if (event.type === 'focusout') {
        const problem = validateEnquiry(read())[key];                           // a field is checked when you leave it
        showError(key, problem);
        logEvent('blur', '#' + key, problem ? 'error message added' : 'valid');
      }
    }
    async function send() {
      if (btn.dataset.state === 'loading') return;
      const input = read(), errors = validateEnquiry(input);
      FIELDS.forEach(([k]) => showError(k, errors[k]));
      const bad = FIELDS.find(([k]) => errors[k]);
      logEvent('submit', 'form', bad ? `stopped: ${Object.keys(errors).length} invalid, focus moved to #${bad[0]}` : 'valid, button set to loading');
      if (bad) { blip(220); state.textContent = 'state: invalid'; ins[bad[0]].focus(); return; }
      blip(620); set('loading'); await wait(800); if (!btn.isConnected) return;
      S.lead = { name: input.name.trim(), email: input.email.trim(), subject: input.subject.trim(), message: input.message.trim(), id: null, found: false, verdict: null, traced: false };
      blip(940); set('done'); drawTrail(); delete next.dataset.mod; offer(next, 'Post it to the Backend Engine', 0);
      setTimeout(() => btn.isConnected && set('idle'), 1500);
    }
    const form = h('form', { class: 'fx-stage', novalidate: true, 'aria-label': 'Sample enquiry form' }, rows, btn, state);
    ['input', 'focusout', 'submit'].forEach(type => form.addEventListener(type, onFormEvent));
    put(box,
      h('p', { class: 'sim' }, 'Simulated: nothing leaves your browser. The form is pre-filled with sample text, so there is no need to enter real details.'),
      h('p', { class: 'dm-why' }, 'Type in a field, leave one empty, or send. The page reacts without reloading, and the log shows which event did it.'),
      form, next,
      h('div', { class: 'dm-two' },
        h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'Event log (newest first)'), evLog),
        h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'Form data, live'), preview)),
      h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'Restyle the button'), choice(ACC.map(a => a[0]), i => { st.accent = ACC[i][1]; paintCss(); }, 'Accent colour')),
      h('div', { class: 'dm-field' }, h('label', { for: 'labRad' }, 'Corner radius'), h('input', { type: 'range', id: 'labRad', min: 0, max: 22, value: st.radius, oninput: e => { st.radius = +e.target.value; paintCss(); } })),
      css, codeView(onFormEvent, validateEnquiry));
    paintCss(); redraw(); logEvent('ready', 'form', '3 listeners attached: input, focusout, submit');
    if (S.lead && !S.lead.id) offer(next, 'Post it to the Backend Engine', 0);
  }

  /* ---------- 01 Backend: an API playground ---------- */
  function demoBackend(box) {
    const REASON = { 200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 422: 'Unprocessable Content' };
    const STAGES = [['route', 'Route'], ['auth', 'Auth'], ['validate', 'Validate'], ['store', 'Store'], ['respond', 'Respond']];
    const L = S.lead, mine = L && !L.id;
    const presets = [
      mine ? { label: 'Your enquiry', method: 'POST', path: '/leads', body: { name: L.name, email: L.email, subject: L.subject, message: L.message } }
        : { label: 'Create', method: 'POST', path: '/leads', body: { name: 'Sample Lead G', email: 'g@example.test', subject: 'Late delivery', message: 'An order I paid for last week has still not arrived.' } },
      { label: 'List', method: 'GET', path: '/leads?status=new' },
      { label: 'Read one', method: 'GET', path: '/leads/4' },
      { label: 'Invalid', method: 'POST', path: '/leads', body: { name: '', email: 'not-an-email', subject: 'Hello', message: 'Hi' } },
      { label: 'No token', method: 'DELETE', path: '/leads/5' },
      { label: 'With token', method: 'DELETE', path: '/leads/5', token: true },
      { label: 'Live: /api/geo', method: 'GET', path: '/api/geo' },
    ];
    let run = 0;
    const note = h('p', { class: 'sim' });
    const method = h('select', { class: 'dm-in', id: 'labMethod', 'aria-label': 'Method', onchange: sync }, ['GET', 'POST', 'PUT', 'DELETE'].map(m => h('option', {}, m)));
    const path = h('input', { class: 'dm-in', id: 'labPath', type: 'text', 'aria-label': 'Path', maxlength: 80, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', oninput: sync, onkeydown: e => { if (e.key === 'Enter') fire(); } });
    const bodyIn = h('textarea', { class: 'dm-in', id: 'labBody', rows: 6, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', onkeydown: e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); fire(); } } });
    const bodyWrap = h('div', { class: 'dm-field' }, h('label', { for: 'labBody' }, 'Request body'), bodyIn);
    const token = h('input', { type: 'checkbox', id: 'labTok', onchange: sync });
    const tokenWrap = h('label', { class: 'dm-check', for: 'labTok' }, token, 'Send Authorization: Bearer sample-token');
    const reqOut = h('pre', { class: 'dm-out', 'aria-label': 'The request as it is sent' });
    const pipe = h('ol', { class: 'pipe', 'aria-label': 'The stages a request passes on the server' }, STAGES.map(([k, l]) => h('li', { 'data-k': k }, l)));
    const steps = h('ol', { class: 'pipe-log', 'aria-live': 'polite', 'aria-label': 'What the server did' });
    const res = h('pre', { class: 'dm-out res', 'aria-live': 'polite', 'aria-label': 'Response' });
    const send = h('button', { type: 'button', class: 'dm-btn go', onclick: fire }, 'Send request');
    const next = h('div', { class: 'dm-row' });
    const server = h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'On the server'), pipe, steps);
    const isLive = () => method.value === 'GET' && path.value.trim().split('?')[0] === '/api/geo';
    const hasBody = () => /^(POST|PUT)$/.test(method.value);
    const reqHeaders = () => { const hd = { Accept: 'application/json' }; if (hasBody()) hd['Content-Type'] = 'application/json'; if (token.checked && !isLive()) hd.Authorization = 'Bearer sample-token'; return hd; };
    function sync() {
      const live = isLive();
      note.textContent = live
        ? 'Live: a real request to this site’s own Worker. It returns your approximate city from Cloudflare’s network data. Nothing is stored.'
        : 'Simulated: a sample API running in your browser on made-up records. Routing, validation and status codes are real code. Try any method and path.';
      note.classList.toggle('live', live);
      bodyWrap.hidden = !hasBody(); tokenWrap.hidden = live; server.hidden = live;
      reqOut.innerHTML = `<b>${esc(method.value)} ${esc(path.value.trim() || '/')} HTTP/1.1</b>\n<i class="k">Host</i>: ${esc(live ? location.host : 'api.example.test')}\n` + Object.entries(reqHeaders()).map(([k, v]) => `<i class="k">${esc(k)}</i>: ${esc(v)}`).join('\n') + (hasBody() ? '\n\n<i class="c"># body: the JSON below</i>' : '');
    }
    const clearPipe = () => { pipe.querySelectorAll('li').forEach(li => { delete li.dataset.s; }); steps.replaceChildren(); };
    function load(i) { const p = presets[i]; run++; method.value = p.method; path.value = p.path; token.checked = !!p.token; bodyIn.value = p.body ? JSON.stringify(p.body, null, 2) : ''; sync(); clearPipe(); res.textContent = 'Press “Send request”.'; res.dataset.s = ''; send.disabled = false; }
    function print(status, body, headers, ms) {
      const head = Object.entries(Object.assign(body == null ? {} : { 'Content-Type': 'application/json' }, headers)).map(([k, v]) => `<i class="k">${esc(k)}</i>: ${esc(v)}`).join('\n');
      res.dataset.s = String(status)[0];
      res.innerHTML = `<b>HTTP/1.1 ${status} ${esc(REASON[status] || '')}</b>` + (head ? '\n' + head : '') + (body == null ? '' : `\n\n${typeof body === 'string' ? esc(body) : paint(body)}`) + (ms != null ? `\n\n<i class="c"># ${ms} ms, measured in your browser</i>` : '');
    }
    async function fire() {
      const me = ++run; blip(520); send.disabled = true; res.dataset.s = ''; res.textContent = 'Sending…'; clearPipe();
      try {
        if (isLive()) {
          const t0 = performance.now(), ac = new AbortController(), to = setTimeout(() => ac.abort(), 8000);
          const r = await fetch('/api/geo', { headers: { Accept: 'application/json' }, signal: ac.signal, credentials: 'omit' });
          const text = await r.text(); clearTimeout(to); if (me !== run) return;
          let body = 'The response was not JSON: this server does not run the Worker. /api/geo answers on the deployed site.'; try { body = JSON.parse(text); } catch (e) {}
          print(r.status, body, { 'Content-Type': r.headers.get('content-type') || 'unknown' }, Math.round(performance.now() - t0));
        } else {
          const p = path.value.trim() || '/';
          const [status, body, headers, trace] = leadsApi(method.value, p.startsWith('/') ? p : '/' + p, bodyIn.value, reqHeaders());
          for (const t of trace) {                       // the request moves through the stages one at a time
            await wait(260); if (me !== run) return;
            const li = pipe.querySelector(`[data-k="${t.stage}"]`); if (li.dataset.s !== 'bad') li.dataset.s = t.ok ? 'ok' : 'bad';
            steps.append(h('li', { class: t.ok ? '' : 'bad' }, h('span', {}, STAGES.find(s => s[0] === t.stage)[1]), t.note)); blip(t.ok ? 760 : 240);
          }
          await wait(200); if (me !== run) return;
          print(status, body, headers);
          if (status === 201 && S.lead && !S.lead.id && body.data.email === S.lead.email) { S.lead.id = body.data.id; drawTrail(); offer(next, 'Find it in the Database Console', 2); }
        }
        blip(880);
      } catch (e) {
        if (me === run) { res.dataset.s = '5'; res.textContent = 'The request failed: /api/geo could not be reached from this page. Nothing is shown in its place.'; }
      } finally { if (me === run) send.disabled = false; }
    }
    put(box, note, choice(presets.map(p => p.label), load, 'Sample requests'),
      h('div', { class: 'dm-req' }, method, path), tokenWrap, bodyWrap,
      h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'Request'), reqOut),
      h('div', { class: 'dm-row' }, send, h('span', { class: 'dm-keys' }, h('kbd', {}, 'Enter'), ' in the path, ', h('kbd', {}, 'Ctrl'), '+', h('kbd', {}, 'Enter'), ' in the body')),
      server,
      h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'Response'), res), next, codeView(leadsApi, validateEnquiry, LARAVEL));
    load(0);
    if (S.lead && S.lead.id && !S.lead.found) offer(next, 'Find it in the Database Console', 2);
  }

  /* ---------- 03 Database: an exact SQL match against ranked full-text search, with a filter ---------- */
  function demoDatabase(box) {
    let mode = 0, status = '';
    const input = h('input', { class: 'dm-in', id: 'labQ', type: 'search', placeholder: 'Try: refund laptops', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: 60, oninput: search });
    const query = h('pre', { class: 'dm-out', 'aria-label': 'The query this search runs' });
    const why = h('p', { class: 'dm-why' });
    const count = h('p', { class: 'dm-count', 'aria-live': 'polite' });
    const list = h('ol', { class: 'dm-res' });
    const next = h('div', { class: 'dm-row' });
    const tbody = h('tbody');
    const tableSum = h('summary');
    const markLike = (text, q) => { const i = q ? text.toLowerCase().indexOf(q) : -1; return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length)); };
    const markTerms = (text, set) => text.split(/([A-Za-z0-9]+)/).map(p => /^[A-Za-z0-9]+$/.test(p) && set.has(stem(p.toLowerCase())) ? '<mark>' + esc(p) + '</mark>' : esc(p)).join('');
    const explain = x => x.parts.map(p => `${p.term}: rarity ${p.rarity.toFixed(2)} × (2 × ${p.inSubject} in subject + ${p.inMessage} in message) = ${p.value.toFixed(2)}`).join('\n') + `\ntotal = ${x.score.toFixed(2)}`;
    function search() {
      const raw = input.value.trim(), q = raw.toLowerCase(), sq = esc(raw.replace(/'/g, "''"));
      let hits;
      if (mode === 0) {
        hits = S.store.filter(r => (!status || r.status === status) && (!q || r.subject.toLowerCase().includes(q) || r.message.toLowerCase().includes(q))).map(r => ({ row: r, t: markLike(r.subject, q), b: markLike(r.message, q) }));
        const where = [q ? `(subject <i class="k">LIKE</i> <i class="s">'%${sq}%'</i>\n   <i class="k">OR</i> message <i class="k">LIKE</i> <i class="s">'%${sq}%'</i>)` : '', status ? `status = <i class="s">'${status}'</i>` : ''].filter(Boolean);
        query.innerHTML = `<i class="k">SELECT</i> id, subject, status <i class="k">FROM</i> leads` + (where.length ? `\n<i class="k">WHERE</i> ` + where.join(`\n  <i class="k">AND</i> `) : '') + `\n<i class="k">ORDER BY</i> id;`;
        why.textContent = 'LIKE looks for these exact characters, in this order. It cannot rank: rows come back in id order, and “laptops” will not find “laptop”.' + (status ? ' The status filter is an exact match, which is what a database index is good at.' : '');
      } else {
        const found = searchFullText(S.store, raw), set = new Set(found.terms);
        hits = found.hits.filter(x => !status || x.row.status === status).map(x => ({ row: x.row, score: found.terms.length ? x.score : null, why: found.terms.length ? explain(x) : null, t: markTerms(x.row.subject, set), b: markTerms(x.row.message, set) }));
        const match = found.terms.length ? { multi_match: { query: raw.replace(/["\\]/g, ''), fields: ['subject^2', 'message'] } } : { match_all: {} };
        query.innerHTML = `<b>GET</b> /leads/_search\n` + paint({ query: status ? { bool: { must: match, filter: { term: { status } } } } : match });
        why.textContent = (found.terms.length
          ? `The text is split into terms and reduced to stems (${found.terms.join(', ')}). Any term can match. Rarer terms and matches in the subject count for more, so the best row comes first. Open a result to see its score worked out. The scores are a simplified model computed in your browser.`
          : 'Full-text search analyses the words instead of matching characters. Type a query to see the terms and the ranking.')
          + (status ? ' The status filter narrows the results without changing any score.' : '');
      }
      const L = S.lead;
      count.textContent = hits.length + (hits.length === 1 ? ' row' : ' rows') + ' of ' + S.store.length;
      list.innerHTML = hits.map(x => `<li${L && x.row.id === L.id ? ' class="yours"' : ''}><span class="t">${x.t}</span><span class="b">${x.b}</span><span class="m">id ${x.row.id} · ${esc(x.row.name)} · ${x.row.status}${L && x.row.id === L.id ? ' · your enquiry' : ''}</span>${x.why ? `<details class="dm-det"><summary>score ${x.score.toFixed(2)}: why</summary><pre class="dm-out">${esc(x.why)}</pre></details>` : ''}</li>`).join('') || '<li class="none">No rows match.</li>';
      if (L && L.id && q && hits.some(x => x.row.id === L.id)) { if (!L.found) { L.found = true; drawTrail(); blip(940); } offer(next, 'Qualify it in the AI Research Lab', 3); }
    }
    const L = S.lead;
    const samples = ['deposit', 'refund laptops', 'builder contracts'];
    tableSum.textContent = `View the table: leads (${S.store.length} rows)`;
    S.store.forEach(r => tbody.append(h('tr', { class: L && r.id === L.id ? 'yours' : null }, h('td', {}, String(r.id)), h('td', {}, r.status), h('td', {}, r.subject), h('td', {}, r.message))));
    put(box,
      h('p', { class: 'sim' }, 'Simulated: sample enquiries written for this demo' + (L && L.id ? ', plus the one you posted' : '') + '. No database is connected; both searches run in your browser.'),
      L && !L.id ? h('p', { class: 'dm-why' }, 'Your enquiry is not stored yet. Post it from the Backend Engine and it will appear here.') : null,
      h('details', { class: 'dm-det' }, tableSum, h('div', { class: 'dm-scroll' }, h('table', { class: 'dm-table' }, h('thead', {}, h('tr', {}, ['id', 'status', 'subject', 'message'].map(c => h('th', { scope: 'col' }, c)))), tbody))),
      h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'Engine'), choice(['MySQL LIKE', 'Full-text search'], i => { mode = i; search(); }, 'Search method')),
      h('div', { class: 'dm-field' }, h('label', { for: 'labQ' }, 'Search the sample enquiries'), input),
      h('div', { class: 'dm-row' }, samples.map(s => h('button', { type: 'button', class: 'dm-btn ghost', onclick: () => { input.value = s; blip(700); search(); } }, s))),
      h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'Filter by status'), choice(['All'].concat(STATUSES), i => { status = i ? STATUSES[i - 1] : ''; search(); }, 'Status filter')),
      query, why, count, list, next, codeView(searchFullText, analyse, stem));
    search();
  }

  /* ---------- tabs inside one workstation (each tab builds its demo the first time it opens) ---------- */
  function tabs(box, list) {
    const panes = list.map(() => h('div', { class: 'dm-pane' }));
    const built = new Set();
    const open = i => { panes.forEach((p, k) => { p.hidden = k !== i; }); if (!built.has(i)) { built.add(i); list[i][1](panes[i]); } };
    put(box, h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'Tool'), choice(list.map(x => x[0]), open, 'Tool')), panes);
    open(0);
  }

  /* ---------- JavaScript playground: your code, run in an isolated Web Worker with a time limit ---------- */
  const JS_SAMPLES = [
    ['Validate an enquiry', "const enquiry = { name: 'Sample Visitor', email: 'visitor@example.test', message: '' };\n\nconst errors = [];\nif (!enquiry.name.trim()) errors.push('name is required');\nif (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(enquiry.email)) errors.push('email looks wrong');\nif (enquiry.message.trim().length < 10) errors.push('message is too short');\n\nconsole.log(errors.length ? errors : 'valid');"],
    ['Group by status', "const leads = [\n  { id: 1, status: 'new' }, { id: 2, status: 'qualified' },\n  { id: 3, status: 'new' }, { id: 4, status: 'closed' },\n];\n\nconst byStatus = leads.reduce((acc, lead) => {\n  (acc[lead.status] ||= []).push(lead.id);\n  return acc;\n}, {});\n\nconsole.log(byStatus);"],
    ['async / await', "const wait = ms => new Promise(resolve => setTimeout(resolve, ms));\n\nasync function sendEnquiry() {\n  console.log('sending…');\n  await wait(400);            // stands in for a network request\n  return { status: 201 };\n}\n\nsendEnquiry().then(res => console.log('done', res));"],
    ['Debounce', "function debounce(fn, ms) {\n  let timer;\n  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };\n}\n\nconst search = debounce(q => console.log('search for', q), 200);\n['l', 'la', 'lap', 'lapt', 'laptop'].forEach((q, i) => setTimeout(() => search(q), i * 50));"],
  ];
  function runInWorker(code, onLine, onEnd) {
    const src = "const out = (kind, args) => postMessage({ kind, text: args.map(a => { try { return typeof a === 'string' ? a : JSON.stringify(a, null, 2); } catch (e) { return String(a); } }).join(' ') });\n"
      + "console.log = (...a) => out('log', a); console.info = console.log; console.warn = (...a) => out('warn', a); console.error = (...a) => out('error', a);\n"
      + "self.onerror = e => { out('error', [String(e.message || e)]); };\n"
      + "self.onunhandledrejection = e => out('error', ['Unhandled rejection: ' + (e.reason && e.reason.message || e.reason)]);\n"
      + "onmessage = e => { try { (0, eval)(e.data); } catch (err) { out('error', [err.name + ': ' + err.message]); } postMessage({ kind: 'sync' }); };";
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    let w;
    try { w = new Worker(url); } catch (e) { URL.revokeObjectURL(url); onEnd('Web Workers are not available in this browser.'); return () => {}; }
    let quietTimer = 0, done = false;
    const end = why => { if (done) return; done = true; clearTimeout(hard); clearTimeout(quietTimer); w.terminate(); URL.revokeObjectURL(url); onEnd(why); };
    const hard = setTimeout(() => end('Stopped after 3 seconds (a loop that never ends?).'), 3000);
    w.onmessage = e => {
      if (e.data.kind === 'sync') { quietTimer = setTimeout(() => end(''), 1500); return; }   // give timers and promises a moment to finish
      onLine(e.data.kind, e.data.text);
      if (quietTimer) { clearTimeout(quietTimer); quietTimer = setTimeout(() => end(''), 1500); }
    };
    w.onerror = e => { e.preventDefault(); onLine('error', e.message); };
    w.postMessage(code);
    return () => end('Stopped.');
  }
  function jsPlayground(box) {
    const code = h('textarea', { class: 'dm-in dm-code', id: 'labJs', rows: 12, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'JavaScript to run' });
    const out = h('pre', { class: 'dm-out dm-console', 'aria-live': 'polite', 'aria-label': 'Console output' });
    const run = h('button', { type: 'button', class: 'dm-btn go' }, '▶ Run');
    let stop = null;
    const line = (kind, text) => { out.append(h('span', { class: 'c-' + kind }, text + '\n')); out.scrollTop = out.scrollHeight; };
    run.addEventListener('click', () => {
      if (stop) { stop(); return; }
      out.replaceChildren(); blip(700);
      const t0 = performance.now();
      run.textContent = '■ Stop';
      stop = runInWorker(code.value, line, why => { stop = null; run.textContent = '▶ Run'; line('meta', why || ('Finished in ' + Math.round(performance.now() - t0) + ' ms.')); });
    });
    code.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run.click(); }
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const a = code.selectionStart; code.setRangeText('  ', a, code.selectionEnd, 'end'); }
    });
    code.value = JS_SAMPLES[0][1];
    put(box,
      h('p', { class: 'sim' }, 'Your code runs in an isolated Web Worker in your browser: no access to this page, a 3-second limit, nothing is sent anywhere. Ctrl+Enter runs it.'),
      h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'Start from an example'), choice(JS_SAMPLES.map(x => x[0]), i => { code.value = JS_SAMPLES[i][1]; out.replaceChildren(); }, 'Example')),
      h('div', { class: 'dm-field' }, h('label', { for: 'labJs' }, 'JavaScript'), code),
      h('div', { class: 'dm-row' }, run, h('button', { type: 'button', class: 'dm-btn ghost', onclick: () => out.replaceChildren() }, 'Clear')),
      out, codeView(runInWorker));
  }

  /* ---------- SQL console: a small SELECT interpreter over the sample leads table ---------- */
  // Supports SELECT [DISTINCT] cols | * | COUNT/SUM/AVG/MIN/MAX(…) [AS x] FROM leads [WHERE …] [GROUP BY col]
  // [ORDER BY col|alias [ASC|DESC]] [LIMIT n], with = != <> < > <= >= LIKE IN IS NULL AND OR NOT and brackets.
  // Read-only: anything other than SELECT is refused. It is MySQL-style syntax, not a MySQL server.
  function runSql(sql, tables) {
    const toks = [], re = /\s*(?:(\d+(?:\.\d+)?)|'((?:[^']|'')*)'|([A-Za-z_][\w]*)|(<=|>=|<>|!=|[(),*=<>;.]))/y;
    let m; const text = sql.trim();
    re.lastIndex = 0;
    while (re.lastIndex < text.length) {
      const at = re.lastIndex; m = re.exec(text);
      if (!m || m.index !== at) { if (/^\s+$/.test(text.slice(at))) break; throw new Error('Unexpected character near “' + text.slice(at, at + 12) + '”'); }
      if (m[1] != null) toks.push({ t: 'num', v: +m[1] }); else if (m[2] != null) toks.push({ t: 'str', v: m[2].replace(/''/g, "'") });
      else if (m[3] != null) toks.push({ t: 'id', v: m[3], u: m[3].toUpperCase() }); else toks.push({ t: 'op', v: m[4] });
    }
    let i = 0;
    const peek = () => toks[i], kw = w => toks[i] && toks[i].u === w, take = w => { if (kw(w)) { i++; return true; } return false; };
    const op = v => toks[i] && toks[i].t === 'op' && toks[i].v === v, takeOp = v => { if (op(v)) { i++; return true; } return false; };
    const need = (cond, msg) => { if (!cond) throw new Error(msg); };
    if (!take('SELECT')) { const w = peek() && peek().u; throw new Error(/^(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE)$/.test(w) ? 'Read-only console: only SELECT runs here, on sample data.' : 'Queries start with SELECT.'); }
    const distinct = take('DISTINCT');
    const cols = [];
    const AGG = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
    do {
      if (takeOp('*')) { cols.push({ star: true }); continue; }
      const tk = peek(); need(tk && tk.t === 'id', 'Expected a column name after SELECT.');
      let col;
      if (AGG.includes(tk.u) && toks[i + 1] && toks[i + 1].v === '(') {
        i += 2; const star = takeOp('*'); let arg = null;
        if (!star) { need(peek() && peek().t === 'id', 'Expected a column inside ' + tk.u + '( ).'); arg = peek().v; i++; }
        need(takeOp(')'), 'Missing “)” after ' + tk.u + '(.');
        col = { agg: tk.u, arg, label: tk.u + '(' + (arg || '*') + ')' };
      } else { i++; col = { name: tk.v, label: tk.v }; }
      if (take('AS')) { need(peek() && peek().t === 'id', 'Expected a name after AS.'); col.label = peek().v; i++; }
      cols.push(col);
    } while (takeOp(','));
    need(take('FROM'), 'Expected FROM after the column list.');
    const tname = peek() && peek().v; need(tname && tables[tname.toLowerCase()], 'Unknown table “' + (tname || '') + '”. Try: leads.'); i++;
    const rows = tables[tname.toLowerCase()];
    const known = new Set(Object.keys(rows[0] || {}));
    const colOk = c => { need(known.has(c), 'Unknown column “' + c + '”. Columns: ' + [...known].join(', ') + '.'); return c; };
    // WHERE expression → a function of a row
    function value() {
      const tk = peek(); need(tk, 'The query ended too early.');
      if (tk.t === 'num' || tk.t === 'str') { i++; return () => tk.v; }
      if (tk.u === 'NULL') { i++; return () => null; }
      need(tk.t === 'id', 'Expected a column or a value.'); i++; colOk(tk.v); return r => r[tk.v];
    }
    function primary() {
      if (takeOp('(')) { const e = orExpr(); need(takeOp(')'), 'Missing “)”.'); return e; }
      if (take('NOT')) { const e = primary(); return r => !e(r); }
      const left = value();
      if (take('IS')) { const not = take('NOT'); need(take('NULL'), 'Expected NULL after IS.'); return r => (left(r) == null) !== not; }
      const not = take('NOT');
      if (take('LIKE')) { const pat = value(); return r => { const rx = new RegExp('^' + String(pat(r)).replace(/[.*+?^$\{}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i'); return rx.test(String(left(r) ?? '')) !== not; }; }
      if (take('IN')) { need(takeOp('('), 'Expected “(” after IN.'); const vals = []; do vals.push(value()); while (takeOp(',')); need(takeOp(')'), 'Missing “)” after the IN list.'); return r => vals.some(v => v(r) == left(r)) !== not; }
      const tk = peek(); need(tk && tk.t === 'op' && ['=', '!=', '<>', '<', '>', '<=', '>='].includes(tk.v), 'Expected a comparison (=, <, LIKE, IN …).'); i++;
      const right = value();
      const cmp = { '=': (a, b) => a == b, '!=': (a, b) => a != b, '<>': (a, b) => a != b, '<': (a, b) => a < b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '>=': (a, b) => a >= b }[tk.v];
      return r => cmp(typeof left(r) === 'string' ? left(r).toLowerCase() : left(r), typeof right(r) === 'string' ? right(r).toLowerCase() : right(r));
    }
    function andExpr() { let e = primary(); while (take('AND')) { const a = e, b = primary(); e = r => a(r) && b(r); } return e; }
    function orExpr() { let e = andExpr(); while (take('OR')) { const a = e, b = andExpr(); e = r => a(r) || b(r); } return e; }
    const where = take('WHERE') ? orExpr() : null;
    let group = null;
    if (take('GROUP')) { need(take('BY'), 'Expected BY after GROUP.'); need(peek() && peek().t === 'id', 'Expected a column after GROUP BY.'); group = colOk(peek().v); i++; }
    let order = null;
    if (take('ORDER')) { need(take('BY'), 'Expected BY after ORDER.'); need(peek() && peek().t === 'id', 'Expected a column after ORDER BY.'); order = { by: peek().v, desc: false }; i++; if (take('DESC')) order.desc = true; else take('ASC'); }
    let limit = null;
    if (take('LIMIT')) { need(peek() && peek().t === 'num', 'Expected a number after LIMIT.'); limit = peek().v; i++; }
    takeOp(';');
    need(i === toks.length, 'Unexpected “' + (toks[i] && toks[i].v) + '”. Supported: SELECT … FROM … WHERE … GROUP BY … ORDER BY … LIMIT.');
    cols.forEach(c => { if (c.name) colOk(c.name); if (c.arg) colOk(c.arg); });
    const hasAgg = cols.some(c => c.agg);
    if (group || hasAgg) need(cols.every(c => c.agg || (c.name && c.name === group)), 'With GROUP BY or COUNT(), every other column must be the grouped column.');
    const picked = rows.filter(r => !where || where(r));
    const aggVal = (c, list) => {
      if (c.agg === 'COUNT') return c.arg ? list.filter(r => r[c.arg] != null).length : list.length;
      const nums = list.map(r => +r[c.arg]).filter(n => !isNaN(n));
      if (!nums.length) return null;
      return { SUM: nums.reduce((a, b) => a + b, 0), AVG: +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2), MIN: Math.min(...nums), MAX: Math.max(...nums) }[c.agg];
    };
    let header, out;
    if (cols.some(c => c.star)) { need(!group && !hasAgg, 'SELECT * cannot be combined with GROUP BY or COUNT().'); header = [...known]; out = picked.map(r => header.map(k => r[k])); }
    else if (group || hasAgg) {
      const groups = new Map(); picked.forEach(r => { const k = group ? r[group] : '*'; (groups.get(k) || groups.set(k, []).get(k)).push(r); });
      if (!group && !groups.size) groups.set('*', []);
      header = cols.map(c => c.label); out = [...groups.entries()].map(([k, list]) => cols.map(c => c.agg ? aggVal(c, list) : k));
    } else { header = cols.map(c => c.label); out = picked.map(r => cols.map(c => r[c.name])); }
    if (distinct) { const seen = new Set(); out = out.filter(r => { const k = JSON.stringify(r); if (seen.has(k)) return false; seen.add(k); return true; }); }
    if (order) {
      let k = header.indexOf(order.by); if (k < 0) k = cols.findIndex(c => c.name === order.by);
      need(k >= 0, 'ORDER BY “' + order.by + '” must be one of the selected columns.');
      out.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (order.desc ? -1 : 1));
    }
    if (limit != null) out = out.slice(0, limit);
    return { header, rows: out };
  }
  function sqlConsole(box) {
    const SAMPLES = [
      "SELECT id, name, status FROM leads WHERE status = 'new' ORDER BY id;",
      'SELECT status, COUNT(*) AS total FROM leads GROUP BY status ORDER BY total DESC;',
      "SELECT id, subject FROM leads WHERE subject LIKE '%refund%' OR message LIKE '%deposit%';",
      "SELECT DISTINCT status FROM leads;",
    ];
    const q = h('textarea', { class: 'dm-in dm-code', id: 'labSql', rows: 4, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'SQL query' });
    const msg = h('p', { class: 'dm-count', 'aria-live': 'polite' });
    const res = h('div', { class: 'dm-scroll' });
    const go = () => {
      blip(700);
      try {
        const t0 = performance.now(), r = runSql(q.value, { leads: S.store }), ms = performance.now() - t0;
        msg.textContent = r.rows.length + (r.rows.length === 1 ? ' row' : ' rows') + ' in ' + ms.toFixed(1) + ' ms (in your browser)'; msg.className = 'dm-count';
        res.replaceChildren(h('table', { class: 'dm-table' }, h('thead', {}, h('tr', {}, r.header.map(c => h('th', { scope: 'col' }, c)))),
          h('tbody', {}, r.rows.map(row => h('tr', {}, row.map(v => h('td', {}, v == null ? 'NULL' : String(v))))))));
      } catch (e) { msg.textContent = 'Error: ' + e.message; msg.className = 'dm-count err'; res.replaceChildren(); }
    };
    q.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); go(); } });
    q.value = SAMPLES[0];
    put(box,
      h('p', { class: 'sim' }, 'Simulated: a small read-only SQL interpreter in your browser, over the sample leads table (' + S.store.length + ' rows' + (S.lead && S.lead.id ? ', including the enquiry you posted' : '') + '). MySQL-style SELECT syntax; no database server is connected.'),
      h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'Try a query'), h('div', { class: 'dm-row' }, SAMPLES.map((x, k) => h('button', { type: 'button', class: 'dm-btn ghost', onclick: () => { q.value = x; go(); } }, ['Filter', 'Group and count', 'LIKE', 'Distinct'][k])))),
      h('div', { class: 'dm-field' }, h('label', { for: 'labSql' }, 'Query (columns: id, name, email, subject, message, status)'), q),
      h('div', { class: 'dm-row' }, h('button', { type: 'button', class: 'dm-btn go', onclick: go }, '▶ Run query')),
      msg, res, codeView(runSql));
    go();
  }

  /* ---------- 04 AI: a lead qualification workflow, and an MCP tool call ---------- */
  function demoAI(box) {
    const pane = h('div', { class: 'dm' });
    const tabs = [aiQualify, aiMcp];
    put(box, h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'Experiment'), choice(['Lead qualification', 'MCP tool call'], i => { pane.replaceChildren(); tabs[i](pane); }, 'Experiments')), pane);
    aiQualify(pane);
  }

  function aiQualify(box) {
    const SYSTEM = 'You screen enquiries for a help service.\nReply with JSON only, in this shape:\n{"is_request": boolean, "specific": boolean, "has_documents": boolean, "has_timeframe": boolean, "topic": string}\nIf one essential fact is missing, reply instead with {"ask": "<one short question>"}.\nNever give advice.';
    const J = JSON.stringify;
    const SAMPLES = [
      { label: 'Clear case', msg: 'My landlord has kept my deposit for three months since I moved out. Can someone help?',
        turns: [J({ ask: 'Do you have the tenancy agreement?' }), J({ is_request: true, specific: true, has_documents: true, has_timeframe: true, topic: 'tenancy deposit' })],
        reply: 'Yes, I have the agreement.' },
      { label: 'Vague case', msg: 'I think I might need a lawyer for something at work.',
        turns: [J({ ask: 'What happened at work, and when?' }), J({ is_request: true, specific: false, has_documents: false, has_timeframe: true, topic: 'employment (unclear)' })],
        reply: 'It was last month. I would rather not say more yet.' },
      { label: 'Off topic', msg: 'What is the capital of France?',
        turns: [J({ is_request: false, specific: false, has_documents: false, has_timeframe: false, topic: 'general knowledge' })] },
      { label: 'Bad output', msg: 'A client has not paid three invoices since June. I have the invoices and our emails.',
        turns: ['Sure! Here is my assessment: this looks like a strong lead.', J({ is_request: true, specific: true, has_documents: true, has_timeframe: true, topic: 'unpaid invoices' })] },
    ];
    const ROUTE = { 'Strong lead': 'Passed on, with the extracted fields attached.', 'Needs more information': 'Not passed on yet. The user is invited to share more.', 'Weak lead': 'Not passed on. The user is pointed to general help.', 'Not a lead': 'Answered politely and closed.', 'Manual review': 'Held for a person to check. Nothing is guessed.' };
    const TONE = { 'Strong lead': 'ok', 'Needs more information': 'mid', 'Weak lead': 'no', 'Not a lead': 'no', 'Manual review': 'mid' };
    const FACTS = { is_request: 'A request for help', specific: 'A specific problem', has_documents: 'Documents available', has_timeframe: 'A timeframe' };
    const opts = (S.lead ? [{ label: 'Your enquiry', msg: S.lead.message, own: true }] : []).concat(SAMPLES);
    let cur = 0, run = 0;
    const steps = h('ol', { class: 'ai-steps', 'aria-live': 'polite' });
    const go = h('button', { type: 'button', class: 'dm-btn go', onclick: play }, 'Run workflow');
    const how = h('p', { class: 'dm-why' });
    const next = h('div', { class: 'dm-row' });
    const li = (n, title, body, tag) => h('li', { class: 'ai-step' }, h('span', { class: 'ai-n' }, String(n).padStart(2, '0')), h('div', {}, h('b', {}, title, tag ? h('em', {}, tag) : null), body));
    const intake = o => li(1, 'Input', h('p', { class: 'ai-q' }, '“' + o.msg + '”'));
    function reset(i) {
      cur = i; run++; steps.replaceChildren(intake(opts[i])); go.disabled = false; go.textContent = 'Run workflow';
      how.textContent = opts[i].own ? 'Your text is not sent to a model. Three keyword rules in your browser stand in for it, so the result can be explained.' : 'A fictional enquiry. The model replies are written in advance; the validation and the decision are real code and run now.';
    }
    async function play() {
      const me = ++run, o = opts[cur], alive = () => me === run && steps.isConnected; go.disabled = true; blip(520);
      steps.replaceChildren(intake(o));
      let n = 1;
      const add = async (title, body, tag) => { await wait(550); if (!alive()) return false; const el = li(++n, title, body, tag); steps.append(el); blip(760); if (!still() && G) G.from(el, { opacity: 0, y: 8, duration: .3, ease: 'power2.out', clearProps: 'opacity,transform' }); return true; };
      const said = async (title, text, tag) => { const pre = h('pre', { class: 'dm-out' }); if (!await add(title, pre, tag)) return false; if (!await typeOut(pre, text, alive)) return false; try { pre.innerHTML = paint(JSON.parse(text)); } catch (e) {} return true; };
      const turns = o.own ? [J(qualifyByRules(o.msg))] : o.turns;
      let messages = `SYSTEM\n${SYSTEM}\n\nUSER\n${o.msg}`, fields = null;
      if (!await add('Prompt', h('pre', { class: 'dm-out ai-prompt' }, messages), o.own ? 'what a model would receive' : 'sent to the model')) return;
      for (let t = 0; t < turns.length && !fields; t++) {
        if (!await said(o.own ? 'Rules output' : 'Model response', turns[t], o.own ? 'computed now, no model' : 'simulated')) return;
        const r = parseModelOutput(turns[t]);                      // real code: the reply is text until it has been checked
        if (r.ok && r.ask) {
          if (!await add('Follow-up', h('div', {}, h('p', { class: 'ai-llm' }, 'Asked: ' + r.ask), h('p', { class: 'ai-q' }, 'User: “' + o.reply + '”'), h('p', {}, 'The answer is added to the conversation and the model is called again.')))) return;
        } else if (r.ok) {
          fields = r.data;
          if (!await add('Validate the output', h('ul', { class: 'ai-why' }, Object.keys(LEAD_FIELDS).map(k => h('li', { class: 'yes' }, `✓ ${k}: ${LEAD_FIELDS[k]}`))), 'real code')) return;
        } else if (!await add('Validate the output', h('div', {}, h('p', { class: 'ai-bad' }, '✗ ' + r.error), h('p', {}, t + 1 < turns.length ? 'Rejected. The model is called once more with the error and a reminder of the format.' : 'Rejected. No more retries.')), 'real code')) return;
      }
      const verdict = fields ? decide(fields) : 'Manual review';
      const why = fields ? h('ul', { class: 'ai-why' }, Object.keys(FACTS).map(k => h('li', { class: fields[k] ? 'yes' : 'no' }, (fields[k] ? '✓ ' : '✗ ') + FACTS[k]))) : h('p', {}, 'No valid output to decide on.');
      if (!await add('Decision', h('div', {}, h('p', { class: 'ai-v ' + TONE[verdict] }, verdict), why, h('p', {}, 'The model only extracts facts. This rule makes the decision, so the same facts always give the same answer.')), 'real code')) return;
      if (!await add('Route', h('p', {}, ROUTE[verdict]))) return;
      go.disabled = false; go.textContent = 'Run again';
      if (o.own && S.lead) { S.lead.verdict = verdict; drawTrail(); offer(next, 'Trace it through the architecture', 4); }
    }
    put(box,
      h('p', { class: 'sim' }, 'Simulated: no model is called and nothing is sent anywhere. It shows the general pattern of an LLM step inside an application, not WebMD’s system, prompts or rules.'),
      choice(opts.map(o => o.label), reset, 'Enquiries'), how, h('div', { class: 'dm-row' }, go), steps, next, codeView(parseModelOutput, decide, qualifyByRules));
    reset(0);
  }

  function aiMcp(box) {
    let rpcId = 0, run = 0;
    const rpc = (method, params) => Object.assign({ jsonrpc: '2.0', id: ++rpcId, method }, params ? { params } : {});
    const text = r => (r.result && r.result.content ? r.result.content[0].text : '');
    const ASKS = [
      { label: 'Find by topic', q: 'Which new enquiries are about a deposit?', call: ['search_leads', { query: 'deposit', status: 'new' }],
        say: r => { let rows = []; try { rows = JSON.parse(text(r)); } catch (e) {} return rows.length ? `${rows.length === 1 ? 'One new enquiry mentions' : rows.length + ' new enquiries mention'} a deposit: ${rows.map(x => `#${x.id} “${x.subject}”`).join(', ')}.` : 'No new enquiry mentions a deposit.'; } },
      { label: 'Read one', q: 'What is enquiry 4 about?', call: ['get_lead', { id: 4 }],
        say: r => { if (r.result.isError) return 'I could not find enquiry 4: ' + text(r); const x = JSON.parse(text(r)); return `Enquiry 4, “${x.subject}” (${x.status}): ${x.message}`; } },
      { label: 'Not permitted', q: 'Delete enquiry 2.', call: null,
        say: () => 'I can search and read enquiries, but this server offers no tool that deletes one, so I cannot do that.' },
    ];
    const log = h('ol', { class: 'mcp-log', 'aria-live': 'polite' });
    const msg = (who, kind, body) => h('li', { class: 'mcp-msg ' + kind }, h('span', {}, who), typeof body === 'string' ? h('p', {}, body) : h('pre', { class: 'dm-out', html: paint(body) }));
    const add = async el => { await wait(480); if (!log.isConnected) return false; log.append(el); blip(760); if (!still() && G) G.from(el, { opacity: 0, y: 8, duration: .3, ease: 'power2.out', clearProps: 'opacity,transform' }); return true; };
    async function call(name, args, me) {
      const req = rpc('tools/call', { name, arguments: args });
      if (!await add(msg('agent → server', 'out', req)) || me !== run) return null;
      const r = mcpServer(req);                                   // real code: the sample server answers
      if (!await add(msg('server → agent', 'in', r)) || me !== run) return null;
      return r;
    }
    async function ask(i) {
      const me = ++run, a = ASKS[i]; log.replaceChildren(msg('user', 'user', a.q));
      if (a.call) {
        if (!await add(msg('model, simulated', 'model', `Decides to call ${a.call[0]}.`)) || me !== run) return;
        const r = await call(a.call[0], a.call[1], me); if (!r) return;
        await add(msg('model, simulated', 'model', a.say(r)));
      } else await add(msg('model, simulated', 'model', a.say()));
    }
    const own = h('input', { class: 'dm-in', id: 'labMcpQ', type: 'text', placeholder: 'Try: refund', maxlength: 60, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', onkeydown: e => { if (e.key === 'Enter') mine(); } });
    async function mine() { const me = ++run; blip(520); log.replaceChildren(msg('you, acting as the agent', 'user', 'tools/call search_leads')); await call('search_leads', { query: own.value }, me); }
    const init = rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'sample-agent', version: '1.0.0' } }), list = rpc('tools/list');
    put(box,
      h('p', { class: 'sim' }, 'Simulated: a sample MCP server running in your browser. The JSON-RPC messages and the tool results are real; the model’s choices and wording are scripted. No model or outside server is contacted.'),
      h('p', { class: 'dm-why' }, 'The Model Context Protocol lets an agent discover tools and call them through one standard interface. This server exposes two read-only tools over the sample enquiries, and returns only the fields the model needs.'),
      h('details', { class: 'dm-det' }, h('summary', {}, 'Handshake: initialize, then tools/list'),
        h('ol', { class: 'mcp-log' }, msg('agent → server', 'out', init), msg('server → agent', 'in', mcpServer(init)), msg('agent → server', 'out', list), msg('server → agent', 'in', mcpServer(list)))),
      h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'Ask the agent'), choice(ASKS.map(a => a.label), ask, 'Questions', -1)),
      h('div', { class: 'dm-field' }, h('label', { for: 'labMcpQ' }, 'Or call search_leads yourself'), h('div', { class: 'dm-req' }, own, h('button', { type: 'button', class: 'dm-btn go', onclick: mine }, 'Call tool'))),
      log, codeView(mcpServer));
  }

  /* ---------- 05 Architecture: a product stack to explore, and this site's real data flow ---------- */
  function demoArch(box) {
    const STACK = {
      note: ['sim', 'Reference design: a typical stack of the kind I work on, drawn for this demo. It is not an employer’s system. The animation is a diagram; it sends no requests.'],
      N: {
        front: { x: 17, y: 14, name: 'Frontend', sub: 'JavaScript UI', what: 'Renders the interface, validates input early and calls the API with JSON.', why: 'Checking in the browser saves a round trip, but it is a convenience. The server never relies on it.' },
        api: { x: 50, y: 14, name: 'API', sub: 'PHP / Laravel', what: 'The only way in. It routes the request, checks who is calling, validates the input and returns a status code and a consistent JSON shape.', why: 'One entry point means one place for auth, validation and rate limits.' },
        svc: { x: 50, y: 50, name: 'Services', sub: 'application logic', what: 'The rules of the application: what happens when an enquiry is created, searched or qualified. It calls the stores and the model.', why: 'Keeping rules out of controllers lets the same code serve the API, a queue job or a command.' },
        db: { x: 17, y: 86, name: 'MySQL', sub: 'source of truth', what: 'Stores every record in tables with constraints and transactions.', why: 'If the stores ever disagree, the database is right and the search index is rebuilt from it.' },
        search: { x: 50, y: 86, name: 'Elasticsearch', sub: 'search index', what: 'Holds a searchable copy of the text: analysed into terms and ranked by relevance.', why: 'Ranked text search is a different job from exact lookups, so it gets its own tool.' },
        llm: { x: 84, y: 50, name: 'LLM API', sub: 'model provider', what: 'Reads free text and returns structured fields. It is called from the server only.', why: 'The key stays on the server, the call has a time limit, and the reply is validated before anything uses it.' },
      },
      LINKS: [['front', 'api'], ['api', 'svc'], ['svc', 'db'], ['svc', 'search'], ['svc', 'llm']],
      FLOWS: [
        { label: 'Submit an enquiry', steps: [['front', 'api', 'POST /leads with a JSON body. The form has already checked it.'], ['api', 'svc', 'The API validates it again and hands a clean object to the service.'], ['svc', 'db', 'INSERT inside a transaction. The row gets its id.'], ['svc', 'search', 'The new row is indexed. If indexing fails it is retried later; the save still stands.'], ['svc', 'api', 'The service returns the stored record.'], ['api', 'front', '201 Created, with the new id and a Location header.']] },
        { label: 'Search', steps: [['front', 'api', 'GET /leads?q=refund+laptops'], ['api', 'svc', 'The query is trimmed and limited in length.'], ['svc', 'search', 'A multi_match query returns ranked ids.'], ['svc', 'db', 'The rows are loaded by id, so the data shown is current.'], ['svc', 'api', 'The rows are returned in ranked order.'], ['api', 'front', '200 OK. The page draws the list.']] },
        { label: 'Qualify with AI', steps: [['api', 'svc', 'A stored enquiry is picked up for qualification.'], ['svc', 'llm', 'The service sends a prompt with the message and a strict output format.'], ['llm', 'svc', 'The reply is parsed and validated. A bad reply is retried once, then held for a person.'], ['svc', 'db', 'Code, not the model, decides the verdict. It is saved with the extracted fields.'], ['svc', 'api', 'The result is available to the interface.'], ['api', 'front', 'The enquiry shows its verdict and the reasons.']] },
      ],
    };
    const SITE = {
      note: ['sim live', 'Real architecture: this is how this site works. The animation is a diagram; it sends no requests.'],
      N: {
        browser: { x: 17, y: 40, name: 'Browser', sub: 'the 3D page', what: 'Renders the desk with three.js and runs every interaction. It calls the weather and GitHub APIs itself.', why: 'Both are public and need no key, so there is nothing to hide behind a server.' },
        edge: { x: 50, y: 13, name: 'Cloudflare', sub: 'static files', what: 'Serves the page, the 3D models and the textures from the edge.', why: 'The page is static, so no server has to build HTML and there is little that can break.' },
        worker: { x: 50, y: 46, name: 'Worker', sub: '/api routes', what: 'Runs only for /api/contact and /api/geo. It validates input, limits repeat requests and holds the email key.', why: 'Secrets and third-party calls that need a key stay on the server, never in page code.' },
        resend: { x: 84, y: 46, name: 'Resend', sub: 'email', what: 'Delivers contact-form messages. Only the Worker calls it, with the visitor’s address as Reply-To.', why: 'The page reports success only when the email was accepted. A failure is shown as a failure.' },
        meteo: { x: 50, y: 84, name: 'Open-Meteo', sub: 'weather', what: 'Provides the weather that changes the scene outside the window.', why: 'Results are reused for 15 minutes, so the page does not repeat requests.' },
        github: { x: 17, y: 84, name: 'GitHub API', sub: 'public repos', what: 'Provides the public repository list in Projects, read live.', why: 'The list is cached in the browser for 6 hours. Only what GitHub returns is shown.' },
      },
      LINKS: [['browser', 'edge'], ['browser', 'worker'], ['worker', 'resend'], ['browser', 'meteo'], ['browser', 'github']],
      FLOWS: [
        { label: 'Page load', steps: [['browser', 'edge', 'The browser asks for the page.'], ['edge', 'browser', 'Cloudflare returns the HTML, then the models and textures. No server builds the page.']] },
        { label: 'Contact form', steps: [['browser', 'worker', 'The form posts JSON to /api/contact.'], ['worker', 'resend', 'The Worker validates the message, limits repeats and sends the email with a server-side key.'], ['resend', 'worker', 'Resend accepts or rejects the email.'], ['worker', 'browser', 'The page shows success only if the email was accepted.']] },
        { label: 'Weather', steps: [['browser', 'worker', 'If location is not shared, /api/geo returns an approximate city from Cloudflare’s network data.'], ['worker', 'browser', 'Nothing about the visitor is stored.'], ['browser', 'meteo', 'The browser asks Open-Meteo directly. It needs no key, so no proxy is needed.'], ['meteo', 'browser', 'The result is reused for 15 minutes.']] },
        { label: 'Projects list', steps: [['browser', 'github', 'Opening Projects reads the public repositories from the GitHub API.'], ['github', 'browser', 'The list is cached in the browser for 6 hours.']] },
      ],
    };
    let run = 0;
    const view = h('div', { class: 'dm' });
    function draw({ note, N, LINKS, FLOWS }) {
      run++;
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
      view.replaceChildren(h('p', { class: note[0] }, note[1]),
        h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'Follow a request'), choice(FLOWS.map(f => f.label), play, 'Data flows', 0)),
        map, log, info);
      play(0);
    }
    const L = S.lead;
    let journey = null;
    if (L) {
      L.traced = true; drawTrail();
      journey = h('div', { class: 'ar-info' }, h('b', {}, 'Your sample enquiry'),
        h('p', {}, 'It never left this browser. In the lab it went: form, validated' + (L.id ? `; sample API, stored as id ${L.id}` : '; sample API, not posted yet') + (L.found ? '; found by search' : '') + (L.verdict ? `; qualified as “${L.verdict}”` : '') + '.'),
        h('p', {}, 'In a real product, the same journey crosses the components below.'));
    }
    put(box, journey,
      h('div', { class: 'dm-field' }, h('span', { class: 'dm-lbl' }, 'System'), choice(['Product stack (sample)', 'This site (real)'], i => draw(i ? SITE : STACK), 'Systems')),
      view);
    draw(STACK);
  }

  /* ---------- the five modules ---------- */
  const MODS = [
    { name: 'Backend Engine', keys: 'backend back api php laravel', line: 'APIs and server-side code', tech: ['PHP', 'Laravel', 'CodeIgniter', 'Node.js', 'REST APIs'],
      know: ['Server-side application code in PHP, with Laravel and CodeIgniter.', 'REST API design: resources, validation, status codes and consistent error shapes.', 'Keeping keys and third-party calls on the server, out of page code.'],
      proj: [[0, 'Nolo CMS', 'Sole developer. WebMD, confidential.'], [3, 'This site’s API', 'A Cloudflare Worker with two endpoints. Public code.']],
      demoName: 'API playground', demo: demoBackend },
    { name: 'Frontend Studio', keys: 'frontend front ui javascript js css html', line: 'Interfaces in the browser', tech: ['JavaScript', 'jQuery', 'HTML', 'CSS'],
      know: ['Interfaces in plain JavaScript and jQuery, without depending on a framework.', 'Semantic HTML, keyboard access and responsive CSS.', 'Turning designs into working HTML.'],
      proj: [[2, 'Figma-to-HTML skill', 'Turns Figma designs into HTML. Used across the IB team.'], [3, 'Prathamesh’s Desk', 'This site: one HTML page, no framework or bundler.']],
      demoName: 'UI and JavaScript playground', demo: box => tabs(box, [['Form events', demoFrontend], ['JavaScript playground', jsPlayground]]) },
    { name: 'Database Console', keys: 'database db data mysql elasticsearch search sql', line: 'Data modelling and search', tech: ['MySQL', 'Elasticsearch', 'Data modelling', 'Search'],
      know: ['Relational data modelling and queries in MySQL.', 'Full-text search with Elasticsearch: analysed text and relevance ranking.', 'Choosing between an exact database lookup and a ranked search.'],
      proj: [], projNote: 'Used in product and client work. Those projects and their data are not public.',
      demoName: 'SQL and search console', demo: box => tabs(box, [['SQL console', sqlConsole], ['Search: LIKE vs full-text', demoDatabase]]) },
    { name: 'AI Research Lab', keys: 'ai llm mcp claude research', line: 'LLM features and agent tooling', tech: ['LLM integrations', 'MCP', 'Claude Code', 'Claude API', 'Figma MCP', 'Cline'],
      know: ['Working on LLM features that run in a production product.', 'Connecting tools to coding agents through the Model Context Protocol.', 'Writing agent skills a whole team can reuse, to speed up development.'],
      proj: [[1, 'AI lead qualification engine', 'An LLM asks follow-up questions and scores leads. WebMD, confidential.'], [2, 'Figma-to-HTML skill', 'Figma MCP with Claude Code and Cline.']],
      demoName: 'LLM workflow and MCP', demo: demoAI },
    { name: 'System Architecture', keys: 'architecture system arch design flow', line: 'How the parts fit together', tech: ['API architecture', 'Application design', 'Data flow', 'Engineering decisions'],
      know: ['Deciding what runs in the browser, on the server and in outside services.', 'Designing so that failures are reported, never hidden.', 'Keeping a system small enough for one person to own end to end.'],
      proj: [[3, 'Prathamesh’s Desk', 'Its real architecture is the second diagram above. Public code.'], [0, 'Nolo CMS', 'Sole developer. Architecture not public.']],
      demoName: 'Architecture explorer', demo: demoArch },
  ];
  const no = i => String(i + 1).padStart(2, '0');

  let busy = false;
  const status = h('p', { class: 'lab-status', 'aria-live': 'polite' });
  const rack = h('ul', { class: 'lab-rack', 'aria-label': 'Engineering modules' });
  const stage = h('div', { class: 'lab-stage', hidden: true });
  const mons = MODS.map((m, i) => {
    const b = h('button', { type: 'button', class: 'mon t' + i, 'aria-label': `Module ${no(i)}, ${m.name}: ${m.tech.join(', ')}. Switch on.`, onclick: () => power(i) },
      h('span', { class: 'mon-scr' }, h('span', { class: 'mon-no' }, 'MODULE ' + no(i)), h('span', { class: 'mon-name' }, m.name), h('span', { class: 'mon-tech' }, m.tech.join(' · ')), h('span', { class: 'mon-tool' }, 'Tool: ' + m.demoName), h('span', { class: 'mon-cta' }, '▸ Power on'), h('span', { class: 'mon-beam' })),
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

  // arrow keys walk the rack; in a workstation [ and ] switch module, and Escape steps back before it closes the panel
  rack.addEventListener('keydown', e => {
    const i = mons.indexOf(document.activeElement), d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (i < 0 || !d) return; e.preventDefault(); mons[(i + d + mons.length) % mons.length].focus();
  });
  host.addEventListener('keydown', e => {
    if (openIdx < 0 || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(true); return; }
    if ((e.key === '[' || e.key === ']') && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { e.preventDefault(); show((openIdx + (e.key === ']' ? 1 : MODS.length - 1)) % MODS.length); }
  });

  function power(i) {
    if (busy) return; blip(440);
    if (still() || !G) return show(i);
    busy = true; const beam = mons[i].querySelector('.mon-beam'); mons[i].classList.add('on');
    G.timeline({ onComplete: () => { busy = false; mons[i].classList.remove('on'); G.set(beam, { clearProps: 'all' }); show(i); } })
      .fromTo(beam, { scaleY: .03, scaleX: .2, opacity: 1 }, { scaleX: 1, duration: .16, ease: 'power2.out' })
      .to(beam, { scaleY: 1, duration: .2, ease: 'power3.out' })
      .to(beam, { opacity: 0, duration: .16 });
  }
  // the desk's own sound switch, reachable from the workstation (sound stays off until the visitor turns it on)
  function soundButton() {
    const k = hook(); if (!k.setSound || !k.soundOn) return null;
    const b = h('button', { type: 'button', class: 'lab-snd', onclick: () => { k.setSound(!k.soundOn()); paintBtn(); blip(700); } });
    const paintBtn = () => { const on = !!k.soundOn(); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '♪ Sound on' : '♪ Sound off'; };
    paintBtn(); return b;
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
      h('h4', {}, m.demoName), trailHost, demo,
      h('h4', {}, 'What I work with'), h('ul', { class: 'ws-list' }, m.know.map(t => h('li', {}, t))),
      h('h4', {}, 'Related projects'),
      m.proj.length ? h('ul', { class: 'ws-proj' }, m.proj.map(([c, name, text]) => h('li', {}, h('button', { type: 'button', onclick: () => { if (hook().openCase) hook().openCase(c); else location.hash = 'work'; } }, h('b', {}, name), h('span', {}, text), h('i', { 'aria-hidden': 'true' }, 'Case study →'))))) : h('p', { class: 'ws-note' }, m.projNote));
    const ws = h('div', { class: 'ws t' + i, role: 'region', 'aria-label': m.name + ' workstation' },
      h('div', { class: 'ws-bar' }, h('button', { type: 'button', class: 'lab-back', onclick: () => close(true) }, '← All modules'),
        h('span', { class: 'ws-keys', 'aria-hidden': 'true' }, h('kbd', {}, '['), h('kbd', {}, ']'), ' switch · ', h('kbd', {}, 'Esc'), ' back'),
        soundButton(), h('span', { class: 'ws-led', 'aria-hidden': 'true' })),
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
  window.__lab = { open: show, close, find, names: MODS.map(m => m.name), state: S, api: leadsApi, search: searchFullText, mcp: mcpServer, parse: parseModelOutput, decide, sql: runSql };
})();
