function cleanAIReply(text) {
  return String(text || '').trim()
    .replace(/^Ready\s*\n+/i, '')
    .replace(/^Here is (?:a |the )?(?:professional|polite|friendly|concise|short|ready-to-copy|ready-to-send|suggested|refined|polished|improved|empathetic|clear|courteous|formal|informal|support)[^\n:]{0,160}(?:\s+based on your instructions)?\s*:\s*/i, '')
    .replace(/^\*{1,3}(?=\S)/, '')
    .replace(/\*{1,3}\s*$/, '')
    .trim();
}
/* MacroDesk AI integration. Configure ai-settings.js before deploying. */
const $ = (id) => document.getElementById(id);
let client,
  currentReply = "",
  lastMessage = "";
const settings = window.MACRODESK_AI_SETTINGS || {
  supabaseUrl: "https://mntzjnnzcgncwavgxjtw.supabase.co",
  supabaseAnonKey: "sb_publishable_QOzCqDNQUP7b3-0s4jOTVQ_nQ94t5qn",
  workerUrl: "https://macrodesk-ai.sudarsansharma2020.workers.dev/",
};
const cfg = window.MACRODESK_CONFIG || {};
const supabaseUrl =
  settings.supabaseUrl || cfg.supabaseUrl || cfg.SUPABASE_URL || cfg.url;
const supabaseAnonKey =
  settings.supabaseAnonKey ||
  cfg.supabaseAnonKey ||
  cfg.SUPABASE_ANON_KEY ||
  cfg.anonKey;
const endpoint = settings.workerUrl;
const showError = (text) => ($("error").textContent = text);
async function init() {
  if (!window.supabase || !supabaseUrl || !supabaseAnonKey || !endpoint) {
    $("status").textContent = "Setup required";
    $("auth").classList.remove("hidden");
    $("auth").querySelector("p").textContent =
      "Check ai-settings.js and make sure the Worker URL and Supabase settings are filled in.";
    return;
  }
  client = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) {
    $("status").textContent = "Not signed in";
    $("auth").classList.remove("hidden");
    return;
  }
  $("status").textContent = "Signed in";
  $("app").classList.remove("hidden");
}
async function generate(action = "generate") {
  showError("");
  const message = $("message").value.trim();
  if (!message) {
    showError("Please paste a client message first.");
    return;
  }
  if (action !== "generate" && !currentReply) {
    showError("Generate a reply first.");
    return;
  }
  const btn = $("generate");
  btn.disabled = true;
  btn.textContent = "Generating…";
  try {
    const {
      data: { session },
      error,
    } = await client.auth.getSession();
    if (error || !session) throw new Error("Session expired. Sign in again.");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        message,
        language: $("language").value,
        tone: $("tone").value,
        action,
        previousReply: action === "generate" ? "" : currentReply,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(payload.error || `Request failed (${response.status})`);
    currentReply = cleanAIReply(payload.reply || "");
    lastMessage = message;
    $("reply").textContent = currentReply;
  } catch (e) {
    showError(e.message || "Unable to generate reply.");
  } finally {
    btn.disabled = false;
    btn.textContent = "✦ Generate reply";
  }
}
$("generate").addEventListener("click", () => generate());
$("shorten").addEventListener("click", () => generate("shorten"));
$("polish").addEventListener("click", () => generate("polish"));
$("copy").addEventListener("click", async () => {
  if (!currentReply) return;
  try {
    await navigator.clipboard.writeText(currentReply);
    $("copy").setAttribute("title", "Copied!");
    setTimeout(() => $("copy").setAttribute("title", "Copy response"), 1500);
  } catch {
    showError("Copy failed. Select the reply and copy manually.");
  }
});
init().catch((e) => {
  $("status").textContent = "Initialization error";
  $("auth").classList.remove("hidden");
  $("auth").querySelector("p").textContent = e.message;
});
