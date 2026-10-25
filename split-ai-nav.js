/* Keep sidebar AI navigation within the split-screen search workspace. */
(() => {
  const aiNav = document.querySelector('.nav-item[data-view="aiView"]');
  const quick = document.getElementById('mdaiQuickLaunch');
  const panel = document.getElementById('splitAiPanel');
  function focusAI(e) {
    if (e) { e.preventDefault(); e.stopImmediatePropagation(); }
    document.querySelector('.nav-item[data-view="searchView"]')?.click();
    panel?.scrollIntoView({behavior:'smooth',block:'nearest'});
    document.getElementById('mdai-message')?.focus({preventScroll:true});
  }
  aiNav?.addEventListener('click',focusAI,true);
  quick?.addEventListener('click',focusAI,true);
})();
