import { NextResponse } from "next/server";
import {
  FeaturedImageServiceError,
  generateFeaturedImageForArticle,
} from "@/lib/images/service";
import { FEATURED_IMAGE_MODEL } from "@/lib/images/config";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Génération image : laisser le temps à OpenAI. */
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
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const style =
      typeof body.style === "string" ? body.style : "photographic";
    const aspectRatio =
      typeof body.aspectRatio === "string" ? body.aspectRatio : "3:2";

    const image = await generateFeaturedImageForArticle({
      generationId: id,
      style,
      aspectRatio,
      visualInstructions: body.visualInstructions,
    });

    return NextResponse.json({
      image,
      model: FEATURED_IMAGE_MODEL,
    });
  } catch (error) {
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
      { error: "La génération d’image a échoué." },
      { status: 502 }
    );
  }
}
