import { NextResponse } from "next/server";
import { getCmsConnector } from "@/lib/cms";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";

export async function POST() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const connector = getCmsConnector("webflow");
  const result = await connector.testConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
