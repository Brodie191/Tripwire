"use client";

import { useEffect, useRef, useState } from "react";
import { replayEventSchema, type ReplayEvent } from "@/lib/schemas";

const HISTORY_LIMIT = 25;
const RATE_WINDOW_MS = 60_000;

export interface FeedItem extends ReplayEvent {
  id: string;
  receivedAt: number;
}

export type ConnectionStatus = "connecting" | "live" | "error";

interface ReplayFeedState {
  status: ConnectionStatus;
  items: FeedItem[];
  latest: FeedItem | null;
  transactionsPerMinute: number;
  flagsCaught: number;
  justFlagged: boolean;
}

/**
 * Owns the connection to /api/replay (spec §06 "Replay / stream") and
 * derives everything the Live Monitor needs from it: a capped, newest-first
 * history, the running counters (spec §07 "transactions per minute, flags
 * caught"), and a one-shot `justFlagged` pulse the live indicator uses to
 * flash signal red (spec §07 "Motion").
 *
 * Every event is re-validated client-side against `replayEventSchema` —
 * crossing our own server-to-browser boundary is still crossing a boundary
 * (spec §08).
 */
export function useReplayFeed(): ReplayFeedState {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [flagsCaught, setFlagsCaught] = useState(0);
  const [justFlagged, setJustFlagged] = useState(false);
  const [transactionsPerMinute, setTransactionsPerMinute] = useState(0);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsRef = useRef<FeedItem[]>([]);

  // `Date.now()` is impure and must not run during render — recompute the
  // rolling rate on a tick instead, reading the latest items via a ref.
  useEffect(() => {
    const tick = () => {
      const cutoff = Date.now() - RATE_WINDOW_MS;
      setTransactionsPerMinute(
        itemsRef.current.filter((item) => item.receivedAt >= cutoff).length
      );
    };
    tick();
    const interval = setInterval(tick, 1_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/replay");

    source.addEventListener("open", () => setStatus("live"));
    source.addEventListener("error", () => setStatus("error"));

    source.addEventListener("transaction", (event) => {
      const parsed = replayEventSchema.safeParse(JSON.parse(event.data));
      if (!parsed.success) return;

      const item: FeedItem = {
        ...parsed.data,
        id: `${parsed.data.transaction.unixTime}-${Math.random().toString(36).slice(2, 8)}`,
        receivedAt: Date.now(),
      };

      setItems((prev) => {
        const next = [item, ...prev].slice(0, HISTORY_LIMIT);
        itemsRef.current = next;
        return next;
      });

      if (item.score.isFraud) {
        setFlagsCaught((count) => count + 1);
        setJustFlagged(true);
        if (flashTimeout.current) clearTimeout(flashTimeout.current);
        flashTimeout.current = setTimeout(() => setJustFlagged(false), 600);
      }
    });

    return () => {
      source.close();
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
    };
  }, []);

  return {
    status,
    items,
    latest: items[0] ?? null,
    transactionsPerMinute,
    flagsCaught,
    justFlagged,
  };
}
