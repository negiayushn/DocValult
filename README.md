# Personal Vault

A private document vault: React + TypeScript + Vite + Tailwind on the front, Supabase (Auth, Postgres, Storage, RLS) as the only backend. Deploys to Vercel + Supabase.

## Build status

| Phase | Scope | Status |
|---|---|---|
| 1 | Setup, Tailwind, routing, UI kit, Supabase client | Done |
| 2 | Auth, schema, RLS (plus profile, password change, theme in Settings) | Done |
| 3 | Storage, upload, document metadata | Done |
| 4 | Dashboard, file explorer, folders | Done |
| 5 | Search, favorites page, recent, trash, preview | Done |
| 6 | Storage page, avatar, delete account, mobile polish, PWA | Done |
| 7 | Security review, performance, error handling, deploy docs | Done |
| 8 | 6-digit PIN lock (open app, delete, change password) | Done |
| 9 | Share documents (link, WhatsApp, Telegram, email, native share sheet) | Done |

Routes for later phases already exist behind the auth guard and show an empty state. No mock data is used anywhere.

## Setup

1. Create a project at supabase.com.
2. Open SQL Editor and run `supabase/migrations/0001_init.sql` once.
   - **Fastest path for everything else:** paste and run `supabase/catch_up.sql` (it contains 0002 to 0008 and is safe to run again). The app shows an "out of date" banner, and Settings -> Database shows the version, until this has been done.
   - Or run the files one by one: `0002_helpers.sql`, `0003_fix_folder_policies.sql`, `0004_search_v2.sql` and `0005_phase6.sql` `0006_pin.sql` and `0007_pin_strict.sql` and `0008_share.sql` in that order (all are safe to re-run).
3. Authentication -> URL Configuration: set Site URL to your app URL and add `http://localhost:5173/**` (and your Vercel URL) to Redirect URLs. Password-reset links need this.
4. `cp .env.example .env`, then fill in the project URL and publishable (anon) key from Project Settings -> API. Never use the service_role key in this app.
5. `npm install && npm run dev`
6. (Optional, for **Delete account**) deploy the Edge Function, see "Delete account setup" below.

For a personal vault, consider turning off public signups (Authentication -> Providers -> Email) after you create your account.

## Verify phase 1-2

1. Sign up, confirm the email if confirmation is on, sign in.
2. Table Editor -> `profiles`: your row exists with your name.
3. Settings: change your name, change your password, switch theme, sign out.
4. Signed out, open `/settings`: you should land on `/login`.
5. Forgot password: the emailed link opens `/reset-password`.

## Design notes

- Storage object path is `{user_id}/{document_id}/{filename}`. Folder membership lives only in `documents.folder_id`, so moving a document never touches Storage.
- `delete_folder(uuid)` sends every document in the folder and its subfolders to Trash, then removes the folders. Restored documents return to the root.
- Every user-owned table has RLS enabled and forced. Inserts and updates also verify that referenced folders, tags and documents belong to the caller, so a swapped ID cannot attach data to someone else's rows.
- The `documents` bucket is private; files are served through short-lived signed URLs (TTL in `src/lib/config.ts`).
- File size limit and allowed MIME types are enforced in the bucket and must be kept in sync with `src/lib/config.ts`.

## Deploy (Vercel + Supabase)

1. Push the project to a private GitHub repo (`.env` must not be committed).
2. Vercel -> Add New -> Project -> import the repo. Framework: Vite (build `npm run build`, output `dist`).
3. Environment variables (Production, Preview and Development). Either use the names from `.env.example`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

   or connect the Supabase integration, which creates `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; the app accepts those too. Only these public values are ever read by the browser build. Variables like `SUPABASE_SERVICE_ROLE_KEY` are not exposed.
4. **Variables are baked in at build time.** After adding or changing any, redeploy (Deployments -> ... -> Redeploy). Without them the site shows a "needs its Supabase settings" page.
5. Supabase -> Authentication -> URL Configuration: Site URL = your Vercel URL; add `https://your-app.vercel.app/**` (and `http://localhost:5173/**`) to Redirect URLs.
6. Supabase SQL editor: run `supabase/catch_up.sql` (or 0001 then 0002-0008). Check Settings -> Database says version 8.
7. Optional: deploy the `delete-account` function (section above) and turn off public signups.

