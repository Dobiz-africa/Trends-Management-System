// ClaimDesk — config endpoint (Vercel serverless function)
// Serves the Supabase config to the browser from Vercel Environment
// Variables, so the keys never live in the GitHub repo.
//
// The anon key is a public client key by design; this pattern keeps it
// out of source control and lets you change projects without editing code.
//
// Set these in Vercel → Project → Settings → Environment Variables:
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SCANS_BUCKET   (optional, defaults to "claimdesk-scans")

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    SCANS_BUCKET: process.env.SCANS_BUCKET || 'claimdesk-scans',
    API_ROUTES_ENABLED: true,
    EMAIL_ROUTES_ENABLED: true,
  });
}
