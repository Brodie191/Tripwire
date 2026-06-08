import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { transactionSchema, scoreResultSchema } from "@/lib/schemas";
import { scoreRatelimit } from "@/lib/ratelimit";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Proxies a single transaction to the Modal scoring endpoint (spec §06
 * "Score"). This is the only route that spends inference money, so it is
 * the one rate-limited and the one whose secrets (the Modal token) must
 * never reach the browser — the two halves of spec §08's threat model for
 * "endpoint abuse and cost exhaustion".
 *
 * Order matters: rate-limit before validation, validation before the
 * outbound call — each gate is cheaper than the one after it.
 */
export async function POST(request: NextRequest) {
  const identifier = request.headers.get("x-forwarded-for") ?? "anonymous";
  const { success, limit, remaining, reset } = await scoreRatelimit.limit(identifier);

  if (!success) {
    return NextResponse.json(
      { error: "Rate limit exceeded — try again shortly." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": String(reset),
        },
      }
    );
  }

  const body = await request.json().catch(() => null);
  const parsedTransaction = transactionSchema.safeParse(body);

  if (!parsedTransaction.success) {
    return NextResponse.json(
      { error: "Invalid transaction payload", issues: z.treeifyError(parsedTransaction.error) },
      { status: 400 }
    );
  }

  let modalResponse: Response;
  try {
    modalResponse = await fetch(serverEnv.MODAL_ENDPOINT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serverEnv.MODAL_TOKEN}`,
      },
      body: JSON.stringify(parsedTransaction.data),
    });
  } catch {
    return NextResponse.json({ error: "Scoring service unreachable" }, { status: 502 });
  }

  if (!modalResponse.ok) {
    return NextResponse.json({ error: "Scoring service rejected the request" }, { status: 502 });
  }

  const parsedResult = scoreResultSchema.safeParse(await modalResponse.json().catch(() => null));

  if (!parsedResult.success) {
    return NextResponse.json({ error: "Malformed response from scoring service" }, { status: 502 });
  }

  return NextResponse.json(parsedResult.data);
}
