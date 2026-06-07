# Tripwire

Real-time, explainable credit-card fraud detection. A gradient-boosted model
scores transactions as they arrive; a Nothing-inspired monitoring interface
surfaces the suspicious ones and explains, in plain terms, why each was
flagged. See [`tripwire-spec.pdf`](./tripwire-spec.pdf) for the full
specification.

## Stack

- **App.** Next.js (App Router) + TypeScript + Tailwind v4 + shadcn/ui, on Vercel.
- **Data & auth.** Supabase (Postgres, Auth, row-level security).
- **Rate limiting.** Upstash Redis.
- **Validation.** Zod, at every server boundary.
- **Inference.** A scale-to-zero Modal endpoint serving a gradient-boosted
  model, its preprocessing pipeline, and a SHAP explainer.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase / Modal / Upstash credentials
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Status

Draft — v0.1. Currently scaffolding (P0): repo, design tokens, and the
Nothing-inspired visual language are in place; data, model, serving, and the
monitor itself are next.
