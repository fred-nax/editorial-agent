import { NextResponse } from "next/server";
import { getPagePerformance } from "@/lib/google/metrics";
import type { PeriodKey } from "@/lib/google/aggregates";
import { requireWordPressGoogleWorkspace } from "@/lib/google/workspace-guard";
import { requireAuth } from "@/lib/require-auth";
import { WorkspaceContextError } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    await requireWordPressGoogleWorkspace();
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }

  const { searchParams } = new URL(request.url);
  const pageUrlNorm = searchParams.get("pageUrlNorm")?.trim();
  const periodRaw = Number(searchParams.get("period") ?? "28");
  const periodDays = ([7, 28, 90].includes(periodRaw)
    ? periodRaw
    : 28) as PeriodKey;

  if (!pageUrlNorm) {
    return NextResponse.json(
      { error: "Paramètre pageUrlNorm requis." },
      { status: 400 }
    );
  }

  const data = await getPagePerformance({ pageUrlNorm, periodDays });
  return NextResponse.json(data);
}
