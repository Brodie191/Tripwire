"use client";

import { useReplayFeed } from "@/hooks/use-replay-feed";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatTime(unixTime: number) {
  return new Date(unixTime * 1000).toLocaleTimeString("en-US", { hour12: false });
}

const statusLabel = {
  connecting: "connecting…",
  live: "feed live",
  error: "connection lost — retrying",
} as const;

/**
 * The hero screen (spec §07 "Live Monitor"): a streaming column of
 * transactions with status dots, a large dot-matrix risk-score readout,
 * running counters, and the pulsing live indicator that flashes signal red
 * on a flag. Flagged rows alone carry the accent — everything else stays
 * monochrome, per the "monochrome-plus-one" design discipline (spec §07).
 *
 * Sourced from /api/replay, which is currently backed by a fabricated stub
 * (see src/lib/replay.ts) — the banner at the foot of the screen says so.
 */
export function LiveMonitor() {
  const { status, items, latest, transactionsPerMinute, flagsCaught, justFlagged } =
    useReplayFeed();

  const riskScore = latest ? Math.round(latest.score.probability * 100) : null;

  return (
    <div className="bg-dot-grid flex flex-1 flex-col gap-8 px-6 py-10 sm:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl uppercase tracking-[0.15em] text-foreground">
          Tripwire
        </h1>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={
              justFlagged
                ? "live-dot--flagged h-2.5 w-2.5 rounded-full"
                : status === "live"
                  ? "live-dot h-2.5 w-2.5 rounded-full bg-muted-foreground"
                  : "h-2.5 w-2.5 rounded-full bg-muted-foreground/30"
            }
          />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {statusLabel[status]}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        <div className="flex flex-col gap-2 bg-card p-6">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Current risk score
          </span>
          <span
            className={`font-display text-5xl text-tabular ${
              latest?.score.isFraud ? "text-signal" : "text-foreground"
            }`}
          >
            {riskScore !== null ? `${riskScore}%` : "—"}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {latest
              ? `threshold ${Math.round(latest.score.threshold * 100)}% · ${
                  latest.score.isFraud ? "flagged" : "cleared"
                }`
              : "awaiting first transaction"}
          </span>
        </div>

        <div className="flex flex-col gap-2 bg-card p-6">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Transactions / min
          </span>
          <span className="font-display text-5xl text-tabular text-foreground">
            {transactionsPerMinute}
          </span>
        </div>

        <div className="flex flex-col gap-2 bg-card p-6">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Flags caught
          </span>
          <span className="font-display text-5xl text-tabular text-signal">{flagsCaught}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-6 py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Replay feed — held-out transactions
          </span>
        </div>
        <ul className="divide-y divide-border overflow-y-auto">
          {items.length === 0 && (
            <li className="px-6 py-10 text-center font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              waiting for the feed to start…
            </li>
          )}
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 px-6 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    item.score.isFraud ? "bg-signal" : "bg-muted-foreground/40"
                  }`}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{item.transaction.merchant}</p>
                  <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                    {item.transaction.category.replace(/_/g, " ")} ·{" "}
                    {formatTime(item.transaction.unixTime)}
                  </p>
                </div>
              </div>
              <span
                className={`shrink-0 font-mono text-sm text-tabular ${
                  item.score.isFraud ? "text-signal" : "text-foreground"
                }`}
              >
                {currencyFormatter.format(item.transaction.amount)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Replay source and scores are fabricated placeholders — real held-out
        data and a trained model land in P1–P3.
      </p>
    </div>
  );
}
