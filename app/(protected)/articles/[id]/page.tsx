import type { Metadata } from "next";
import Link from "next/link";
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
import { CmsDestinationBadge } from "@/components/cms/CmsDestinationBadge";
import {
  getArticleDetailTabs,
  type ArticleDetailTabId,
} from "@/lib/article-detail-tabs";
import { resolveWebflowConfig } from "@/lib/settings/app-settings";
import {
  loadGenerationMetaInActiveWorkspace,
  requireGenerationInActiveWorkspace,
} from "@/lib/workspace";

type ArticleDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: ArticleDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  // Hors espace : titre générique (aucune fuite subject/title).
  const article = await loadGenerationMetaInActiveWorkspace(id);
  if (!article) {
    return { title: "Génération introuvable" };
  }
  return {
    title: article.title ?? article.subject,
  };
}

export default async function ArticleDetailPage({
  params,
  searchParams,
}: ArticleDetailPageProps) {
  const { id } = await params;
  const { tab } = await searchParams;
  await recoverStaleGenerations();
  const { generation: article } = await requireGenerationInActiveWorkspace(id);

  const cmsDestination = article.cmsDestination ?? "wordpress";
  const isWebflow = cmsDestination === "webflow";
  const canManageFeaturedImage =
    article.status === "completed" &&
    (isWebflow
      ? Boolean(article.cmsExternalId?.trim())
      : typeof article.wpPostId === "number" && article.wpPostId > 0);

  const latestFeaturedImage = canManageFeaturedImage
    ? await db.articleFeaturedImage.findFirst({
        where: {
          generationId: article.id,
          workspaceId: article.workspaceId,
        },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const webflowFreeze =
    isWebflow && canManageFeaturedImage
      ? await resolveWebflowConfig()
      : null;

  const editorial = parseStoredEditorialContext(article.editorialContext);
  const publicError = toPublicGenerationError(article.error);
  const totalTokens =
    article.inputTokens !== null && article.outputTokens !== null
      ? formatTokenCount(article.inputTokens + article.outputTokens)
      : null;

  const publishedPerf = !isWebflow
    ? await resolvePublishedUrlForGeneration({
        wpPostId: article.wpPostId,
        wpUrl: article.wpUrl,
      })
    : null;

  const visibleTabs = getArticleDetailTabs(cmsDestination);
  const requestedTab: ArticleDetailTabId =
    tab === "featured"
      ? "featured"
      : tab === "performances"
        ? "performances"
        : tab === "article"
          ? "article"
          : tab === "usage"
            ? "usage"
            : "report";
  const initialTab = visibleTabs.some((item) => item.id === requestedTab)
    ? requestedTab
    : visibleTabs[0]!.id;

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
          <CmsDestinationBadge destination={cmsDestination} />
          {article.cmsExternalId ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
              ID {article.cmsExternalId}
            </span>
          ) : null}
          {!isWebflow && article.wpUrl ? (
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
          cmsDestination={cmsDestination}
          cmsExternalId={article.cmsExternalId}
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
        cmsDestination={cmsDestination}
        report={
          <GenerationReport
            trace={article.trace}
            status={article.status}
            wpPostId={article.wpPostId}
            wpUrl={article.wpUrl}
            wpStatus={article.wpStatus}
            cmsDestination={cmsDestination}
            cmsExternalId={article.cmsExternalId}
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
            cmsDestination={cmsDestination}
            cmsExternalId={article.cmsExternalId}
            wpStatus={article.wpStatus}
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
              cmsDestination={cmsDestination}
              cmsExternalId={article.cmsExternalId}
              frozenSiteId={webflowFreeze?.siteId ?? null}
              frozenCollectionId={webflowFreeze?.collectionId ?? null}
              initialImage={
                latestFeaturedImage
                  ? toFeaturedImagePublic(latestFeaturedImage)
                  : null
              }
            />
          ) : (
            <FeaturedImageUnavailable cmsDestination={cmsDestination} />
          )
        }
        performances={
          isWebflow ? undefined : (
            <ArticlePerformancesPanel
              published={Boolean(publishedPerf)}
              pageUrlNorm={publishedPerf?.pageUrlNorm ?? null}
            />
          )
        }
      />
    </div>
  );
}
