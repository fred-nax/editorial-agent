import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { logError } from "@/lib/logger";
import {
  analyzeEditorialSimilarityWithAi,
  EditorialSimilarityAiError,
} from "@/lib/topics/editorial-similarity-ai";
import {
  checkEditorialRapprochement,
  isSubjectSignificant,
  parseEditorialSubjectInput,
  publicMatchView,
} from "@/lib/topics/editorial-similarity";
import { EDITORIAL_SIMILARITY_MODEL } from "@/lib/topics/editorial-similarity-config";
import {
  isRapprochementKind,
  type EditorialMatch,
} from "@/lib/topics/editorial-similarity-types";
import {
  assertWordPressOnlyModule,
  resolveActiveWorkspace,
  WorkspaceContextError,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Analyse IA facultative : déclenchée explicitement par l’utilisateur.
 * Réutilise d’abord le rapprochement local, puis affine les candidats.
 * Inventaire WordPress uniquement — pas de compensation depuis un autre espace.
 */
export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  let workspace;
  try {
    workspace = await resolveActiveWorkspace();
    assertWordPressOnlyModule(workspace.cmsProvider);
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const parsed = parseEditorialSubjectInput(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  if (!isSubjectSignificant(parsed.subject)) {
    return NextResponse.json(
      { error: "Sujet trop court pour une analyse IA." },
      { status: 400 }
    );
  }

  try {
    const local = await checkEditorialRapprochement({
      subject: parsed.subject,
      angle: parsed.angle,
      workspaceId: workspace.id,
    });

    let candidates = local.matches;
    const body =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};

    if (Array.isArray(body.candidates) && body.candidates.length > 0) {
      const fromClient: EditorialMatch[] = [];
      for (const item of body.candidates) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          continue;
        }
        const row = item as Record<string, unknown>;
        const wpPostId =
          typeof row.wpPostId === "number" ? row.wpPostId : Number.NaN;
        const kind = typeof row.kind === "string" ? row.kind : "";
        const title = typeof row.title === "string" ? row.title.trim() : "";
        const url = typeof row.url === "string" ? row.url.trim() : "";
        const explanation =
          typeof row.explanation === "string" ? row.explanation.trim() : "";
        if (
          !Number.isInteger(wpPostId) ||
          !isRapprochementKind(kind) ||
          !title ||
          !/^https?:\/\//i.test(url)
        ) {
          continue;
        }
        const localMatch = local.matches.find((m) => m.wpPostId === wpPostId);
        if (!localMatch || localMatch.url !== url) {
          // N’accepte que des candidats déjà issus du rapprochement local.
          continue;
        }
        fromClient.push({
          ...localMatch,
          kind,
          title,
          url,
          explanation: explanation || localMatch.explanation,
        });
      }
      if (fromClient.length > 0) {
        candidates = fromClient;
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        ...local,
        matches: [],
        hasMatches: false,
        ai: false,
        model: EDITORIAL_SIMILARITY_MODEL,
        note: "Aucun rapprochement local à approfondir.",
      });
    }

    const analyzed = await analyzeEditorialSimilarityWithAi({
      subject: parsed.subject,
      angle: parsed.angle,
      candidates,
    });

    return NextResponse.json({
      ...local,
      matches: analyzed.map(publicMatchView),
      hasMatches: analyzed.length > 0,
      ai: true,
      model: EDITORIAL_SIMILARITY_MODEL,
    });
  } catch (error) {
    if (error instanceof EditorialSimilarityAiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("topics", "similarity AI failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "L’analyse IA de similarité a échoué." },
      { status: 502 }
    );
  }
}
