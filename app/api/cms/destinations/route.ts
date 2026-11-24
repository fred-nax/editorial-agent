import { NextResponse } from "next/server";
import { listCmsDestinations } from "@/lib/cms";
import { listPublicEditorialAgentStatuses } from "@/lib/agent/registry";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";

/**
 * Liste des destinations CMS + état public des agents associés.
 * Aucun secret / clé API / identifiant complet exposé.
 */
export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const [destinations, agents] = await Promise.all([
    Promise.resolve(listCmsDestinations()),
    listPublicEditorialAgentStatuses(),
  ]);

  return NextResponse.json({
    destinations,
    agents,
    defaultDestination: "wordpress",
  });
}
