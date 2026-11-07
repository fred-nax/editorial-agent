import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { logError } from "@/lib/logger";
import { createOpenAiSuggestionClient } from "@/lib/veille/openai-suggestions";
import { handleVeilleSuggestions } from "@/lib/veille/suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await requireAuth();
  const result = await handleVeilleSuggestions(request, {
    authenticated: Boolean(session?.user),
    client: createOpenAiSuggestionClient(),
  });
  if (result.status >= 500) {
    logError("veille", "suggestions failed", { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}
