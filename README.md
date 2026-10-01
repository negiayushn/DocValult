# Personal Vault

A private document vault: React + TypeScript + Vite + Tailwind on the front, Supabase (Auth, Postgres, Storage, RLS) as the only backend. Deploys to Vercel + Supabase.

## Build status

| Phase | Scope | Status |
|---|---|---|
| 1 | Setup, Tailwind, routing, UI kit, Supabase client | Done |
| 2 | Auth, schema, RLS (plus profile, password change, theme in Settings) | Done |
| 3 | Storage, upload, document metadata | Next |
| 4-7 | Dashboard/explorer/folders, search/favorites/trash/preview, mobile+PWA, security review + deploy | Planned |

Routes for later phases already exist behind the auth guard and show an empty state. No mock data is used anywhere.

## Setup

1. Create a project at supabase.com.
2. Open SQL Editor and run `supabase/migrations/0001_init.sql` once.
3. Authentication -> URL Configuration: set Site URL to your app URL and add `http://localhost:5173/**` (and your Vercel URL) to Redirect URLs. Password-reset links need this.
4. `cp .env.example .env`, then fill in the project URL and publishable (anon) key from Project Settings -> API. Never use the service_role key in this app.
5. `npm install && npm run dev`

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
