function cleanAIReply(text) {
  return String(text || '').trim()
    .replace(/^Ready\s*\n+/i, '')
    .replace(/^Here is (?:a |the )?(?:professional|polite|friendly|concise|short|ready-to-copy|ready-to-send|suggested|refined|polished|improved|empathetic|clear|courteous|formal|informal|support)[^\n:]{0,160}(?:\s+based on your instructions)?\s*:\s*/i, '')
    .replace(/^\*{1,3}(?=\S)/, '')
    .replace(/\*{1,3}\s*$/, '')
    .trim();
}
/* MacroDesk AI popup: Enter sends, Shift+Enter adds newline. */
(() => {
  const el = id => document.getElementById('mdai-' + id);
  const settings = window.MACRODESK_AI_SETTINGS || {};
  const main = window.MACRODESK_CONFIG || {};
  const url = settings.supabaseUrl || main.supabaseUrl;
  const key = settings.supabaseAnonKey || main.supabasePublishableKey;
  const worker = (settings.workerUrl || '').replace(/\/$/, '');
  const thread = el('thread'), input = el('message'), send = el('generate');
  if (!thread || !input || !send) return;
  let history = [], busy = false, client;
  const error = message => { el('error').textContent = message || ''; };
  try {
    if (!window.supabase || !url || !key || !worker) throw Error('AI configuration missing. Check ai-settings.js.');
    client = window.supabase.createClient(url, key);
  } catch (e) { error(e.message); return; }

  function add(role, content, copying = false) {
    thread.querySelector('.mdai-welcome')?.remove();
    const turn = document.createElement('div');
    turn.className = 'mdai-turn ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'mdai-bubble'; bubble.textContent = role === 'assistant' ? cleanAIReply(content) : content;
    turn.append(bubble);
    if (role === 'assistant' && copying) {
      const copy = document.createElement('button');
      copy.type = 'button'; copy.className = 'mdai-copy'; copy.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>'; copy.title = 'Copy response'; copy.setAttribute('aria-label', 'Copy response');
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(bubble.textContent); copy.title = 'Copied!'; copy.setAttribute('aria-label', 'Copied!'); }
        catch { error('Copy failed. Please select and copy the reply manually.'); }
      });
      turn.append(copy);
    }
    thread.append(turn); thread.scrollTop = thread.scrollHeight;
    return {turn, bubble};
  }

  async function submit() {
    if (busy) return;
    const message = input.value.trim();
    if (!message) return;
    error(''); busy = true; send.disabled = true; input.disabled = true;
    const prior = history.slice(-10);
    add('user', message); input.value = '';
    const pending = add('assistant', 'Thinking…');
    try {
      const {data:{session}, error:authError} = await client.auth.getSession();
      if (authError || !session) throw Error('Please sign in to MacroDesk again.');
      const response = await fetch(worker, {
        method: 'POST',
        headers: {'Content-Type':'application/json', 'Authorization':'Bearer ' + session.access_token},
        body: JSON.stringify({message, history: prior, action:'chat'})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(data.error || `Worker error ${response.status}`);
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw Error('The AI returned an empty response.');
      pending.bubble.textContent = cleanAIReply(data.reply);
      history.push({role:'user',content:message}, {role:'assistant',content:pending.bubble.textContent});
      history = history.slice(-12);
      const copy = document.createElement('button');
      copy.type = 'button'; copy.className = 'mdai-copy'; copy.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>'; copy.title = 'Copy response'; copy.setAttribute('aria-label', 'Copy response');
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(pending.bubble.textContent); copy.title = 'Copied!'; copy.setAttribute('aria-label', 'Copied!'); }
        catch { error('Copy failed. Please select and copy the reply manually.'); }
      });
      pending.turn.append(copy);
    } catch (e) {
      pending.bubble.textContent = 'Sorry, I couldn’t respond. Please try again.';
      error(e.message || 'Request failed.');
    } finally {
      busy = false; send.disabled = false; input.disabled = false;
      input.focus(); thread.scrollTop = thread.scrollHeight;
    }
  }
  send.addEventListener('click', submit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      submit();
    }
    // Shift + Enter is intentionally left to the textarea's native newline behavior.
  });
  el('new')?.addEventListener('click', () => {
    if (busy) return;
    history = [];
    thread.innerHTML = '<div class="mdai-welcome"><strong>How can I help you today?</strong><p>Start a new conversation by typing a prompt below.</p></div>';
    input.value = ''; error(''); input.focus();
  });
})();
