import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Read endpoints behind the Analytics view (spec §06 "Aggregates", §07
 * "Analytics"): fraud rate over time, precision/recall at the live
 * threshold, a confusion matrix, category breakdowns.
 *
 * STUB — these figures are derived from predictions persisted in Supabase
 * as the replay feed runs, which depends on P1 (a trained model with a
 * chosen threshold) and P3 (the seeded split + persistence). `null` here
 * is an honest "not yet computed", not a fabricated zero — the Live Monitor
 * and Analytics screens should render an explicit empty state for it rather
 * than a misleading chart.
 */
export async function GET() {
  return NextResponse.json({
    fraudRatesOverTime: null,
    precisionAtThreshold: null,
    recallAtThreshold: null,
    confusionMatrix: null,
    categoryBreakdown: null,
  });
}
