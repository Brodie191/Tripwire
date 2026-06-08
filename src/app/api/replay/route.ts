import type { NextRequest } from "next/server";
import { nextReplayEvent } from "@/lib/replay";

export const dynamic = "force-dynamic";

const TICK_MS = 2_000;

/**
 * Streams held-out transactions, each enriched with the model's score, to
 * the Live Monitor over Server-Sent Events (spec §06 "Replay / stream").
 * One connection, one ticking interval, torn down the moment the client
 * disconnects — the "responsive replay" the spec deliberately substitutes
 * for real streaming infrastructure (§02 non-goals: "not a
 * streaming-infrastructure project").
 *
 * `nextReplayEvent` is currently a stub (see src/lib/replay.ts) that
 * fabricates both the transaction and its score; once P1/P2/P3 land, this
 * loop swaps to reading the seeded split from Supabase and scoring it via
 * Modal — the SSE event shape (`ReplayEvent`) does not change.
 */
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      send("connected", { tickMs: TICK_MS });

      const interval = setInterval(async () => {
        try {
          const event = await nextReplayEvent();
          send("transaction", event);
        } catch {
          send("error", { message: "Replay source unavailable" });
        }
      }, TICK_MS);

      const close = () => {
        clearInterval(interval);
        controller.close();
      };

      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
