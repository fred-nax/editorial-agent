import { NextResponse } from "next/server";
import {
  listGa4Properties,
  listSearchConsoleSites,
} from "@/lib/google/properties";
import { requireGoogleAnalyticsWorkspace } from "@/lib/google/workspace-guard";
import { requireAuth } from "@/lib/require-auth";
import { WorkspaceContextError } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  let workspace;
  try {
    workspace = await requireGoogleAnalyticsWorkspace(request);
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }

  try {
    const gsc = await listSearchConsoleSites();
    const ga4 =
      workspace.cmsProvider === "wordpress"
        ? await listGa4Properties()
        : [];
    return NextResponse.json({
      gsc,
      ga4,
      ga4Supported: workspace.cmsProvider === "wordpress",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de charger les propriétés Google.",
      },
      { status: 502 }
    );
  }
}
