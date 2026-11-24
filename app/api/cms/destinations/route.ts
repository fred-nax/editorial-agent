import { NextResponse } from "next/server";
import { listCmsDestinations } from "@/lib/cms";
import { listPublicEditorialAgentStatuses } from "@/lib/agent/registry";
import { getWebflowGenerationReadiness } from "@/lib/webflow/readiness";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";

/**
 * Liste des destinations CMS + état public des agents associés.
 * Webflow expose aussi sa readiness (sélectionnable seulement si ok).
 * Aucun secret / clé API / token exposé.
 */
export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const [destinations, agents, webflowReadiness] = await Promise.all([
    Promise.resolve(listCmsDestinations()),
    listPublicEditorialAgentStatuses(),
    getWebflowGenerationReadiness({ verifyRemoteSchema: true }),
  ]);

  const enriched = destinations.map((destination) => {
    if (destination.id !== "webflow") {
      return {
        ...destination,
        selectable: destination.enabled,
        readiness: null as null | {
          ok: boolean;
          reasons: string[];
        },
      };
    }
    return {
      ...destination,
      // UI : radio activé seulement si mapping/agent/token prêts.
      selectable: destination.enabled && webflowReadiness.ok,
      readiness: {
        ok: webflowReadiness.ok,
        reasons: webflowReadiness.reasons,
      },
    };
  });

  return NextResponse.json({
    destinations: enriched,
    agents,
    defaultDestination: "wordpress",
    webflowReadiness: {
      ok: webflowReadiness.ok,
      reasons: webflowReadiness.reasons,
      // Pas d’IDs sensibles au-delà de ce déjà public en intégrations.
      tokenConfigured: webflowReadiness.tokenConfigured,
      agentConfigured: webflowReadiness.agentConfigured,
      mappingComplete: webflowReadiness.mappingComplete,
      mappingValid: webflowReadiness.mappingValid,
    },
  });
}
