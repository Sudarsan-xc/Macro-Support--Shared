# MacroDesk AI — integrated edition

Upload the contents of this folder to the root of your existing GitHub Pages repository, replacing the matching files. **Do not delete your existing database or Supabase configuration.**

## Changes
- New AI Assistant navigation button below Manage macros.
- AI chatbot embedded in index.html as a third view; no page change.
- ai-embedded.js sends authenticated requests to your existing Cloudflare Worker.
- ai-settings.js repaired (the original uploaded file had a JavaScript syntax error).
- Existing macro search, management, login and real-time sync logic remain in place.

## Before testing
1. Confirm `ai-settings.js` contains the actual Worker URL and public Supabase credentials.
2. Cloudflare Worker must have `GEMINI_API_KEY`, expected Supabase authentication configuration, allowed origin `https://sudarsan-xc.github.io`, and a supported Gemini model.
3. Confirm the Worker accepts POST at the URL in `ai-settings.js` and responds with JSON `{ "reply": "..." }`.
4. Upload and commit; wait for GitHub Pages deployment. Sign in and click AI Assistant.
5. If an error appears, open browser developer tools → Network and Cloudflare Worker logs (`npx.cmd wrangler tail`).

The separate ai.html, ai.css and ai.js are retained for backward compatibility, but the new sidebar button uses the embedded view. No second page is opened.

Never paste client private data into third-party AI without organizational approval. The Gemini free tier has usage and data-handling limitations.
