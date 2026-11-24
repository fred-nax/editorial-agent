import { NextResponse } from "next/server";
import {
  FeaturedImageServiceError,
  uploadFeaturedImageToWordPress,
} from "@/lib/images/service";
import {
  resolveFeaturedImageWorkspace,
  workspaceContextErrorResponse,
} from "@/lib/images/route-workspace";
import { requireAuth } from "@/lib/require-auth";
import { WorkspaceContextError } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  try {
    const workspace = await resolveFeaturedImageWorkspace();
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.imageId !== "string" || !body.imageId) {
      return NextResponse.json(
        { error: "Identifiant d’image requis." },
        { status: 400 }
      );
    }

    const result = await uploadFeaturedImageToWordPress({
      generationId: id,
      imageId: body.imageId,
      altText: body.altText,
      confirmReplace: body.confirmReplace === true,
      workspaceId: workspace.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceContextErrorResponse(error);
    }
    if (error instanceof FeaturedImageServiceError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          ...(error.payload ?? {}),
        },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: "L’envoi vers WordPress a échoué." },
      { status: 502 }
    );
  }
}
