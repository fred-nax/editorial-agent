import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recoverStaleGenerations } from "@/lib/generation-recovery";
import { toPublicGenerationError } from "@/lib/generation-errors";
import { toFeaturedImagePublic } from "@/lib/images/types";
import { requireAuth } from "@/lib/require-auth";

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

  const { id } = await context.params;
  const article = await db.articleGeneration.findUnique({
    where: { id },
  });

  if (!article) {
    return NextResponse.json({ error: "Génération introuvable." }, { status: 404 });
  }

  const latestFeatured = await db.articleFeaturedImage.findFirst({
    where: { generationId: article.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    id: article.id,
    subject: article.subject,
    status: article.status,
    title: article.title,
    excerpt: article.excerpt,
    slug: article.slug,
    wpPostId: article.wpPostId,
    wpUrl: article.wpUrl,
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
}
