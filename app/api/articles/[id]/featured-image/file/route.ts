import { NextResponse } from "next/server";
import {
  FeaturedImageServiceError,
  readFeaturedImageBytesForArticle,
} from "@/lib/images/service";
import { MAX_IMAGE_BYTES } from "@/lib/images/config";
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

export async function GET(request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspace = await resolveFeaturedImageWorkspace();
    const { id } = await context.params;
    const imageId = new URL(request.url).searchParams.get("imageId");
    if (!imageId) {
      return NextResponse.json(
        { error: "Identifiant d’image requis." },
        { status: 400 }
      );
    }

    const { bytes, mimeType } = await readFeaturedImageBytesForArticle({
      generationId: id,
      imageId,
      workspaceId: workspace.id,
    });

    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Image trop volumineuse." },
        { status: 413 }
      );
    }

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceContextErrorResponse(error);
    }
    if (error instanceof FeaturedImageServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: "Fichier image indisponible." },
      { status: 404 }
    );
  }
}
