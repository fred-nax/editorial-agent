import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { logError } from "@/lib/logger";
import { handleListWatchSearches } from "@/lib/veille/history";
import { prismaWatchHistoryStore } from "@/lib/veille/history-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireAuth();
  const result = await handleListWatchSearches(new URL(request.url), {
    authenticated: Boolean(session?.user),
    store: prismaWatchHistoryStore(),
  });
  if (result.status >= 500) {
    logError("veille", "history list failed", { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}
