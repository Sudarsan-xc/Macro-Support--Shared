/* MacroDesk Ask AI drawer: lazy-load, hide on close, cancel in-flight work. */
(() => {
  const drawer = document.getElementById('splitAiPanel');
  const overlay = document.getElementById('mdaiOverlay');
  const launch = document.getElementById('mdaiQuickLaunch');
  const closeButton = document.getElementById('mdai-close');
  if (!drawer || !overlay || !launch) return;

  let previousFocus = null;
  let loadPromise = null;
  let openSequence = 0;

  function loadAI() {
    if (!loadPromise) {
      loadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'ai-embedded.js';
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Could not load AI chat script.'));
        document.body.appendChild(script);
      }).catch(err => {
        loadPromise = null;
        const box = document.getElementById('mdai-error');
        if (box) box.textContent = err.message;
        throw err;
      });
    }
    return loadPromise;
  }

  async function open() {
    if (drawer.classList.contains('open')) return;
    const sequence = ++openSequence;
    previousFocus = document.activeElement;
    drawer.removeAttribute('inert');
    drawer.classList.add('open');
    overlay.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mdai-drawer-open');
    try {
      await loadAI();
      if (sequence !== openSequence || !drawer.classList.contains('open')) return;
      document.dispatchEvent(new Event('macrodesk-ai-opened'));
      document.getElementById('mdai-message')?.focus();
    } catch { /* Error already shown in the drawer. */ }
  }

  function close() {
    if (!drawer.classList.contains('open')) return;
    ++openSequence;
    document.dispatchEvent(new Event('macrodesk-ai-closed'));
    drawer.classList.remove('open');
    drawer.setAttribute('inert', '');
    overlay.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mdai-drawer-open');
    previousFocus?.focus?.();
  }

  launch.addEventListener('click', open);
  closeButton?.addEventListener('click', close);
  overlay.addEventListener('click', close);
  document.getElementById('logoutBtn')?.addEventListener('click', close, { capture: true });
  window.addEventListener('pagehide', close);
  document.addEventListener('keydown', e => {
    if (!drawer.classList.contains('open')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const controls = [...drawer.querySelectorAll('button:not([disabled]),textarea:not([disabled]),select:not([disabled]),input:not([disabled])')]
      .filter(x => x.getClientRects().length);
    if (!controls.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
})();
