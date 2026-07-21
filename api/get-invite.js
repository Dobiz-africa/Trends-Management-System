// ClaimDesk — look up an invite by token (Vercel serverless function)
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Missing token' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/invites?token=eq.${token}&select=email,role,used,expires_at`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const rows = await r.json();
    const invite = rows?.[0];

    if (!invite) return res.status(404).json({ error: 'This invite link is not valid.' });
    if (invite.used) return res.status(400).json({ error: 'This invite link has already been used.' });
    if (new Date(invite.expires_at) < new Date()) return res.status(400).json({ error: 'This invite link has expired.' });

    return res.status(200).json({ email: invite.email, role: invite.role });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
