import { z } from "zod";

/**
 * Single source of truth for runtime configuration. Validated lazily, on
 * first actual use, and memoized — so a missing or malformed secret fails
 * loudly the moment a route handler needs it (spec §08 "Secrets": the
 * Modal token and Supabase service key must never reach the browser), but
 * does not block `next build` from statically analysing routes that happen
 * not to run yet. Eager, import-time parsing would fail the build for
 * anyone (including CI) without every secret configured up front.
 *
 * `clientEnv` holds the values safe to ship to the browser (the
 * `NEXT_PUBLIC_*` pair); `serverEnv` holds everything else and must only be
 * reached from server-side modules (route handlers, server components,
 * server actions).
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  MODAL_ENDPOINT_URL: z.url(),
  MODAL_TOKEN: z.string().min(1),
  UPSTASH_REDIS_REST_URL: z.url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
});

function lazy<T>(parse: () => T): () => T {
  let cached: T | undefined;
  return () => {
    if (cached === undefined) cached = parse();
    return cached;
  };
}

function parse<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined>
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}`
    );
  }
  return result.data as z.infer<T>;
}

const getClientEnv = lazy(() =>
  parse(clientSchema, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })
);

const getServerEnv = lazy(() =>
  parse(serverSchema, {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    MODAL_ENDPOINT_URL: process.env.MODAL_ENDPOINT_URL,
    MODAL_TOKEN: process.env.MODAL_TOKEN,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
);

/** Values safe to ship to the browser. Validated and cached on first read. */
export const clientEnv = new Proxy({} as z.infer<typeof clientSchema>, {
  get: (_target, key: string) => getClientEnv()[key as keyof z.infer<typeof clientSchema>],
});

/**
 * Server-only secrets — confine to route handlers and server-side code.
 * Validated and cached on first read.
 */
export const serverEnv = new Proxy({} as z.infer<typeof serverSchema>, {
  get: (_target, key: string) => getServerEnv()[key as keyof z.infer<typeof serverSchema>],
});
