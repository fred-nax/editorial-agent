import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { logError } from "@/lib/logger";
import { handleDeleteWatchSearch, handleReadWatchSearch } from "@/lib/veille/history";
import { prismaWatchHistoryStore } from "@/lib/veille/history-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await requireAuth();
  const { id } = await context.params;
  const result = await handleReadWatchSearch(id, {
    authenticated: Boolean(session?.user),
    store: prismaWatchHistoryStore(),
  });
  if (result.status >= 500) {
    logError("veille", "history read failed", { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await requireAuth();
  const { id } = await context.params;
  const result = await handleDeleteWatchSearch(id, {
    authenticated: Boolean(session?.user),
    store: prismaWatchHistoryStore(),
  });
  if (result.status >= 500) {
    logError("veille", "history delete failed", { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}
