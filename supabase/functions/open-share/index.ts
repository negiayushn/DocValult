// Supabase Edge Function: opens a share link for people who are NOT signed in.
//
// A share link is just a short code (see migration 0008_share.sql). This function is the only door a stranger
// can use: it checks that the code exists, has not expired or been cancelled, and that the document is not in
// Trash, and then hands out a one-minute signed URL for that one file. Nothing else is reachable.
// The service-role key is used here only to read the share_links row and sign that one URL.
//
// Deploy:  supabase functions deploy open-share
// (Leave JWT verification ON. The app calls this with the public anon key, which is a valid JWT, so visitors
//  who are not signed in still get through. It also keeps random internet traffic off the function.)
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
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const GONE = { error: 'LINK_GONE' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json(req, { error: 'Server is not configured.' }, 500)

  let body: { code?: unknown; action?: unknown } = {}
  try { body = await req.json() } catch { return json(req, GONE, 404) }
  const code = typeof body.code === 'string' ? body.code : ''
  const action = body.action === 'open' || body.action === 'download' ? body.action : 'info'
  if (!/^[A-Za-z0-9]{10}$/.test(code)) return json(req, GONE, 404)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: link, error: linkErr } = await admin
    .from('share_links').select('document_id, expires_at').eq('code', code).maybeSingle()
  if (linkErr) return json(req, { error: 'Something went wrong. Try again.' }, 500)
  if (!link || new Date(link.expires_at).getTime() <= Date.now()) return json(req, GONE, 404)

  const { data: doc, error: docErr } = await admin
    .from('documents').select('file_name, storage_path, mime_type, file_size, deleted_at').eq('id', link.document_id).maybeSingle()
  if (docErr) return json(req, { error: 'Something went wrong. Try again.' }, 500)
  if (!doc || doc.deleted_at) return json(req, GONE, 404)

  if (action === 'info') {
    return json(req, { name: doc.file_name, size: doc.file_size, mime: doc.mime_type, expiresAt: link.expires_at })
  }

  const { data: signed, error: signErr } = await admin.storage
    .from('documents')
    .createSignedUrl(doc.storage_path, 60, action === 'download' ? { download: doc.file_name } : undefined)
  if (signErr || !signed?.signedUrl) return json(req, GONE, 404)
  return json(req, { url: signed.signedUrl })
})
