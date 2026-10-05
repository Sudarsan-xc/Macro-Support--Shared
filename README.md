# MacroDesk — Shared Courier Support Macro Console

This version uses **Supabase** as the shared cloud database. All signed-in agents use the same macro library.

## Files

- `index.html` — website
- `style.css` — design
- `script.js` — search, add, update, delete, import/export, login and live sync
- `config.js` — your Supabase Project URL + publishable key
- `supabase.sql` — creates the shared database table, security policies, seed macros and live updates
- `macros.json` — original 11 MacroDesk examples

## Setup

### 1. Create a Supabase project

Create a project at https://supabase.com/

### 2. Create the database

Open **SQL Editor** in Supabase, paste all of `supabase.sql`, and run it.

The script creates the `public.macros` table, enables Row Level Security, gives signed-in agents shared CRUD access, seeds the 11 original macros, and enables realtime updates.

### 3. Add agent accounts

In Supabase, open **Authentication → Users** and create an email/password user for each agent.

The website uses sign-in, so people without an agent account cannot access the macro library.

### 4. Configure the website

Open `config.js` and replace:

```js
supabaseUrl: "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE",
supabasePublishableKey: "PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE"
```

with your Supabase **Project URL** and **Publishable key**.

Do NOT use a `service_role` or secret key in `config.js`.

### 5. Upload the updated files to GitHub

Upload/replace:

- `index.html`
- `style.css`
- `script.js`
- `config.js`
- `supabase.sql`
- `macros.json`
- `README.md`

GitHub Pages can continue using:

**Branch:** `main`  
**Folder:** `/(root)`

## How it works

When Agent A adds, edits, or deletes a macro, the change is stored in Supabase. Other signed-in agents receive the update automatically through Supabase Realtime, so they do not need to manually copy the macro or edit GitHub.

## Security

The browser uses only the Supabase publishable key. Row Level Security allows CRUD only to authenticated users. Never place a Supabase service-role/secret key in the website.
