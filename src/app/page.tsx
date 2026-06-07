export default function Home() {
  return (
    <div className="bg-dot-grid flex flex-1 flex-col items-center justify-center gap-12 px-6 py-24">
      <div className="flex items-center gap-3">
        <span className="live-dot h-2 w-2 rounded-full bg-muted-foreground" />
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          system online &middot; replay idle
        </span>
      </div>

      <h1 className="font-display text-5xl uppercase tracking-[0.15em] text-foreground sm:text-7xl">
        Tripwire
      </h1>

      <p className="max-w-md text-center text-sm leading-6 text-muted-foreground">
        Real-time, explainable credit-card fraud detection. A model scores
        every transaction as it arrives; this monitor surfaces the suspicious
        ones and explains, in plain terms,{" "}
        <span className="text-signal">why</span> each was flagged.
      </p>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        {[
          { label: "Transactions / min", value: "—" },
          { label: "Flags caught", value: "—" },
          { label: "Live PR-AUC", value: "—" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col gap-2 bg-card p-6 text-center"
          >
            <span className="font-display text-3xl text-tabular text-foreground">
              {stat.value}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Live monitor — coming up next
      </p>
    </div>
  );
}
