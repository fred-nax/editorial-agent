import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { logError } from "@/lib/logger";
import { handleCheckDuplicates } from "@/lib/veille/editorial-duplicates";
import { loadEditorialCorpus } from "@/lib/veille/editorial-corpus";
import {
  checkEditorialRapprochement,
  isSubjectSignificant,
  parseEditorialSubjectInput,
  publicMatchView,
} from "@/lib/topics/editorial-similarity";
import {
  releaseSimilarityCheckSlot,
  tryAcquireSimilarityCheckSlot,
} from "@/lib/topics/editorial-similarity-locks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Deux modes compatibles :
 * - Veille (historique) : `{ proposals: [...] }`
 * - File / Nouvel article (V7.4) : `{ subject, angle?, mode?: "editorial" }`
 */
export async function POST(request: Request) {
  const session = await requireAuth();
  if (!session?.user) {
    return unauthorized();
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;

  const wantsEditorial =
    record?.mode === "editorial" ||
    (typeof record?.subject === "string" && !Array.isArray(record.proposals));

  if (wantsEditorial) {
    const parsed = parseEditorialSubjectInput(payload);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    if (!isSubjectSignificant(parsed.subject)) {
      return NextResponse.json(
        {
          subject: parsed.subject,
          matches: [],
          hasMatches: false,
          coverage: "available",
          coverageNote: "Sujet trop court pour une comparaison fiable.",
          verified: false,
          lastSyncAt: null,
          inventoryStale: false,
          publishedCount: 0,
          skipped: true,
        },
        { status: 200 }
      );
    }

    if (!tryAcquireSimilarityCheckSlot()) {
      return NextResponse.json(
        { error: "Trop de vérifications en cours. Réessayez dans un instant." },
        { status: 429 }
      );
    }

    try {
      const result = await checkEditorialRapprochement({
        subject: parsed.subject,
        angle: parsed.angle,
      });
      return NextResponse.json({
        ...result,
        matches: result.matches.map(publicMatchView),
        skipped: false,
      });
    } catch (error) {
      logError("topics", "editorial rapprochement failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      return NextResponse.json(
        {
          error: "La vérification des rapprochements n’a pas abouti.",
          verified: false,
          coverage: "unavailable",
          coverageNote:
            "Vérification indisponible. L’originalité du sujet n’est pas établie.",
          matches: [],
          hasMatches: false,
        },
        { status: 503 }
      );
    } finally {
      releaseSimilarityCheckSlot();
    }
  }

  const result = await handleCheckDuplicates(
    new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    {
      authenticated: true,
      load: loadEditorialCorpus,
    }
  );
  if (result.status >= 500) {
    logError("topics", "duplicate check failed", { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}
