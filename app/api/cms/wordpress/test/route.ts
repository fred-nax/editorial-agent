import { NextResponse } from "next/server";
import { getCmsConnector } from "@/lib/cms";
import { resolveWordPressConfig } from "@/lib/settings/app-settings";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";

/**
 * Test de connexion WordPress non destructif via le connecteur CMS.
 * Aucune écriture WordPress, aucun appel agent éditorial.
 */
export async function POST() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const config = await resolveWordPressConfig();
  if (!config) {
    return NextResponse.json(
      { ok: false, message: "WordPress non configuré." },
      { status: 400 }
    );
  }

  const result = await getCmsConnector("wordpress", config).testConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
