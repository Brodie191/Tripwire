import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { serverEnv } from "@/lib/env";

/**
 * Bounds the scoring endpoint specifically — the one route that triggers a
 * Modal inference call and therefore real cost (spec §08 "Rate limiting":
 * "makes runaway inference cost impossible"). A sliding window keeps it
 * simple to reason about and to explain in the threat-model write-up.
 *
 * Built lazily on first use so importing this module — e.g. while Next.js
 * statically analyses routes during `next build` — doesn't itself demand
 * Upstash credentials be configured (see src/lib/env.ts for why eager
 * validation is the wrong default here).
 */
let instance: Ratelimit | undefined;

function getScoreRatelimit(): Ratelimit {
  if (!instance) {
    instance = new Ratelimit({
      redis: new Redis({
        url: serverEnv.UPSTASH_REDIS_REST_URL,
        token: serverEnv.UPSTASH_REDIS_REST_TOKEN,
      }),
      limiter: Ratelimit.slidingWindow(10, "10 s"),
      prefix: "tripwire:score",
      analytics: true,
    });
  }
  return instance;
}

/** Scoped per caller (IP, or user id once auth lands) by the calling route handler. */
export const scoreRatelimit = {
  limit: (identifier: string) => getScoreRatelimit().limit(identifier),
};
