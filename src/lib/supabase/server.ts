import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { clientEnv } from "@/lib/env";

/**
 * A request-scoped Supabase client that reads the user's session from
 * cookies and respects row-level security — the handle route handlers and
 * server components use to act *as the signed-in analyst* (spec §08
 * "Authentication": Supabase Auth gates the dashboard, RLS on user-scoped
 * tables). For privileged operations (seeding, replay) use
 * `createAdminClient` instead.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component during render — middleware
            // refreshes the session instead, so this is safe to ignore.
          }
        },
      },
    }
  );
}
