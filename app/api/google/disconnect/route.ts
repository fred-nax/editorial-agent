import { NextResponse } from "next/server";
import { deleteGoogleConnection } from "@/lib/google/connection";
import { revokeGoogleToken } from "@/lib/google/oauth";
import { requireGoogleAnalyticsWorkspace } from "@/lib/google/workspace-guard";
import { requireAuth } from "@/lib/require-auth";
import { WorkspaceContextError } from "@/lib/workspace";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    await requireGoogleAnalyticsWorkspace(request);
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }

  const { accessToken, refreshToken } = await deleteGoogleConnection();
  if (refreshToken) {
    await revokeGoogleToken(refreshToken);
  } else if (accessToken) {
    await revokeGoogleToken(accessToken);
  }
  return NextResponse.json({ ok: true });
}
