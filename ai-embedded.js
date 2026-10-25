/* AI Assistant inside MacroDesk. Uses the same Supabase session as the main app. */
(() => {
  const el = id => document.getElementById('mdai-' + id);
  const config = window.MACRODESK_AI_SETTINGS || {};
  const mainConfig = window.MACRODESK_CONFIG || {};
  const url = config.supabaseUrl || mainConfig.supabaseUrl;
  const key = config.supabaseAnonKey || mainConfig.supabasePublishableKey;
  const worker = config.workerUrl;
  let lastReply = '';
  const error = msg => { el('error').textContent = msg || ''; };
  const status = msg => { el('status').textContent = msg || ''; };
  let client;
  try { if (!window.supabase || !url || !key || !worker) throw new Error('AI settings or Supabase library missing.'); client = window.supabase.createClient(url,key); }
  catch(e) { error(e.message); return; }
  async function generate(action='generate') {
    error('');
    const message = el('message').value.trim();
    if (!message) return error('Paste a client or courier message first.');
    if (action !== 'generate' && !lastReply) return error('Generate a reply first.');
    const btn=el('generate'); btn.disabled=true; status('Generating…');
    try {
      const {data:{session},error:authError} = await client.auth.getSession();
      if (authError || !session) throw new Error('Please sign in to MacroDesk again.');
      const res = await fetch(worker,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({message,language:el('language').value,tone:el('tone').value,action,previousReply:action==='generate'?'':lastReply})});
      const body=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(body.error || 'Worker returned HTTP '+res.status);
      if(typeof body.reply!=='string' || !body.reply.trim()) throw new Error('The AI returned an empty reply. Check your Worker logs.');
      lastReply=body.reply;el('reply').textContent=lastReply;status('Ready');
    } catch(e) {status('');error(e.message || 'Could not reach AI Worker.');}
    finally {btn.disabled=false;}
  }
  // Use existing navigation handler so the AI opens in this page, not a new tab.
  document.getElementById('mdaiQuickLaunch')?.addEventListener('click', () => {
    const aiNav = document.querySelector('.nav-item[data-view="aiView"]');
    if (aiNav) aiNav.click();
  });
  el('generate').addEventListener('click',()=>generate());
  el('shorten').addEventListener('click',()=>generate('shorten'));
  el('polish').addEventListener('click',()=>generate('polish'));
  el('copy').addEventListener('click',async()=>{if(!lastReply)return error('Generate a reply first.');try{await navigator.clipboard.writeText(lastReply);status('Copied!');}catch{error('Copy failed. Please select the response and copy manually.');}});
})();
