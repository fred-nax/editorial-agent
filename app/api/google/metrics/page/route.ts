import { NextResponse } from "next/server";
import { getPagePerformance } from "@/lib/google/metrics";
import type { PeriodKey } from "@/lib/google/aggregates";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
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
