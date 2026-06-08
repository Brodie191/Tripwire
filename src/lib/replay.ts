import type { Transaction, ScoreResult, ReplayEvent } from "@/lib/schemas";

const MERCHANTS = [
  "fraud_Kunde-Sanford",
  "Kirlin and Sons",
  "Schiller, Langworth and Wuckert",
  "Bashirian Group",
  "Towne, Heller and Welch",
];

const CATEGORIES = [
  "shopping_net",
  "grocery_pos",
  "gas_transport",
  "misc_net",
  "entertainment",
];

/**
 * STUB — the live feed described in spec §04 ("the live feed") replays the
 * seeded held-out test split from Supabase, in order, on a timer, each row
 * already enriched with the trained model's score (spec §06 "Replay /
 * stream"). That seeding step is P3 work and the score comes from a model
 * that doesn't exist yet (P1/P2), so this placeholder fabricates both —
 * clearly marked — to let the streaming UI be built and tested end to end
 * now. The probability is random, NOT a model output; do not present it as
 * one anywhere in the interface.
 *
 * Replace the body of this function with a Supabase read + Modal score once
 * P1/P2/P3 land — the event shape (`ReplayEvent`) the route streams is
 * already the real contract, so the UI built against it does not change.
 */
export async function nextReplayEvent(): Promise<ReplayEvent> {
  const merchant = MERCHANTS[Math.floor(Math.random() * MERCHANTS.length)];
  const probability = Math.random() ** 2; // skew low, so flags stay rare-ish
  const threshold = 0.5;

  const transaction: Transaction = {
    merchant,
    category: CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)],
    amount: Math.round((5 + Math.random() * 500) * 100) / 100,
    unixTime: Math.floor(Date.now() / 1000),
    cardholderLat: 40.7128,
    cardholderLong: -74.006,
    merchantLat: 40.73 + (Math.random() - 0.5) * 4,
    merchantLong: -73.99 + (Math.random() - 0.5) * 4,
  };

  const score: ScoreResult = {
    probability,
    isFraud: probability >= threshold,
    threshold,
    contributions: [],
  };

  return { transaction, score };
}
