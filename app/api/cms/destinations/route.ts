import { NextResponse } from "next/server";
import { listCmsDestinations } from "@/lib/cms";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";

/** Liste des destinations CMS (WordPress actif, Webflow bientôt). */
export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  return NextResponse.json({
    destinations: listCmsDestinations(),
    defaultDestination: "wordpress",
  });
}
