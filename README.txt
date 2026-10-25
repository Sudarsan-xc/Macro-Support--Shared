MacroDesk screen-compatible update

Updated the previous split-screen version to adapt across desktop monitors, laptops, tablets and narrow browser windows.
- Wide screens (1400px+): macro library and AI chat side-by-side.
- Laptop widths (1001-1399px): full-width macro library, followed by a full-width AI chat panel. This prevents squeezed macro cards.
- Narrow widths (<=1000px): existing collapsible navigation; stacked library and AI panel.
- Search and Ask AI remain aligned, and chat responses remain scrollable/copyable.

Upload index.html, style.css, ai-embedded.js, mobile-nav.js and split-ai-nav.js to the SAME directory as existing config.js, script.js and ai-settings.js. Do not delete those existing files.

This package changes layout only. Cloudflare Worker does not need redeployment. Verify the Gemini endpoint separately.