`vercel.json` (included) rewrites every path to `index.html`, sets a strict Content-Security-Policy and other security headers, and long-caches hashed assets.
The CSP allows `https://*.supabase.co` for API, Storage, images and PDF previews. If you use a custom Supabase domain, add it to `connect-src`, `img-src` and `frame-src` in `vercel.json`.

## Verify phase 3

1. Sign in, click **Upload** (or the + button on mobile), choose 3 files. The panel shows per-file progress.
2. Table Editor -> `documents`: one row per file; `storage_path` starts with your user id.
3. Storage -> `documents` bucket: objects at `{user_id}/{document_id}/{filename}`.
4. Try a `.exe` and a file over 50 MB: rejected with a message, nothing uploaded.
5. Upload the same filename twice: the second is saved as `name (1).ext`.
6. Cancel mid-upload (use a large file): no row, no object.
7. Documents page: Open and Download work via short-lived signed links.

## Verify phase 4

1. Run `0002_helpers.sql`, then `0003_fix_folder_policies.sql` in the SQL editor first. Without 0002 the dashboard and folder counts return 404; without 0003 creating a folder fails with HTTP 500 ("infinite recursion detected in policy").
2. Dashboard: totals match your uploads; storage bar shows the sum of file sizes.
3. Documents -> New folder: create `Education`, open it, create `Certificates` inside it. Breadcrumbs link back.
4. Upload while inside a folder: the file lands in that folder.
5. Row menu: Rename (extension must stay), Move (pick a folder), Favorite, Move to Trash.
6. Select several files (checkboxes, shift-click a range): bulk Move, Trash, Download (max 10).
7. Delete a folder that contains files: the dialog states how many documents go to Trash. In `documents` those rows now have `deleted_at` set.
8. Try creating two sibling folders with the same name, and moving a folder into its own subfolder: both show friendly errors.
9. Grid view shows image thumbnails; the view choice persists after reload.

Trash/restore screens arrive in phase 5. Until then, restore a trashed file by clearing `deleted_at` in the Table Editor.

## Verify phase 5

Run `0004_search_v2.sql` first (it replaces the search function from 0002).

1. Header search: type `marksheet`. Results appear about 300 ms after you stop typing. Every word must match, in any order, against the file name, description, file type (`pdf`, `image`...), tags, or the name of the folder or any parent folder. So `college marksheet` and `education degree` both work. `%` and `_` match literally.
   - If you see "The database is missing an update", a migration hasn't been run yet.
2. Click a document: it opens `/documents/:id` with a PDF/image preview, details, tags and an editable description (saved when you click away).
3. Open a `.zip` or `.docx`: "Preview unavailable" plus a Download button.
4. Star a document: it appears on **Favorites**. **Recent** groups by Today / Yesterday / Earlier.
5. Move a document to Trash: it leaves the library. On **Trash**, Restore returns it to its folder (or the top level if that folder was deleted; a clashing name gets `(1)`).
6. **Delete forever** removes the row and the file in Storage (check the bucket). **Empty Trash** shows progress.
7. Paste another user's document id into `/documents/<id>`: "Document not found".
8. Leave a preview open for about 4.5 minutes: a "link is about to expire" bar offers Refresh.

## Delete account setup (Edge Function)

Deleting an auth user needs the service-role key, which must never be in the browser. It lives only in the `delete-account` Edge Function (`supabase/functions/delete-account/index.ts`). Supabase injects the key into Edge Functions itself; you never copy it anywhere.

