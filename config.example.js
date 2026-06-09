/* ============================================================
   ClaimDesk — LOCAL config template
   ------------------------------------------------------------
   This file is committed to the repo as a TEMPLATE only.

   • For LOCAL use (double-click index.html or Live Server):
       1. Copy this file to "config.js" (same folder)
       2. Paste your Supabase URL + anon key into it
       3. config.js is gitignored, so your keys stay off GitHub

   • In PRODUCTION (Vercel): you do NOT need config.js at all.
     The app fetches /api/config, which reads the keys from
     Vercel Environment Variables. See SETUP-GUIDE / DEPLOY-GUIDE.
   ============================================================ */
window.CLAIMDESK_CONFIG = {
  SUPABASE_URL: "",       // e.g. "https://abcdefgh.supabase.co"
  SUPABASE_ANON_KEY: "",  // your anon public key (eyJ...)
  SCANS_BUCKET: "claimdesk-scans",
};
