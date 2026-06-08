import { z } from "zod";

/**
 * The shape of a single Sparkov-derived transaction, as it crosses the
 * server boundary (replay feed, scoring proxy). Mirrors the dataset's
 * human-readable fields (spec §04) — merchant/category/amount/geo — plus
 * the derived features the model expects (spec §04 "Feature engineering").
 *
 * Every route handler validates against this before talking to Supabase
 * or the Modal endpoint (spec §08 "Input validation").
 */
export const transactionSchema = z.object({
  merchant: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  amount: z.number().positive().max(1_000_000),
  unixTime: z.number().int().positive(),
  cardholderLat: z.number().min(-90).max(90),
  cardholderLong: z.number().min(-180).max(180),
  merchantLat: z.number().min(-90).max(90),
  merchantLong: z.number().min(-180).max(180),
});

export type Transaction = z.infer<typeof transactionSchema>;

/**
 * The response shape returned by the Modal scoring endpoint and proxied by
 * the app's own /api/score route (spec §05 "Serving"): a probability, the
 * decision at the operating threshold, and ranked SHAP feature
 * contributions for the "why flagged" panel (spec §07).
 */
export const scoreResultSchema = z.object({
  probability: z.number().min(0).max(1),
  isFraud: z.boolean(),
  threshold: z.number().min(0).max(1),
  contributions: z
    .array(
      z.object({
        feature: z.string(),
        value: z.number(),
        contribution: z.number(),
      })
    )
    .max(20),
});

export type ScoreResult = z.infer<typeof scoreResultSchema>;

/**
 * What `/api/replay` emits per SSE "transaction" event: a held-out
 * transaction enriched with the model's score (spec §06 "Replay / stream").
 * The client validates against this too — payloads crossing any boundary,
 * including our own server-to-browser one, get checked (spec §08).
 */
export const replayEventSchema = z.object({
  transaction: transactionSchema,
  score: scoreResultSchema,
});

export type ReplayEvent = z.infer<typeof replayEventSchema>;
