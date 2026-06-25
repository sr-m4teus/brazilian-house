import { createBrowserClient } from "@supabase/ssr";

/** Browser supabase client (stores session in cookies for SSR middleware). */
export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
