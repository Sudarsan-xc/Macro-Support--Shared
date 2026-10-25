/* MacroDesk: private per-agent 24-hour chat, Supabase RLS + RPC.
   Requires ai-settings.js, Supabase JS v2, and the existing popup IDs. */
(() => {
  const el = id => document.getElementById('mdai-' + id);
  const thread = el('thread'), input = el('message'), send = el('generate');
  const drawer = document.getElementById('splitAiPanel');
  if (!thread || !input || !send || !drawer) return;

  const settings = window.MACRODESK_AI_SETTINGS || {};
  const main = window.MACRODESK_CONFIG || {};
  const url = settings.supabaseUrl || main.supabaseUrl;
  const key = settings.supabaseAnonKey || main.supabasePublishableKey;
  const worker = String(settings.workerUrl || '').replace(/\/$/, '');
  const error = message => { if (el('error')) el('error').textContent = message || ''; };

  if (!window.supabase || !url || !key || !worker) {
    error('AI configuration missing. Check ai-settings.js and config.js.');
    return;
  }
  const client = window.supabase.createClient(url, key);
  let history = [];
  let userId = null;
  let expiresAt = null;
  let busy = false;
  let controller = null;
  let generation = 0;
  let writeQueue = Promise.resolve();
  let expiryTimer = null;

  function cleanReply(text) {
    return String(text || '').trim()
      .replace(/^Ready\s*\n+/i, '')
      .replace(/^Here is (?:a |the )?[^\n:]{0,160}:\s*/i, '')
      .trim();
  }

  function showWelcome(message = 'Your private AI conversation is ready.') {
    thread.replaceChildren();
    const welcome = document.createElement('div');
    welcome.className = 'mdai-welcome';
    welcome.textContent = message;
    thread.append(welcome);
  }

  function appendMessage(role, content, copyable = false) {
    thread.querySelector('.mdai-welcome')?.remove();
    const turn = document.createElement('div');
    turn.className = 'mdai-turn ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'mdai-bubble';
    bubble.textContent = content;
    turn.append(bubble);
    if (role === 'assistant' && copyable) {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'mdai-copy';
      copy.title = 'Copy response';
      copy.setAttribute('aria-label', 'Copy response');
      copy.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 2 0 0 0 2 2h2"/></svg>';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(bubble.textContent);
          copy.title = 'Copied!';
          copy.setAttribute('aria-label', 'Copied!');
        } catch { error('Copy failed. Please copy the text manually.'); }
      });
      turn.append(copy);
    }
    thread.append(turn);
    thread.scrollTop = thread.scrollHeight;
    return { turn, bubble };
  }

  function renderHistory() {
    showWelcome();
    for (const item of history) {
      appendMessage(item.role, item.content, item.role === 'assistant');
    }
  }

  function cancelWork() {
    ++generation;
    controller?.abort();
    controller = null;
    busy = false;
    send.disabled = false;
    input.disabled = false;
  }

  function clearLocal() {
    cancelWork();
    clearTimeout(expiryTimer);
    history = [];
    userId = null;
    expiresAt = null;
    input.value = '';
    error('');
    showWelcome();
  }

  function isOpen() { return drawer.classList.contains('open'); }
  function isCurrent(sequence, uid) {
    return generation === sequence && isOpen() && userId === uid;
  }

  function setExpiry(iso) {
    expiresAt = iso;
    clearTimeout(expiryTimer);
    if (!iso) return;
    const ms = Date.parse(iso) - Date.now();
    if (ms <= 0) { clearLocal(); return; }
    // Clear expired content from the visible browser as well as from future reads.
    expiryTimer = setTimeout(() => {
      clearLocal();
      error('Your previous conversation expired after 24 hours. Start a new chat.');
    }, Math.min(ms + 20, 2147483647));
  }

  async function sessionForCurrentUser() {
    const { data, error: authError } = await client.auth.getSession();
    if (authError || !data?.session?.user?.id) throw Error('Please sign in again.');
    return data.session;
  }

  // Serialize all writes and deletions so New Chat cannot be undone by
  // an earlier in-flight save. No messages go into localStorage.
  function enqueueWrite(operation) {
    const next = writeQueue.catch(() => {}).then(operation);
    writeQueue = next.catch(() => {});
    return next;
  }

  async function openChat() {
    clearLocal();
    const sequence = generation;
    showWelcome('Loading your private conversation…');
    try {
      const session = await sessionForCurrentUser();
      if (sequence !== generation || !isOpen()) return;
      const uid = session.user.id;
      userId = uid;
      const { data, error: dbError } = await client
        .from('ai_chats')
        .select('messages,expires_at')
        .eq('user_id', uid)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (dbError) throw dbError;
      if (!isCurrent(sequence, uid)) return;
      history = Array.isArray(data?.messages)
        ? data.messages.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-12)
        : [];
      renderHistory();
      if (data?.expires_at) setExpiry(data.expires_at);
    } catch (e) {
      if (sequence !== generation || !isOpen()) return;
      history = [];
      showWelcome('Could not load your saved conversation.');
      error('Chat storage error: ' + (e.message || 'Please try again.'));
    }
  }

  async function submit() {
    if (busy || !isOpen()) return;
    const message = input.value.trim();
    if (!message) return;
    if (!userId) { error('Please wait for your private chat to load.'); return; }
    if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
      clearLocal();
      error('Chat expired. Close and reopen Ask AI to start a new one.');
      return;
    }
    error('');
    busy = true;
    send.disabled = true;
    input.disabled = true;
    const sequence = ++generation;
    const uid = userId;
    const prior = history.slice(-10);
    const abort = new AbortController();
    controller = abort;
    appendMessage('user', message);
    input.value = '';
    const pending = appendMessage('assistant', 'Thinking…');

    try {
      const session = await sessionForCurrentUser();
      if (!isCurrent(sequence, uid)) return;
      if (session.user.id !== uid) { clearLocal(); return; }
      const response = await fetch(worker, {
        signal: abort.signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          action: 'chat', message, history: prior,
          language: el('language')?.value || 'English',
          tone: el('tone')?.value || 'professional'
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!isCurrent(sequence, uid)) return;
      if (!response.ok) throw Error(data.error || `AI error ${response.status}`);
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw Error('Empty AI response.');
      const reply = cleanReply(data.reply);
      const nextHistory = [...history, { role: 'user', content: message }, { role: 'assistant', content: reply }].slice(-12);

      // Save only after a successful AI response. The server binds the record
      // to auth.uid(), never to a user ID supplied by the browser.
      const result = await enqueueWrite(async () => {
        if (!isCurrent(sequence, uid)) return null;
        const { data: expiry, error: saveError } = await client.rpc(
          'macrodesk_save_ai_chat', { p_messages: nextHistory }
        );
        if (saveError) throw saveError;
        return expiry;
      });
      if (!isCurrent(sequence, uid)) return;
      history = nextHistory;
      pending.turn.remove();
      appendMessage('assistant', reply, true);
      if (result) setExpiry(result);
    } catch (e) {
      if (!isCurrent(sequence, uid) || e.name === 'AbortError') return;
      pending.bubble.textContent = 'Unable to save or generate the reply. Please try again.';
      error(e.message || 'AI request failed.');
    } finally {
      if (isCurrent(sequence, uid)) {
        busy = false;
        controller = null;
        send.disabled = false;
        input.disabled = false;
        input.focus();
      }
    }
  }

  async function newChat() {
    const oldUid = userId;
    clearLocal();
    if (!oldUid) { if (isOpen()) await openChat(); return; }
    showWelcome('Deleting your saved conversation…');
    const sequence = generation;
    try {
      await enqueueWrite(async () => {
        const session = await sessionForCurrentUser();
        if (session.user.id !== oldUid) throw Error('Account changed.');
        const { error: dbError } = await client.from('ai_chats').delete().eq('user_id', oldUid);
        if (dbError) throw dbError;
      });
      if (sequence === generation && isOpen()) await openChat();
    } catch (e) {
      if (sequence !== generation) return;
      showWelcome('Could not delete the saved conversation.');
      error('Delete failed: ' + (e.message || 'Please try again.'));
    }
  }

  document.addEventListener('macrodesk-ai-opened', openChat);
  document.addEventListener('macrodesk-ai-closed', clearLocal);
  document.getElementById('logoutBtn')?.addEventListener('click', clearLocal, { capture: true });
  window.addEventListener('pagehide', clearLocal);
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (userId && session?.user?.id && session.user.id !== userId)) {
      clearLocal();
    }
  });
  send.addEventListener('click', submit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      submit();
    }
  });
  el('new')?.addEventListener('click', newChat);
})();
