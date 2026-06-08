import type { NextRequest } from "next/server";
import { nextReplayTransaction } from "@/lib/replay";

export const dynamic = "force-dynamic";

const TICK_MS = 2_000;

/**
 * Streams held-out transactions to the Live Monitor over Server-Sent Events
 * (spec §06 "Replay / stream"). One connection, one ticking interval, torn
 * down the moment the client disconnects — the "responsive replay" the spec
 * deliberately substitutes for real streaming infrastructure (§02 non-goals:
 * "not a streaming-infrastructure project").
 *
 * `nextReplayTransaction` is currently a stub (see src/lib/replay.ts); once
 * P3 seeds the held-out split into Supabase, this loop swaps to reading from
 * there — the SSE plumbing itself does not change.
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
          const transaction = await nextReplayTransaction();
          send("transaction", transaction);
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
