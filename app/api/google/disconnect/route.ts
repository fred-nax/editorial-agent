import { NextResponse } from "next/server";
import { deleteGoogleConnection } from "@/lib/google/connection";
import { revokeGoogleToken } from "@/lib/google/oauth";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";

export async function POST() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { accessToken, refreshToken } = await deleteGoogleConnection();
  if (refreshToken) {
    await revokeGoogleToken(refreshToken);
  } else if (accessToken) {
    await revokeGoogleToken(accessToken);
  }
  return NextResponse.json({ ok: true });
}
