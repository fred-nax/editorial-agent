import { NextResponse } from "next/server";
import {
  assertPaidRouteAllowed,
  paidRouteTooManyRequestsResponse,
} from "@/lib/auth/paid-route-rate-limit";
import { requireAuth } from "@/lib/require-auth";
import { logError } from "@/lib/logger";
import { prismaWatchHistoryStore } from "@/lib/veille/history-db";
import { completeVeilleSearch } from "@/lib/veille/history";
import { createOpenAiWatchClient } from "@/lib/veille/openai-watch";
import { confirmArticleDates, lookupPublishedDate } from "@/lib/veille/publication-date";
import {
  assertModuleAllowedForWorkspace,
  assertRequestWorkspaceMatchesActive,
  resolveActiveWorkspace,
  WorkspaceContextError,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const session = await requireAuth();
  try {
    const workspace = await resolveActiveWorkspace();
    assertRequestWorkspaceMatchesActive(request, workspace);
    assertModuleAllowedForWorkspace(workspace, "veille");
    const paidLimit = assertPaidRouteAllowed({
      workspaceId: workspace.id,
      routeKey: "veille-search",
    });
    if (!paidLimit.allowed) {
      const denied = paidRouteTooManyRequestsResponse(paidLimit);
      return NextResponse.json(denied.body, {
        status: denied.status,
        headers: denied.headers,
      });
    }
    const result = await completeVeilleSearch(request, {
      authenticated: Boolean(session?.user),
      client: createOpenAiWatchClient(workspace.id),
      store: prismaWatchHistoryStore(workspace.id),
      confirmDates: (articles, periodDays, now) =>
        confirmArticleDates(articles, periodDays, now, (url) =>
          lookupPublishedDate(url, now)
        ),
    });
    if (result.status >= 500) {
      logError("veille", "search failed", { status: result.status });
    }
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }
}
