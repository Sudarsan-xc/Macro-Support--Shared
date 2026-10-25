/* MacroDesk — front-end logic
   Expects config.js to define your Supabase URL + anon key (several common names are supported below).
   Expects a table called "macros" with columns: id, title, category, keywords, situation, macro.
   If your table is named differently, change TABLE below. */

(() => {
  const TABLE = (typeof MACRO_TABLE !== 'undefined' && MACRO_TABLE) || 'macros';

  const $ = (id) => document.getElementById(id);

  /* ---- Supabase client (built after we locate your config) ---- */
  let sb = null;

  function configFromGlobals() {
    const tryGet = (fn) => { try { return fn(); } catch { return ''; } };
    const url =
      tryGet(() => SUPABASE_URL) || tryGet(() => supabaseUrl) || tryGet(() => SUPABASE_PROJECT_URL) ||
      tryGet(() => SUPABASE_CONFIG.url) || tryGet(() => window.SUPABASE_CONFIG.url) ||
      tryGet(() => window.APP_CONFIG.supabaseUrl) || tryGet(() => window.ENV.SUPABASE_URL) || '';
    const key =
      tryGet(() => SUPABASE_ANON_KEY) || tryGet(() => SUPABASE_KEY) || tryGet(() => SUPABASE_PUBLISHABLE_KEY) ||
      tryGet(() => SUPABASE_PUBLIC_KEY) || tryGet(() => supabaseKey) || tryGet(() => supabaseAnonKey) ||
      tryGet(() => SUPABASE_CONFIG.anonKey) || tryGet(() => SUPABASE_CONFIG.key) ||
      tryGet(() => window.SUPABASE_CONFIG.anonKey) || tryGet(() => window.APP_CONFIG.supabaseAnonKey) ||
      tryGet(() => window.ENV.SUPABASE_ANON_KEY) || '';
    return { url, key };
  }

  async function configFromFile() {
    // Fallback: read config.js as text and pull out the project URL and key, whatever the variables are called
    const text = await (await fetch('config.js', { cache: 'no-store' })).text();
    const url = (text.match(/https:\/\/[a-z0-9-]+\.supabase\.(?:co|in)/i) || [])[0] || '';
    const key = (text.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+|sb_publishable_[\w-]+/) || [])[0] || '';
    return { url, key };
  }

  async function initClient() {
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('The Supabase library did not load. Check your internet connection and try again.');
    }
    let { url, key } = configFromGlobals();
    if (!url || !key) { try { ({ url, key } = await configFromFile()); } catch { /* handled below */ } }
    if (!url || !key) {
      throw new Error('Supabase URL or key not found. Make sure config.js sits next to index.html and contains your project URL and anon key.');
    }
    sb = window.supabase.createClient(url, key);
  }

  function showLoginError(msg) {
    const err = $('loginError');
    err.classList.add('hidden');
    void err.offsetWidth; // restart the shake animation
    err.textContent = msg;
    err.classList.remove('hidden');
  }

  const PAGE = 24; // cards drawn at once, keeps the page light
  const state = { macros: [], list: [], limit: PAGE, query: '', category: '', keywordsAsArray: false, openId: null };

  /* ---------- helpers ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const kwString = (m) => Array.isArray(m.keywords) ? m.keywords.join(', ') : (m.keywords || '');
  const catOf = (m) => (m.category || '').trim() || 'General';
  const hueCache = new Map();
  const hue = (name) => {
    if (!hueCache.has(name)) { let h = 0; for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360; hueCache.set(name, h); }
    return hueCache.get(name);
  };
  const tokens = (q) => q.toLowerCase().split(/\s+/).filter(Boolean);

  function highlight(text, toks) {
    const raw = String(text ?? '');
    if (!toks.length) return esc(raw);
    const re = new RegExp('(' + toks.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
    return raw.split(re).map((part, i) => (i % 2 ? '<mark>' + esc(part) + '</mark>' : esc(part))).join('');
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function setSync(text, cls) {
    const s = $('syncStatus');
    s.textContent = text;
    s.className = 'sync-status' + (cls ? ' ' + cls : '');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    toast('Response copied');
  }

  /* ---------- filtering ---------- */
  function score(m, toks) {
    if (!toks.length) return 1;
    const title = m._t, cat = m._c, kw = m._k, sit = m._s, body = m._b; // prepared once in loadMacros
    let total = 0;
    for (const t of toks) {
      let s = 0;
      if (title.includes(t)) s += 10;
      if (kw.includes(t)) s += 8;
      if (cat.includes(t)) s += 6;
      if (sit.includes(t)) s += 4;
      if (body.includes(t)) s += 2;
      if (!s) return 0; // every word must match somewhere
      total += s;
    }
    return total;
  }

  function filtered() {
    const toks = tokens(state.query);
    return state.macros
      .filter((m) => !state.category || catOf(m) === state.category)
      .map((m) => ({ m, s: score(m, toks) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.m.title.localeCompare(b.m.title))
      .map((x) => x.m);
  }

  function categories() {
    const map = new Map();
    state.macros.forEach((m) => map.set(catOf(m), (map.get(catOf(m)) || 0) + 1));
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }

  /* ---------- rendering ---------- */
  function renderCategories() {
    const cats = categories();
    const all = state.macros.length;

    $('sideCategories').innerHTML =
      `<button class="cat-btn ${!state.category ? 'active' : ''}" data-cat=""><span class="cat-dot" style="--h:210"></span><span class="cat-name">All macros</span><span class="cat-count">${all}</span></button>` +
      cats.map(([c, n]) => `<button class="cat-btn ${state.category === c ? 'active' : ''}" data-cat="${esc(c)}"><span class="cat-dot" style="--h:${hue(c)}"></span><span class="cat-name">${esc(c)}</span><span class="cat-count">${n}</span></button>`).join('');

    $('categoryChips').innerHTML =
      `<button class="chip ${!state.category ? 'active' : ''}" data-cat="">All <small>${all}</small></button>` +
      cats.map(([c, n]) => `<button class="chip ${state.category === c ? 'active' : ''}" data-cat="${esc(c)}"><span class="cat-dot" style="--h:${hue(c)}"></span>${esc(c)} <small>${n}</small></button>`).join('');

    $('categoryFilter').innerHTML = '<option value="">All categories</option>' +
      cats.map(([c]) => `<option value="${esc(c)}" ${state.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('');

    $('categoryList').innerHTML = cats.map(([c]) => `<option value="${esc(c)}">`).join('');
  }

  function renderResults() {
    const list = filtered();
    state.list = list;
    const toks = tokens(state.query);
    $('resultTitle').textContent = state.category || 'All macros';
    $('resultCount').textContent = `${list.length} ${list.length === 1 ? 'macro' : 'macros'}`;
    $('clearSearch').classList.toggle('hidden', !state.query);
    $('emptyState').classList.toggle('hidden', list.length > 0);

    $('results').innerHTML = list.slice(0, state.limit).map((m) => {
      const c = catOf(m);
      return `<article class="card" data-id="${esc(m.id)}" tabindex="0" style="--h:${hue(c)}">
        <div class="card-top"><span class="tag" style="--h:${hue(c)}">${esc(c)}</span></div>
        <h3>${highlight(m.title, toks)}</h3>
        ${m.situation ? `<p class="when">${highlight(m.situation, toks)}</p>` : ''}
        <p class="preview">${esc(m.macro.slice(0, 240))}</p>
        <div class="card-foot"><span>Click to read full reply</span><button class="copy-mini" data-copy="${esc(m.id)}">Copy</button></div>
      </article>`;
    }).join('');

    const left = list.length - state.limit;
    $('moreBtn').classList.toggle('hidden', left <= 0);
    if (left > 0) $('moreBtn').textContent = `Show ${Math.min(PAGE, left)} more (${left} left)`;
  }

  function refresh() { state.limit = PAGE; renderResults(); }

  function renderManage() {
    $('macroCount').textContent = state.macros.length;
    const sorted = [...state.macros].sort((a, b) => a.title.localeCompare(b.title));
    $('manageList').innerHTML = sorted.length ? sorted.map((m) => {
      const c = catOf(m);
      return `<div class="manage-item">
        <div class="info"><b>${esc(m.title)}</b><span class="tag" style="--h:${hue(c)}">${esc(c)}</span></div>
        <div class="row-actions"><button data-edit="${esc(m.id)}">Edit</button><button class="del" data-del="${esc(m.id)}">Delete</button></div>
      </div>`;
    }).join('') : '<div class="manage-empty">No macros yet. Add your first one using the form.</div>';
  }

  function renderAll() { renderCategories(); renderResults(); renderManage(); }

  /* ---------- category selection ---------- */
  function selectCategory(cat) {
    state.category = cat;
    showView('searchView');
    renderCategories();
    refresh();
    $('pageSub').textContent = cat ? `Showing every macro in ${cat}.` : 'Search by situation, keyword, category, or wording.';
  }

  /* ---------- views ---------- */
  const titles = {
    searchView: ['Find a macro', 'Search by situation, keyword, category, or wording.'],
    manageView: ['Manage macros', 'Keep the shared library accurate and organized.'],
    aiView: ['AI Assistant', 'Generate and refine client replies with Gemini.']
  };
  function showView(id) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active-view', v.id === id));
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.view === id));
    $('pageTitle').textContent = titles[id][0];
    $('pageSub').textContent = id === 'searchView' && state.category ? `Showing every macro in ${state.category}.` : titles[id][1];
    if (id === 'searchView') $('search').focus({ preventScroll: true });
  }

  /* ---------- drawer ---------- */
  function openDrawer(id) {
    const m = state.macros.find((x) => String(x.id) === String(id));
    if (!m) return;
    state.openId = m.id;
    const c = catOf(m);
    const tag = $('drawerTag');
    tag.textContent = c; tag.style.setProperty('--h', hue(c));
    $('drawerTitle').textContent = m.title;
    $('drawerWhen').innerHTML = m.situation ? `<b>When to use it</b>${esc(m.situation)}` : '';
    $('drawerWhen').classList.toggle('hidden', !m.situation);
    $('drawerReply').textContent = m.macro;
    $('drawer').classList.add('open'); $('drawerOverlay').classList.add('open');
    $('drawer').setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    $('drawer').classList.remove('open'); $('drawerOverlay').classList.remove('open');
    $('drawer').setAttribute('aria-hidden', 'true');
    state.openId = null;
  }

  /* ---------- editor ---------- */
  function resetForm() {
    $('macroForm').reset(); $('macroId').value = '';
    $('formTitle').textContent = 'Add new macro';
    $('saveBtn').textContent = 'Save macro';
  }
  function editMacro(id) {
    const m = state.macros.find((x) => String(x.id) === String(id));
    if (!m) return;
    closeDrawer(); showView('manageView');
    $('macroId').value = m.id; $('title').value = m.title; $('category').value = m.category || '';
    $('keywords').value = kwString(m); $('situation').value = m.situation || ''; $('macro').value = m.macro || '';
    $('formTitle').textContent = 'Edit macro'; $('saveBtn').textContent = 'Update macro';
    $('title').focus();
  }

  function buildPayload(src) {
    const kw = Array.isArray(src.keywords)
      ? src.keywords
      : String(src.keywords || '').split(',').map((s) => s.trim()).filter(Boolean);
    return {
      title: String(src.title || '').trim(),
      category: String(src.category || '').trim(),
      keywords: state.keywordsAsArray ? kw : kw.join(', '),
      situation: String(src.situation || '').trim(),
      macro: String(src.macro || '').trim()
    };
  }

  async function saveMacro(e) {
    e.preventDefault();
    const payload = buildPayload({
      title: $('title').value, category: $('category').value, keywords: $('keywords').value,
      situation: $('situation').value, macro: $('macro').value
    });
    const id = $('macroId').value;
    $('saveBtn').disabled = true;
    const { error } = id ? await sb.from(TABLE).update(payload).eq('id', id) : await sb.from(TABLE).insert(payload);
    $('saveBtn').disabled = false;
    if (error) { toast('Could not save: ' + error.message); return; }
    toast(id ? 'Macro updated' : 'Macro added');
    resetForm();
    await loadMacros();
  }

  async function deleteMacro(id) {
    const m = state.macros.find((x) => String(x.id) === String(id));
    if (!m || !confirm(`Delete "${m.title}"? This removes it for every agent.`)) return;
    const { error } = await sb.from(TABLE).delete().eq('id', id);
    if (error) { toast('Could not delete: ' + error.message); return; }
    toast('Macro deleted');
    await loadMacros();
  }

  /* ---------- data ---------- */
  async function loadMacros() {
    setSync('Syncing…');
    const { data, error } = await sb.from(TABLE).select('*');
    if (error) { setSync('Sync failed', 'err'); toast('Could not load macros: ' + error.message); return; }
    state.macros = (data || []).map((m) => {
      const row = { ...m, title: m.title || 'Untitled', macro: m.macro || '' };
      row._t = row.title.toLowerCase(); row._c = catOf(row).toLowerCase(); row._k = kwString(row).toLowerCase();
      row._s = (row.situation || '').toLowerCase(); row._b = row.macro.toLowerCase();
      return row;
    });
    state.keywordsAsArray = state.macros.some((m) => Array.isArray(m.keywords));
    if (state.category && !state.macros.some((m) => catOf(m) === state.category)) state.category = '';
    setSync('Synced', 'ok');
    renderAll();
  }

  function exportMacros() {
    const out = state.macros.map(({ title, category, keywords, situation, macro }) => ({ title, category, keywords, situation, macro }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    a.download = 'macros-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click(); URL.revokeObjectURL(a.href);
  }

  async function importMacros(file) {
    try {
      const rows = JSON.parse(await file.text());
      if (!Array.isArray(rows)) throw new Error('File must contain a list of macros');
      const payload = rows.filter((r) => r && r.title && r.macro).map(buildPayload);
      if (!payload.length) throw new Error('No valid macros found');
      const { error } = await sb.from(TABLE).insert(payload);
      if (error) throw error;
      toast(`Imported ${payload.length} macros`);
      await loadMacros();
    } catch (err) { toast('Import failed: ' + err.message); }
    $('importFile').value = '';
  }

  /* ---------- 14-hour session limit ---------- */
  const SESSION_MAX_MS = 14 * 60 * 60 * 1000;
  const LOGIN_KEY = 'macrodesk_login_at';
  let expiryTimer;
  const store = {
    get: () => { try { return Number(localStorage.getItem(LOGIN_KEY)) || 0; } catch { return 0; } },
    set: (v) => { try { localStorage.setItem(LOGIN_KEY, String(v)); } catch { /* ignore */ } scheduleExpiry(); },
    clear: () => { try { localStorage.removeItem(LOGIN_KEY); } catch { /* ignore */ } clearTimeout(expiryTimer); }
  };

  async function expireSession() {
    store.clear();
    try { await sb.auth.signOut(); } catch { /* ignore */ }
    showLogin();
    showLoginError('Your session ended after 14 hours. Please sign in again.');
  }

  // Returns true when the saved session is older than 14 hours (and signs the user out)
  async function enforceExpiry(session) {
    let start = store.get();
    if (!start) {
      const t = session && session.user && session.user.last_sign_in_at ? Date.parse(session.user.last_sign_in_at) : NaN;
      start = Number.isFinite(t) ? t : Date.now();
      store.set(start);
    }
    if (Date.now() - start >= SESSION_MAX_MS) { await expireSession(); return true; }
    return false;
  }

  function checkExpiry() {
    const start = store.get();
    if (sb && start && Date.now() - start >= SESSION_MAX_MS && !$('appShell').classList.contains('hidden')) expireSession();
  }
  // A single timer that fires once at the 14-hour mark (no polling, so zero idle CPU)
  function scheduleExpiry() {
    clearTimeout(expiryTimer);
    const start = store.get();
    if (!start) return;
    const wait = Math.max(1000, start + SESSION_MAX_MS - Date.now() + 500);
    expiryTimer = setTimeout(checkExpiry, Math.min(wait, 2147483647));
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkExpiry(); });

  /* ---------- auth ---------- */
  function showApp(user) {
    $('loginScreen').classList.add('hidden');
    $('appShell').classList.remove('hidden');
    $('userEmail').textContent = user.email || '';
    loadMacros();
  }
  function showLogin() {
    $('appShell').classList.add('hidden');
    $('loginScreen').classList.remove('hidden');
    state.macros = [];
  }

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    $('loginError').classList.add('hidden');
    if (!sb) {
      try { await initClient(); } catch (err) { showLoginError(err.message); return; }
    }
    btn.disabled = true; btn.querySelector('span').textContent = 'Signing in';
    try {
      const { error } = await sb.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginPassword').value });
      if (error) showLoginError(error.message === 'Invalid login credentials' ? 'Wrong email or password. Please try again.' : 'Sign in failed: ' + error.message);
      else store.set(Date.now());
    } catch (err) {
      showLoginError('Could not reach the server: ' + (err.message || err));
    }
    btn.disabled = false; btn.querySelector('span').textContent = 'Sign in';
  });
  $('logoutBtn').addEventListener('click', () => { store.clear(); if (sb) sb.auth.signOut(); });

  // Show / hide password
  $('togglePw').addEventListener('click', () => {
    const pw = $('loginPassword');
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    $('togglePw').classList.toggle('on', show);
    $('togglePw').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });


  initClient().then(() => {
    sb.auth.onAuthStateChange((_evt, session) => {
      setTimeout(async () => {
        if (!session) { showLogin(); return; }
        if (await enforceExpiry(session)) return;
        showApp(session.user);
      }, 0);
    });
    sb.auth.getSession().then(({ data }) => { if (!data.session) showLogin(); });
  }).catch((err) => { showLogin(); showLoginError(err.message); });

  /* ---------- keep the animated login light ---------- */
  (() => {
    const screen = $('loginScreen');
    let idle, last = 0;
    const sleep = () => screen.classList.add('paused');
    const wake = () => {
      const now = Date.now();
      if (now - last < 1000 && !screen.classList.contains('paused')) return;
      last = now;
      screen.classList.remove('paused');
      clearTimeout(idle);
      idle = setTimeout(sleep, 45000);
    };
    ['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach((ev) => screen.addEventListener(ev, wake, { passive: true }));
    document.addEventListener('visibilitychange', () => (document.hidden ? sleep() : wake()));
    wake();
  })();

  /* ---------- events ---------- */
  document.querySelectorAll('.nav-item').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

  // Category clicks (sidebar + chips) use event delegation so they work after every re-render
  ['sideCategories', 'categoryChips'].forEach((id) =>
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (b) selectCategory(b.dataset.cat);
    }));
  $('categoryFilter').addEventListener('change', (e) => selectCategory(e.target.value));

  let searchTimer;
  $('search').addEventListener('input', (e) => {
    state.query = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refresh, 130); // wait for a pause in typing
  });
  $('moreBtn').addEventListener('click', () => { state.limit += PAGE; renderResults(); });
  $('search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const first = state.list[0]; if (first) openDrawer(first.id); }
  });
  $('clearSearch').addEventListener('click', () => { state.query = ''; $('search').value = ''; refresh(); $('search').focus(); });
  document.querySelectorAll('.quick-row [data-query]').forEach((b) => b.addEventListener('click', () => {
    state.query = b.dataset.query; $('search').value = state.query; refresh();
  }));
  $('resetFilters').addEventListener('click', () => { state.query = ''; $('search').value = ''; selectCategory(''); });

  $('results').addEventListener('click', (e) => {
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      e.stopPropagation();
      const m = state.macros.find((x) => String(x.id) === copy.dataset.copy);
      if (m) copyText(m.macro);
      return;
    }
    const card = e.target.closest('.card');
    if (card) openDrawer(card.dataset.id);
  });
  $('results').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('card')) openDrawer(e.target.dataset.id);
  });

  $('drawerClose').addEventListener('click', closeDrawer);
  $('drawerOverlay').addEventListener('click', closeDrawer);
  $('drawerCopy').addEventListener('click', () => {
    const m = state.macros.find((x) => String(x.id) === String(state.openId));
    if (m) copyText(m.macro);
  });
  $('drawerEdit').addEventListener('click', () => editMacro(state.openId));

  $('macroForm').addEventListener('submit', saveMacro);
  $('newBtn').addEventListener('click', resetForm);
  $('cancelBtn').addEventListener('click', () => { resetForm(); showView('searchView'); });
  $('newTopBtn').addEventListener('click', () => { resetForm(); showView('manageView'); $('title').focus(); });
  $('manageList').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]'); if (ed) return editMacro(ed.dataset.edit);
    const del = e.target.closest('[data-del]'); if (del) deleteMacro(del.dataset.del);
  });

  $('exportBtn').addEventListener('click', exportMacros);
  $('importFile').addEventListener('change', (e) => { if (e.target.files[0]) importMacros(e.target.files[0]); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.key === '/' && !typing && !$('appShell').classList.contains('hidden')) { e.preventDefault(); showView('searchView'); $('search').focus(); }
  });
})();
