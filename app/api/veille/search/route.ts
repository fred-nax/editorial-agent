import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { logError } from "@/lib/logger";
import { prismaWatchHistoryStore } from "@/lib/veille/history-db";
import { completeVeilleSearch } from "@/lib/veille/history";
import { createOpenAiWatchClient } from "@/lib/veille/openai-watch";
import { confirmArticleDates, lookupPublishedDate } from "@/lib/veille/publication-date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const session = await requireAuth();
  const result = await completeVeilleSearch(request, {
    authenticated: Boolean(session?.user),
    client: createOpenAiWatchClient(),
    store: prismaWatchHistoryStore(),
    confirmDates: (articles, periodDays, now) =>
      confirmArticleDates(articles, periodDays, now, (url) => lookupPublishedDate(url, now)),
  });
  if (result.status >= 500) {
    logError("veille", "search failed", { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}
