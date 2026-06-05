import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function getDatabaseUrl(tenantId = null) {
  // Future: return different URLs based on tenantId
  // e.g. if tenant is AU-based, return Australia DB URL
  // For now, everyone uses the same DB
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

/** Session-aware client for Route Handlers + Server Components */
export async function getServerClient(tenantId = null) {
  const { url, anonKey } = getDatabaseUrl(tenantId);
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) =>
        toSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        ),
    },
  });
}

/** Service-role client — bypasses RLS. API routes only */
export function getAdminClient(tenantId = null) {
  const { url, serviceKey } = getDatabaseUrl(tenantId);
  return createClient(url, serviceKey);
}
