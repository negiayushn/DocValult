/** Shown instead of a blank page when the Supabase settings are missing from the build. */
export function SetupNeeded() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f6fb] px-6 py-10 text-[#0d1a36]" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div className="w-full max-w-lg rounded-xl border border-[#dfe5f0] bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">Personal Vault needs its Supabase settings</h1>
        <p className="mt-2 text-sm text-[#5a6784]">This build has no Supabase URL or key, so it can't connect. Add them, then <strong>redeploy</strong> (settings are baked in at build time).</p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
          <li><strong>Vercel:</strong> Project → Settings → Environment Variables. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (Supabase → Project Settings → API), for Production, Preview and Development. Then Deployments → ⋯ → Redeploy.</li>
          <li><strong>Locally:</strong> copy <code>.env.example</code> to <code>.env</code>, fill it in, restart <code>npm run dev</code>.</li>
        </ul>
        <p className="mt-4 text-xs text-[#5a6784]">Never use the service_role key here. Only the publishable (anon) key belongs in the app.</p>
      </div>
    </main>
  )
}
