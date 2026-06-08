import type { Transaction } from "@/lib/schemas";

/**
 * STUB — the live feed described in spec §04 ("the live feed") replays the
 * seeded held-out test split from Supabase, in order, on a timer. That seed
 * step is P3 work and depends on the cleaned dataset from P1, so this
 * placeholder hands back a single synthetic-shaped transaction to let the
 * streaming plumbing in `/api/replay` be built and tested end to end now.
 *
 * Replace the body of this function with a Supabase read (e.g. an
 * incrementing cursor over the seeded `transactions` table) once P1/P3 land
 * — the route handler's contract (`Transaction`) does not need to change.
 */
export async function nextReplayTransaction(): Promise<Transaction> {
  return {
    merchant: "fraud_Kunde-Sanford",
    category: "shopping_net",
    amount: 42.17 + Math.random() * 200,
    unixTime: Math.floor(Date.now() / 1000),
    cardholderLat: 40.7128,
    cardholderLong: -74.006,
    merchantLat: 40.73 + (Math.random() - 0.5) * 2,
    merchantLong: -73.99 + (Math.random() - 0.5) * 2,
  };
}
