/* Mobile navigation. Existing MacroDesk and AI scripts are unchanged. */
(() => {
  const menu = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('macroSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!menu || !sidebar || !overlay) return;
  const setOpen = (open) => {
    sidebar.classList.toggle('mobile-open', open);
    overlay.classList.toggle('mobile-open', open);
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    overlay.setAttribute('aria-hidden', String(!open));
    if (open) sidebar.querySelector('.nav-item')?.focus();
    else if (sidebar.contains(document.activeElement)) menu.focus();
  };
  menu.addEventListener('click', () => setOpen(!sidebar.classList.contains('mobile-open')));
  overlay.addEventListener('click', () => setOpen(false));
  sidebar.addEventListener('click', (event) => {
    if (event.target.closest('.nav-item, .cat-btn')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar.classList.contains('mobile-open')) setOpen(false);
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1000 && sidebar.classList.contains('mobile-open')) setOpen(false);
  });
})();
