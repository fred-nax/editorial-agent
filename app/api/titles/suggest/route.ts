import { NextResponse } from "next/server";
import { parseEditorialContext } from "@/lib/editorial-context";
import {
  assertPaidRouteAllowed,
  paidRouteTooManyRequestsResponse,
} from "@/lib/auth/paid-route-rate-limit";
import { requireAuth } from "@/lib/require-auth";
import {
  suggestEditorialTitles,
  TitleSuggestionError,
} from "@/lib/titles/suggest";
import {
  resolveActiveWorkspace,
  WorkspaceContextError,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function parseJsonBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Corps JSON invalide.");
  }
  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  try {
    const workspace = await resolveActiveWorkspace();
    const paidLimit = assertPaidRouteAllowed({
      workspaceId: workspace.id,
      routeKey: "titles-suggest",
    });
    if (!paidLimit.allowed) {
      const denied = paidRouteTooManyRequestsResponse(paidLimit);
      return NextResponse.json(denied.body, {
        status: denied.status,
        headers: denied.headers,
      });
    }
    const body = parseJsonBody(await request.json());
    const editorial = parseEditorialContext({
      angle: body.angle,
      audience: body.audience,
      objective: body.objective,
      seoKeywords: body.seoKeywords,
      notes: body.notes,
      language: body.language,
    });

    const result = await suggestEditorialTitles({
      subject: body.subject,
      workspaceId: workspace.id,
      editorial,
    });

    return NextResponse.json({
      suggestions: result.suggestions,
      model: result.model,
    });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    if (error instanceof TitleSuggestionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    const message =
      error instanceof Error ? error.message : "Suggestion impossible.";
    const status =
      message === "Corps JSON invalide." ||
      message.includes("sujet") ||
      message.includes("caractères") ||
      message.includes("invalide") ||
      message.includes("non reconnu") ||
      message.includes("personnalisé")
        ? 400
        : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
