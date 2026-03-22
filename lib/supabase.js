require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
/** Primary name + common typo on hosts (Render etc.) */
const serviceRoleKey =
  (process.env.SUPABASE_SERVICE_ROLE_KEY && String(process.env.SUPABASE_SERVICE_ROLE_KEY).trim()) ||
  (process.env.SUPABASE_SERVICE_ROLE && String(process.env.SUPABASE_SERVICE_ROLE).trim()) ||
  '';
const anonKey = process.env.SUPABASE_ANON_KEY;

/** Default client: service role when set (server), else anon. */
const supabase = createClient(supabaseUrl, serviceRoleKey || anonKey);

/**
 * Explicit service-role client for catalogue / recommendations only.
 * When unset, this is null — recommendations should fall back to `supabase` (may hit RLS).
 */
const supabaseAdmin = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

module.exports = { supabase, supabaseAdmin };


