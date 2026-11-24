import { NextResponse } from "next/server";
import {
  FeaturedImageServiceError,
  getLatestFeaturedImage,
  updateFeaturedImageAltText,
} from "@/lib/images/service";
import {
  resolveFeaturedImageWorkspace,
  workspaceContextErrorResponse,
} from "@/lib/images/route-workspace";
import { requireAuth } from "@/lib/require-auth";
import { WorkspaceContextError } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function toErrorResponse(error: unknown) {
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
    { error: "Une erreur est survenue." },
    { status: 500 }
  );
}

export async function GET(_request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  try {
    const workspace = await resolveFeaturedImageWorkspace();
    const { id } = await context.params;
    const image = await getLatestFeaturedImage(id, workspace.id);
    return NextResponse.json({ image });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
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
    const image = await updateFeaturedImageAltText({
      generationId: id,
      imageId: body.imageId,
      altText: body.altText,
      workspaceId: workspace.id,
    });
    return NextResponse.json({ image });
  } catch (error) {
    return toErrorResponse(error);
  }
}
