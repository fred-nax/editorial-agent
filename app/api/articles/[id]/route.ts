import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recoverStaleGenerations } from "@/lib/generation-recovery";
import { toPublicGenerationError } from "@/lib/generation-errors";
import { toFeaturedImagePublic } from "@/lib/images/types";
import { requireAuth } from "@/lib/require-auth";
import {
  assertSameWorkspace,
  resolveActiveWorkspace,
  WorkspaceContextError,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(_request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  await recoverStaleGenerations();

  try {
    const workspace = await resolveActiveWorkspace();
    const { id } = await context.params;
    const article = await db.articleGeneration.findUnique({
      where: { id },
    });

    if (!article) {
      return NextResponse.json({ error: "Génération introuvable." }, { status: 404 });
    }
    assertSameWorkspace(workspace.id, article.workspaceId, "Génération");

    const latestFeatured = await db.articleFeaturedImage.findFirst({
      where: {
        generationId: article.id,
        workspaceId: workspace.id,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      id: article.id,
      workspaceId: article.workspaceId,
      subject: article.subject,
      status: article.status,
      title: article.title,
      excerpt: article.excerpt,
      slug: article.slug,
      wpPostId: article.wpPostId,
      wpUrl: article.wpUrl,
      cmsDestination: article.cmsDestination,
      cmsExternalId: article.cmsExternalId,
      categories: article.categories,
      metaTitle: article.metaTitle,
      metaDescription: article.metaDescription,
      durationMs: article.durationMs,
      sessionId: article.sessionId,
      inputTokens: article.inputTokens,
      cachedInputTokens: article.cachedInputTokens,
      outputTokens: article.outputTokens,
      reasoningTokens: article.reasoningTokens,
      estimatedCost: article.estimatedCost,
      model: article.model,
      error: toPublicGenerationError(article.error),
      progressStage: article.progressStage,
      progressMessage: article.progressMessage,
      progressUpdatedAt: article.progressUpdatedAt,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      featuredImage: latestFeatured
        ? toFeaturedImagePublic(latestFeatured)
        : null,
    });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }
}
