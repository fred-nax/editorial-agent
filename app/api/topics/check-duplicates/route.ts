import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { logError } from "@/lib/logger";
import { handleCheckDuplicates } from "@/lib/veille/editorial-duplicates";
import { loadEditorialCorpus } from "@/lib/veille/editorial-corpus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireAuth();
  const result = await handleCheckDuplicates(request, {
    authenticated: Boolean(session?.user),
    load: loadEditorialCorpus,
  });
  if (result.status >= 500) {
    logError("topics", "duplicate check failed", { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}
