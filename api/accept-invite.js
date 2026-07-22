// ClaimDesk — finalize an invited account (Vercel serverless function)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const authHeader = req.headers.authorization || '';
  const userToken = authHeader.replace('Bearer ', '');
  const { token, full_name } = req.body || {};
  if (!userToken || !token) return res.status(400).json({ error: 'Missing token' });

  try {
    // Who just signed up / signed in?
    const whoRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${userToken}` }
    });
    const who = await whoRes.json();
    if (!whoRes.ok || !who.id) return res.status(401).json({ error: 'Invalid session' });

    // Load and validate the invite
    const invRes = await fetch(`${SUPABASE_URL}/rest/v1/invites?token=eq.${token}&select=*`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const invRows = await invRes.json();
    const invite = invRows?.[0];

    if (!invite) return res.status(404).json({ error: 'This invite link is not valid.' });
    if (invite.used) return res.status(400).json({ error: 'This invite link has already been used.' });
    if (new Date(invite.expires_at) < new Date()) return res.status(400).json({ error: 'This invite link has expired.' });
    if (invite.email.toLowerCase() !== (who.email || '').toLowerCase()) {
      return res.status(403).json({ error: 'This invite was issued to a different email address.' });
    }

    // Create (or finish) their profile row with the role from the invite
    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ id: who.id, email: who.email, full_name: full_name || who.email, role: invite.role, is_admin: false })
    });
    if (!upsertRes.ok) {
      const err = await upsertRes.json();
      return res.status(400).json({ error: err.message || 'Could not finalize account' });
    }

    // Mark the invite as used so the link can't be reused
    await fetch(`${SUPABASE_URL}/rest/v1/invites?token=eq.${token}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ used: true })
    });

    return res.status(200).json({ success: true, role: invite.role });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
