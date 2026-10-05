// Supabase Edge Function: permanently deletes the signed-in user's account and all of their data.
//
// This is the ONLY place the service-role key is used. It never reaches the browser:
// Supabase injects SUPABASE_SERVICE_ROLE_KEY into Edge Functions as a secret.
//
// Deploy:  supabase functions deploy delete-account
// (JWT verification stays ON, so only signed-in users can call it. The user id is taken from
//  the verified token, never from the request body, so nobody can delete someone else.)
import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim())

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allow = ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })

// deno-lint-ignore no-explicit-any
type Admin = any

/** Recursively lists every object under `prefix` (folders have a null id). */
async function listAll(admin: Admin, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string) => {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 100, offset })
      if (error) throw error
      if (!data || data.length === 0) break
      for (const e of data) {
        if (e.id === null) await walk(`${dir}/${e.name}`)
        else out.push(`${dir}/${e.name}`)
      }
      if (data.length < 100) break
    }
  }
  await walk(prefix)
  return out
}

async function removeAll(admin: Admin, bucket: string, uid: string) {
  const paths = await listAll(admin, bucket, uid)
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100))
    if (error) throw error
  }
  return paths.length
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !serviceKey || !anonKey) return json(req, { error: 'Server is not configured.' }, 500)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json(req, { error: 'Not signed in.' }, 401)

  // Who is calling? Ask Auth to verify the token. Never trust an id sent by the client.
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userErr } = await asUser.auth.getUser()
  if (userErr || !userData.user) return json(req, { error: 'Your session has expired. Sign in again.' }, 401)
  const uid = userData.user.id

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    // 1. Storage objects first (the API is the only supported way to delete them).
    await removeAll(admin, 'documents', uid)
    await removeAll(admin, 'avatars', uid)
    // 2. Then the auth user. Foreign keys cascade to profiles, folders, documents, tags, document_tags.
    const { error } = await admin.auth.admin.deleteUser(uid)
    if (error) throw error
    return json(req, { ok: true })
  } catch (e) {
    console.error('delete-account failed', uid, e)
    return json(req, { error: 'Could not delete the account. Nothing was lost that you cannot retry. Try again.' }, 500)
  }
})