```bash
npm i -g supabase            # or: npx supabase ...
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy delete-account
# Optional: only allow your own site to call it (comma-separated):
supabase secrets set ALLOWED_ORIGINS=https://your-app.vercel.app,http://localhost:5173
```

Leave "Verify JWT" ON (the default). The function reads the user id from the verified token, removes every object under `{user_id}/` in both buckets, then deletes the auth user. Foreign keys cascade to profiles, folders, documents, tags and document_tags. Until it is deployed, the button shows "Account deletion is not set up yet".

## Verify phase 6

Run `0005_phase6.sql` (or `catch_up.sql`) first. Settings -> Database should read "Up to date (version 5)".

1. **Storage** (sidebar): total used, a bar by file type, Trash size with a link, the 10 largest files (click one to open it), and the upload limits.
2. **Settings -> Profile**: Add picture. PNG/JPG/WebP up to 2 MB; a GIF or a 3 MB image is rejected with a message. After upload the picture appears in the header. In Storage -> `avatars` the object is at `{user_id}/avatar-<time>.<ext>`; changing the picture removes the old object. Remove clears it.
3. **Delete account**: create a throw-away account first. Upload a file, open Settings -> Delete my account, enter the password and type DELETE. You land on the login page; the user, its rows and its objects in both buckets are gone.
4. **Mobile**: open the deployed site on a phone (or Chrome DevTools at 375 px). Nothing scrolls sideways, the + button sits above the bottom bar, row menus are easy to tap.
5. **Install**: on the deployed (HTTPS) site, Chrome/Edge show an install icon; Settings -> Install app also works. On iPhone: Share -> Add to Home Screen.
6. **Offline**: with the site installed or open, turn on airplane mode and reload. The app shell opens with "You're offline" at the top. Documents are not available offline by design.

## PIN lock (phase 8)

Run `0006_pin.sql` and `0007_pin_strict.sql` (or just `catch_up.sql`), and redeploy the `delete-account` Edge Function (it now checks the PIN). Settings -> Database should read version 7.

Set it up in Settings -> PIN lock. After that:

- Opening the app (after sign-in) shows a lock screen until the PIN is entered. Auto-lock is configurable (never-while-active windows of 1 to 60 minutes, or lock when the tab is hidden). The Lock button in the header locks immediately.
- Move to Trash and change password ask for the PIN unless you entered it in the last 5 minutes.
- Delete forever, Empty Trash, Delete folder and Delete account always ask (a PIN entered in the last 30 seconds counts, so you are not asked twice in a row).
- Lock now (and auto-lock) ends both windows, on the server too.
- 5 wrong tries in a row lock PIN entry for 15 minutes. Weak PINs (111111, 123456) are refused.
- Forgot PIN: on the lock screen, enter your account password; this removes the PIN and you can set a new one.

How strong is it? Be honest about the limits:

- The lock screen is a **UI lock**. It protects a device you left unlocked, not someone who has your password and uses the API directly.
- Trash, delete forever, delete folder, storage file removal and account deletion are **enforced in the database** (PIN_REQUIRED), so they cannot be done without a recent PIN even from outside the app.
- Changing the password is gated in the app only; Supabase Auth cannot be gated from SQL.
- Password-based PIN reset relies on the sign-in method in the Supabase session token. Test it once on your real project.

Tests: `supabase/tests/pin_audit.sql` (76 checks, local or scratch database only).

## Sharing (phase 9)

Run `0008_share.sql` (or `catch_up.sql`) and deploy the `open-share` Edge Function (see below). Settings -> Database should read version 8.

Open a document's menu (or its page) and choose **Share**. If a PIN is set, it is asked before the dialog opens.

- **Create link**: pick how long it works (1 hour, 1 day or 7 days). You get a short link like `https://your-site/s/AbC123xYz9`. Copy it, or send it with the WhatsApp, Telegram or Email buttons. For Discord, Slack, Instagram and others, copy the link and paste it into the chat.
- **Cancel a link** any time from the same dialog. It stops working immediately.
- **Send the file itself**: on phones and browsers that support it, opens the system share sheet with the real file attached (up to 50 MB). The file is fetched when the dialog opens, because browsers only allow the share sheet straight after a tap.

