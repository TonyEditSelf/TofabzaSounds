import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-only Supabase client using anon key.
 * Use this in Client Components only.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
