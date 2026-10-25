// MacroDesk AI Drawer
// Opens only when Ask AI is clicked.
// Closing the drawer clears private chat.

(() => {
  const drawer = document.getElementById("splitAiPanel");

  const overlay = document.getElementById("mdaiOverlay");

  const launch = document.getElementById("mdaiQuickLaunch");

  const closeButton = document.getElementById("mdai-close");

  if (!drawer || !overlay) return;

  let previousFocus = null;
  let aiLoadPromise = null;
  let openingToken = 0;

  // Load AI code only when first needed.
  function loadAI() {
    if (!aiLoadPromise) {
      aiLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");

        script.src = "ai-embedded.js";
        script.async = true;

        script.onload = resolve;

        script.onerror = () => {
          reject(new Error("Could not load AI chat script."));
        };

        document.body.appendChild(script);
      }).catch((err) => {
        aiLoadPromise = null;

        const box = document.getElementById("mdai-error");

        if (box) box.textContent = err.message;
      });
    }

    return aiLoadPromise;
  }

  // Open only when the Ask AI button is clicked.
  function open() {
    if (drawer.classList.contains("open")) {
      return;
    }

    const token = ++openingToken;

    previousFocus = document.activeElement;

    drawer.removeAttribute("inert");
    drawer.classList.add("open");

    overlay.classList.add("open");

    drawer.setAttribute("aria-hidden", "false");

    document.body.classList.add("mdai-drawer-open");

    loadAI().then(() => {
      if (token !== openingToken || !drawer.classList.contains("open")) {
        return;
      }

      document.dispatchEvent(new Event("macrodesk-ai-opened"));

      document.getElementById("mdai-message")?.focus();
    });
  }

  // Close popup and immediately clear the chat.
  function close() {
    if (!drawer.classList.contains("open")) {
      return;
    }

    // Prevent delayed initialization after closing.
    ++openingToken;

    // ai-embedded.js listens for this event.
    // It clears messages and aborts pending requests.
    document.dispatchEvent(new Event("macrodesk-ai-closed"));

    drawer.classList.remove("open");
    drawer.setAttribute("inert", "");

    overlay.classList.remove("open");

    drawer.setAttribute("aria-hidden", "true");

    document.body.classList.remove("mdai-drawer-open");

    previousFocus?.focus?.();
  }

  // Only Ask AI opens the popup.
  launch?.addEventListener("click", open);

  // Close button
  closeButton?.addEventListener("click", close);

  // Click outside the drawer
  overlay.addEventListener("click", close);

  // Sign out closes and clears the popup.
  document
    .getElementById("logoutBtn")
    ?.addEventListener("click", close, { capture: true });

  // Close when leaving the page.
  window.addEventListener("pagehide", close);

  // Escape closes the popup.
  // Tab keeps keyboard focus inside the drawer.
  document.addEventListener("keydown", (e) => {
    if (!drawer.classList.contains("open")) {
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }

    if (e.key !== "Tab") return;

    const items = [
      ...drawer.querySelectorAll(
        "button:not([disabled])," +
          "textarea:not([disabled])," +
          "select:not([disabled])," +
          "input:not([disabled])",
      ),
    ].filter((item) => item.getClientRects().length);

    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
})();
