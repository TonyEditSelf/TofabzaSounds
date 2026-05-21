import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const ALLOWED_EMAIL = process.env.OPERATOR_EMAIL;

/**
 * Call at the top of every API route handler.
 * Throws a 403 Response if session is missing or wrong email.
 * @returns {Promise<import('@supabase/supabase-js').Session>}
 */
export async function requireOperator() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session || session.user.email !== ALLOWED_EMAIL) {
    throw new Response(
      JSON.stringify({
        error: { code: "FORBIDDEN", message: "Access denied." },
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  return session;
}
