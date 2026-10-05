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
| 7 | Security review, performance, deploy | Next |

Routes for later phases already exist behind the auth guard and show an empty state. No mock data is used anywhere.

## Setup

1. Create a project at supabase.com.
2. Open SQL Editor and run `supabase/migrations/0001_init.sql` once.
   - **Fastest path for everything else:** paste and run `supabase/catch_up.sql` (it contains 0002 to 0005 and is safe to run again). The app shows an "out of date" banner, and Settings -> Database shows the version, until this has been done.
   - Or run the files one by one: `0002_helpers.sql`, `0003_fix_folder_policies.sql`, `0004_search_v2.sql` and `0005_phase6.sql` in that order (all are safe to re-run).
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

## Deploy (Vercel)

Import the repo, framework preset Vite, add the two `VITE_` env vars, deploy. Add `vercel.json` with a rewrite of all paths to `/index.html` for client-side routing (added in phase 7).

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

## PWA notes

- `public/sw.js` caches only the static shell (HTML, JS, CSS, icons). Supabase requests, signed URLs and documents are cross-origin and are never cached.
- It registers in production builds only (`npm run build && npm run preview` to try it). After a deploy, the new version is picked up on the next page load.
- Icons are in `public/` (`icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`).
