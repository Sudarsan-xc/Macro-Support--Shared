function cleanAIReply(text) {
  return String(text || "")
    .trim()
    .replace(/^Ready\s*\n+/i, "")
    .replace(
      /^Here is (?:a |the )?(?:professional|polite|friendly|concise|short|ready-to-copy|ready-to-send|suggested|refined|polished|improved|empathetic|clear|courteous|formal|informal|support)[^\n:]{0,160}(?:\s+based on your instructions)?\s*:\s*/i,
      "",
    )
    .replace(/^\*{1,3}(?=\S)/, "")
    .replace(/\*{1,3}\s*$/, "")
    .trim();
}

(() => {
  const el = (id) => document.getElementById("mdai-" + id);

  const settings = window.MACRODESK_AI_SETTINGS || {};
  const main = window.MACRODESK_CONFIG || {};

  const url = settings.supabaseUrl || main.supabaseUrl;
  const key = settings.supabaseAnonKey || main.supabasePublishableKey;
  const worker = (settings.workerUrl || "").replace(/\/$/, "");

  const thread = el("thread");
  const input = el("message");
  const send = el("generate");

  if (!thread || !input || !send) return;

  let history = [];
  let busy = false;
  let client;
  let activeController = null;
  let requestId = 0;
  let sessionUserId = null;
  let idleTimer = null;

  const drawer = document.getElementById("splitAiPanel");

  const error = (message) => {
    const box = el("error");
    if (box) box.textContent = message || "";
  };

  try {
    if (!window.supabase || !url || !key || !worker) {
      throw Error(
        "AI configuration missing. Check ai-settings.js and config.js.",
      );
    }

    client = window.supabase.createClient(url, key);
  } catch (e) {
    error(e.message);
    return;
  }

  // Display chat messages
  function add(role, content, copying = false) {
    thread.querySelector(".mdai-welcome")?.remove();

    const turn = document.createElement("div");
    turn.className = "mdai-turn " + role;

    const bubble = document.createElement("div");
    bubble.className = "mdai-bubble";

    bubble.textContent = role === "assistant" ? cleanAIReply(content) : content;

    turn.append(bubble);

    if (role === "assistant" && copying) {
      addCopyButton(turn, bubble);
    }

    thread.append(turn);
    thread.scrollTop = thread.scrollHeight;

    return { turn, bubble };
  }

  // Two-overlapping-squares copy button
  function addCopyButton(turn, bubble) {
    const copy = document.createElement("button");

    copy.type = "button";
    copy.className = "mdai-copy";
    copy.title = "Copy response";
    copy.setAttribute("aria-label", "Copy response");

    copy.innerHTML = `
      <svg width="17" height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round">
        <rect x="8" y="8"
          width="12" height="12" rx="2"/>
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>
      </svg>
    `;

    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(bubble.textContent);

        copy.title = "Copied!";
        copy.setAttribute("aria-label", "Copied!");
      } catch {
        error("Copy failed. Please select and copy the reply manually.");
      }
    });

    turn.append(copy);
  }

  // Clear all private conversation data
  function clearPrivateChat() {
    // Invalidate all previously started requests.
    ++requestId;

    // Cancel an unfinished AI request.
    if (activeController) {
      activeController.abort();
    }

    activeController = null;
    history = [];
    sessionUserId = null;
    busy = false;

    send.disabled = false;
    input.disabled = false;
    input.value = "";

    thread.replaceChildren();

    const welcome = document.createElement("div");
    welcome.className = "mdai-welcome";
    welcome.textContent = "Start a new private conversation.";

    thread.append(welcome);

    error("");
  }

  // Clear conversation after inactivity
  function resetIdle() {
    clearTimeout(idleTimer);

    if (drawer?.classList.contains("open")) {
      idleTimer = setTimeout(clearPrivateChat, 5 * 60 * 1000);
    }
  }

  // Submit an AI prompt
  async function submit() {
    if (busy) return;
    if (!drawer?.classList.contains("open")) return;

    const message = input.value.trim();

    if (!message) return;

    error("");

    busy = true;
    send.disabled = true;
    input.disabled = true;

    const prior = history.slice(-10);
    const currentRequest = ++requestId;

    const controller = new AbortController();
    activeController = controller;

    add("user", message);
    input.value = "";

    const pending = add("assistant", "Thinking…");

    resetIdle();

    try {
      // Check the signed-in Supabase agent.
      const {
        data: { session },
        error: authError,
      } = await client.auth.getSession();

      if (currentRequest !== requestId) return;

      if (authError || !session) {
        throw Error("Please sign in to MacroDesk again.");
      }

      // Prevent history crossing user accounts.
      if (sessionUserId && session.user?.id !== sessionUserId) {
        clearPrivateChat();
        return;
      }

      sessionUserId = session.user?.id || null;

      // Send prompt to Cloudflare Worker.
      const response = await fetch(worker, {
        signal: controller.signal,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token,
        },
        body: JSON.stringify({
          message,
          history: prior,
          action: "chat",
          language: el("language")?.value || "English",
          tone: el("tone")?.value || "professional",
        }),
      });

      if (currentRequest !== requestId) return;

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw Error(data.error || `Worker error ${response.status}`);
      }

      if (typeof data.reply !== "string" || !data.reply.trim()) {
        throw Error("The AI returned an empty response.");
      }

      // Reject any reply from a cleared conversation.
      if (currentRequest !== requestId) return;

      if (!drawer?.classList.contains("open")) return;

      pending.bubble.textContent = cleanAIReply(data.reply);

      history.push(
        { role: "user", content: message },
        {
          role: "assistant",
          content: pending.bubble.textContent,
        },
      );

      // Keep only recent messages in temporary memory.
      history = history.slice(-12);

      addCopyButton(pending.turn, pending.bubble);
    } catch (e) {
      if (currentRequest !== requestId) return;

      if (e.name === "AbortError") return;

      pending.bubble.textContent =
        "Sorry, I couldn’t respond. Please try again.";

      error(e.message || "Request failed.");
    } finally {
      if (currentRequest === requestId) {
        activeController = null;
        busy = false;

        send.disabled = false;
        input.disabled = false;

        if (drawer?.classList.contains("open")) {
          input.focus();
          resetIdle();
        }

        thread.scrollTop = thread.scrollHeight;
      }
    }
  }

  // Close popup: delete chat and cancel requests.
  document.addEventListener("macrodesk-ai-closed", () => {
    clearTimeout(idleTimer);
    clearPrivateChat();
  });

  // Open popup: always begin with an empty chat.
  document.addEventListener("macrodesk-ai-opened", () => {
    clearPrivateChat();
    resetIdle();
  });

  // Sign out: delete chat immediately.
  document
    .getElementById("logoutBtn")
    ?.addEventListener("click", clearPrivateChat, { capture: true });

  // Refresh or leave page: clear chat.
  window.addEventListener("pagehide", clearPrivateChat);

  // Handle account changes.
  client.auth.onAuthStateChange((event, session) => {
    if (
      event === "SIGNED_OUT" ||
      event === "USER_UPDATED" ||
      (sessionUserId && session?.user?.id && session.user.id !== sessionUserId)
    ) {
      clearPrivateChat();
    }
  });

  // Track user interaction.
  input.addEventListener("input", resetIdle);

  thread.addEventListener("click", resetIdle);

  // Send button
  send.addEventListener("click", submit);

  // Enter = send
  // Shift + Enter = new line
  input.addEventListener("keydown", (e) => {
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.isComposing &&
      e.keyCode !== 229
    ) {
      e.preventDefault();
      submit();
    }
  });

  // New Chat: delete previous conversation.
  el("new")?.addEventListener("click", () => {
    clearPrivateChat();
    resetIdle();
    input.focus();
  });
})();
