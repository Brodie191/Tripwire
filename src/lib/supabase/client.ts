import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env";

/**
 * The only Supabase handle the browser ever holds — scoped to the anon key,
 * subject to row-level security. Use from Client Components (spec §03: "the
 * browser never touches the model or the database directly" still holds for
 * reads that RLS explicitly allows, e.g. a user's own annotations).
 */
export function createClient() {
  return createBrowserClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