How it works:

- A share link is a random 10-character code stored in `share_links` (only you can see your rows). Anyone opening `/s/<code>` gets a small page with **Open** and **Download**; no sign-in. The page asks the `open-share` Edge Function, which checks the code has not expired or been cancelled and the file is not in Trash, then signs a **one-minute** URL for that one file.
- Visitors and anonymous users get no direct access to your database or storage. Only the Edge Function (with the service-role key, server side) can read the code.
- Deleting a document, or moving it to Trash, makes its links stop working. At most 100 active links per account.
- Creating a link needs a recent PIN (enforced in the database, like Trash).

Deploy the function:

```
supabase functions deploy open-share
```

Or in the dashboard: Edge Functions -> Deploy a new function -> name it `open-share`, paste `supabase/functions/open-share/index.ts`. Leave "Verify JWT" on: the app calls it with the public anon key, which is a valid token. No secrets to add; `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

Honest limits: anyone who has a link can open that one file until it expires or you cancel it, and people can forward it. Cancelling stops new opens; someone who already downloaded the file keeps their copy.

## PWA notes

- `public/sw.js` caches only the static shell (HTML, JS, CSS, icons). Supabase requests, signed URLs and documents are cross-origin and are never cached.
- It registers in production builds only (`npm run build && npm run preview` to try it). After a deploy, the new version is picked up on the next page load.
- Icons are in `public/` (`icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`).

## Security checks (phase 7)

- `supabase/tests/production_check.sql`: **read-only**, safe on your real project. Run it in the SQL editor; every row must say PASS (RLS enabled and forced, buckets private, storage policies present, no anonymous access, functions pinned, schema version).
- `supabase/tests/security_audit.sql`: a two-user attack simulation (141 checks: reading, editing, deleting, forging ids, moving into another user's folder, tagging another user's file, storage prefixes, anonymous access, RPC isolation). **Run it only on a local or scratch database** (for example `supabase start`), never on production. Last line must read `0 FAILED`.
- App-level checks to do by hand with two accounts (A and B):
  1. A uploads a file. Signed in as B, paste `/documents/<A's document id>`: "Document not found".
  2. Copy a signed URL from A, wait 5 minutes: it stops working. A signed-out browser can't open it either.
  3. In the browser dev tools Network tab, no request carries a service-role key; search the built JS for `service_role`: nothing.
  4. In Supabase Table Editor, every table shows RLS enabled.
  5. B cannot see A's folders, tags, search results, storage totals or avatar.
  6. Wrong file types and files over 50 MB are rejected in the app and by the bucket.
  7. Sign out, press Back: you stay on the login page.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "needs its Supabase settings" page | Env vars missing in this build. Add them in Vercel and redeploy. |
| Page refresh gives 404 on Vercel | `vercel.json` missing from the repo root. |
| Email links go to localhost | Supabase Site URL / Redirect URLs not set to your Vercel URL. |
| "database is missing an update" or "out of date" banner | Run `supabase/catch_up.sql`. |
| Folder creation fails with HTTP 500 | Migration 0003 not applied. |
| Preview or images blank on the live site only | CSP blocks your Supabase domain; see the note above. |
| Delete account says "not set up yet" | Deploy the `delete-account` Edge Function. |
| Old version still showing after deploy | Close all tabs of the site once; the service worker updates on the next load. |

## Performance notes

- Routes are lazy-loaded; vendor code (React, Supabase, TanStack Query) is split into separate cached chunks, so app updates re-download about 60 KB instead of the whole bundle.
- Lists load 30 at a time (infinite query); thumbnails are lazy; signed URLs are created on demand, not in bulk.
- Server work uses indexed queries and single-round-trip RPCs (dashboard, folder counts, search, storage breakdown).
