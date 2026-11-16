import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleDetailTabs } from "@/components/ArticleDetailTabs";
import { ArticleSeoPanel } from "@/components/ArticleSeoPanel";
import { ArticleStatus } from "@/components/ArticleStatus";
import {
  FeaturedImagePanel,
  FeaturedImageUnavailable,
} from "@/components/articles/FeaturedImagePanel";
import { ArticlePerformancesPanel } from "@/components/articles/ArticlePerformancesPanel";
import { EditorialContextPanel } from "@/components/EditorialContextPanel";
import { GenerationLiveRefresh } from "@/components/GenerationLiveRefresh";
import { GenerationProgress } from "@/components/GenerationProgress";
import { GenerationReport } from "@/components/GenerationReport";
import { GenerationUsage } from "@/components/GenerationUsage";
import { db } from "@/lib/db";
import { toPublicGenerationError } from "@/lib/generation-errors";
import { recoverStaleGenerations } from "@/lib/generation-recovery";
import {
  formatCategories,
  formatDate,
  formatDuration,
  formatEstimatedCost,
  formatTokenCount,
} from "@/lib/format";
import { parseStoredEditorialContext } from "@/lib/editorial-context";
import { resolvePublishedUrlForGeneration } from "@/lib/google/wp-url-map";
import { toFeaturedImagePublic } from "@/lib/images/types";
import { formatModelLabel } from "@/lib/openai-pricing";
import type { ArticleDetailTabId } from "@/lib/article-detail-tabs";

type ArticleDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: ArticleDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const article = await db.articleGeneration.findUnique({
    where: { id },
    select: { title: true, subject: true },
  });

  return {
    title: article?.title ?? article?.subject ?? "Génération introuvable",
  };
}

export default async function ArticleDetailPage({
  params,
  searchParams,
}: ArticleDetailPageProps) {
  const { id } = await params;
  const { tab } = await searchParams;
  await recoverStaleGenerations();
  const article = await db.articleGeneration.findUnique({
    where: { id },
  });

  if (!article) {
    notFound();
  }

  const canManageFeaturedImage =
    article.status === "completed" &&
    typeof article.wpPostId === "number" &&
    article.wpPostId > 0;

  const latestFeaturedImage = canManageFeaturedImage
    ? await db.articleFeaturedImage.findFirst({
        where: { generationId: article.id },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const editorial = parseStoredEditorialContext(article.editorialContext);
  const publicError = toPublicGenerationError(article.error);
  const totalTokens =
    article.inputTokens !== null && article.outputTokens !== null
      ? formatTokenCount(article.inputTokens + article.outputTokens)
      : null;

  const publishedPerf = await resolvePublishedUrlForGeneration({
    wpPostId: article.wpPostId,
    wpUrl: article.wpUrl,
  });

  const initialTab: ArticleDetailTabId =
    tab === "featured"
      ? "featured"
      : tab === "performances"
        ? "performances"
        : "report";

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold break-words text-slate-900">
            {article.title ?? article.subject}
          </h1>
          <p className="mt-1 text-sm break-words text-slate-500">
            {article.title ? `Sujet demandé · ${article.subject}` : "Sujet demandé"}
          </p>
          <p className="mt-1 text-xs text-slate-400">{formatDate(article.createdAt)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ArticleStatus status={article.status} />
          {article.wpUrl ? (
            <Link
              href={article.wpUrl}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-naxialis hover:text-naxialis-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naxialis"
              target="_blank"
              rel="noreferrer"
            >
              Brouillon WordPress
              <span className="sr-only">, nouvel onglet</span>
            </Link>
          ) : null}
        </div>
      </div>

      <GenerationLiveRefresh
        id={article.id}
        status={article.status}
        progressStage={article.progressStage}
        progressMessage={article.progressMessage}
        featuredImageStatus={latestFeaturedImage?.status ?? null}
      />

      {article.status === "queued" ||
      article.status === "running" ||
      article.status === "failed" ? (
        <GenerationProgress
          status={article.status}
          progressStage={article.progressStage}
          progressMessage={article.progressMessage}
          createdAt={article.createdAt}
          durationMs={article.durationMs}
          wpPostId={article.wpPostId}
          subject={article.subject}
        />
      ) : null}

      {publicError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {publicError}
        </p>
      ) : null}

      <EditorialContextPanel value={article.editorialContext} />

      <ArticleDetailTabs
        initialTab={initialTab}
        report={
          <GenerationReport
            trace={article.trace}
            status={article.status}
            wpPostId={article.wpPostId}
            wpUrl={article.wpUrl}
            wpStatus={article.wpStatus}
          />
        }
        article={
          <ArticleSeoPanel
            subject={article.subject}
            preferredTitle={editorial?.preferredTitle ?? null}
            title={article.title}
            excerpt={article.excerpt}
            slug={article.slug}
            categories={formatCategories(article.categories)}
            metaTitle={article.metaTitle}
            metaDescription={article.metaDescription}
            wpPostId={article.wpPostId}
            wpUrl={article.wpUrl}
          />
        }
        usage={
          <GenerationUsage
            cost={formatEstimatedCost(article.estimatedCost)}
            inputTokens={formatTokenCount(article.inputTokens)}
            cachedTokens={formatTokenCount(article.cachedInputTokens)}
            outputTokens={formatTokenCount(article.outputTokens)}
            reasoningTokens={formatTokenCount(article.reasoningTokens)}
            totalTokens={totalTokens ?? "—"}
            model={formatModelLabel(article.model) ?? "—"}
            duration={formatDuration(article.durationMs)}
            sessionId={article.sessionId}
          />
        }
        featured={
          canManageFeaturedImage ? (
            <FeaturedImagePanel
              generationId={article.id}
              wpUrl={article.wpUrl}
              initialImage={
                latestFeaturedImage
                  ? toFeaturedImagePublic(latestFeaturedImage)
                  : null
              }
            />
          ) : (
            <FeaturedImageUnavailable />
          )
        }
        performances={
          <ArticlePerformancesPanel
            published={Boolean(publishedPerf)}
            pageUrlNorm={publishedPerf?.pageUrlNorm ?? null}
          />
        }
      />
    </div>
  );
}
