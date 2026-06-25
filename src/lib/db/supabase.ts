import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Read-only client for public pages (respects RLS). */
export function publicClient() {
  return createClient(url, anon, { auth: { persistSession: false } });
}

/** Service-role client for writes (bypasses RLS). Server-only. */
export function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}
