import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { logError } from "@/lib/logger";
import { createOpenAiSuggestionClient } from "@/lib/veille/openai-suggestions";
import { handleVeilleSuggestions } from "@/lib/veille/suggestions";
import {
  assertModuleAllowedForWorkspace,
  assertRequestWorkspaceMatchesActive,
  resolveActiveWorkspace,
  WorkspaceContextError,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await requireAuth();
  try {
    const workspace = await resolveActiveWorkspace();
    assertRequestWorkspaceMatchesActive(request, workspace);
    assertModuleAllowedForWorkspace(workspace, "veille");

    // Suggestions éphémères à partir de la source fournie — pas de corpus WP croisé.
    const result = await handleVeilleSuggestions(request, {
      authenticated: Boolean(session?.user),
      client: createOpenAiSuggestionClient(),
    });
    if (result.status >= 500) {
      logError("veille", "suggestions failed", { status: result.status });
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
