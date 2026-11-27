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
    // WS-003 — filtre workspace dès la lecture (pas findUnique id seul).
    const article = await db.articleGeneration.findFirst({
      where: { id, workspaceId: workspace.id },
      select: {
        id: true,
        workspaceId: true,
        subject: true,
        status: true,
        title: true,
        excerpt: true,
        slug: true,
        wpPostId: true,
        wpUrl: true,
        cmsDestination: true,
        cmsExternalId: true,
        categories: true,
        metaTitle: true,
        metaDescription: true,
        durationMs: true,
        sessionId: true,
        inputTokens: true,
        cachedInputTokens: true,
        outputTokens: true,
        reasoningTokens: true,
        estimatedCost: true,
        model: true,
        error: true,
        progressStage: true,
        progressMessage: true,
        progressUpdatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
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
      select: {
        id: true,
        generationId: true,
        style: true,
        aspectRatio: true,
        size: true,
        model: true,
        prompt: true,
        altText: true,
        altModel: true,
        status: true,
        wpMediaId: true,
        wpMediaUrl: true,
        webflowAssetId: true,
        webflowAssetUrl: true,
        cmsTransferStatus: true,
        error: true,
        createdAt: true,
        updatedAt: true,
      },
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
