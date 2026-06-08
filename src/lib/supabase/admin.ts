import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { clientEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env";

/**
 * A privileged client authenticated with the service-role key — bypasses
 * row-level security entirely. Reserved for server-only, trusted operations:
 * seeding the held-out test split and writing the model's predictions as the
 * replay feed runs (spec §03 "Data layer", §06 "Persistence, auth, and limits").
 *
 * Never expose this client, its key, or its results to the browser. There is
 * deliberately no cookie/session plumbing here — it is not "the user", it is
 * the application acting on the database directly.
 */
export function createAdminClient() {
  return createSupabaseClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
