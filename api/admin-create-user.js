// ClaimDesk — Admin: create a worker account (Vercel serverless function)
// Requires these Vercel Environment Variables (Project → Settings → Environment Variables):
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY   <-- from Supabase Dashboard → Settings → API → service_role (SECRET, never expose to browser)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const authHeader = req.headers.authorization || '';
  const callerToken = authHeader.replace('Bearer ', '');
  if (!callerToken) return res.status(401).json({ error: 'Missing auth token' });

  try {
    // 1. Verify the caller's token and get their user id
    const whoRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${callerToken}` }
    });
    const whoData = await whoRes.json();
    if (!whoRes.ok || !whoData.id) return res.status(401).json({ error: 'Invalid session' });

    // 2. Confirm the caller is an admin
    const meRes = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${whoData.id}&select=is_admin`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${callerToken}` }
    });
    const meData = await meRes.json();
    if (!meData?.[0]?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    // 3. Validate the new-account payload
    const { full_name, email, password, role } = req.body || {};
    const allowedRoles = ['linesman', 'finance', 'md'];
    if (!full_name || !email || !password || !allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Missing or invalid fields' });
    }
    if (password.length < 6) return res.status(400).json({ error: 'Password must be 6+ characters' });

    // 4. Create the auth user using the service_role key (admin API)
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password, email_confirm: true })
    });
    const createData = await createRes.json();
    if (!createRes.ok) return res.status(400).json({ error: createData.msg || createData.error_description || 'Could not create auth user' });

    // 5. Insert their row into public.users
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ id: createData.id, email, full_name, role, is_admin: false })
    });
    if (!insertRes.ok) {
      const insertErr = await insertRes.json();
      return res.status(400).json({ error: insertErr.message || 'Auth user created, but adding their profile row failed' });
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
