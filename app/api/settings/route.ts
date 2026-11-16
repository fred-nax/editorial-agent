import { NextResponse } from "next/server";
import { getPublicAppSettings } from "@/lib/settings/app-settings";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const settings = await getPublicAppSettings();
  return NextResponse.json(settings);
}
