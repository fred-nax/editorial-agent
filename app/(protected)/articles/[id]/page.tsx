import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleStatus } from "@/components/ArticleStatus";
import { GenerationLiveRefresh } from "@/components/GenerationLiveRefresh";
import { GenerationProgress } from "@/components/GenerationProgress";
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
import { formatModelLabel } from "@/lib/openai-pricing";

type ArticleDetailPageProps = {
  params: Promise<{ id: string }>;
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

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="border-b border-slate-100 py-3 last:border-0">
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-900">{value || "—"}</dd>
    </div>
  );
}

export default async function ArticleDetailPage({
  params,
}: ArticleDetailPageProps) {
  const { id } = await params;
  await recoverStaleGenerations();
  const article = await db.articleGeneration.findUnique({
    where: { id },
  });

  if (!article) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {article.title ?? article.subject}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{article.subject}</p>
        </div>
        <ArticleStatus status={article.status} />
      </div>
      <GenerationLiveRefresh
        id={article.id}
        status={article.status}
        progressStage={article.progressStage}
        progressMessage={article.progressMessage}
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

      <section className="rounded-lg border border-slate-200 bg-white px-5">
        <dl>
          <DetailItem label="Sujet demandé" value={article.subject} />
          <DetailItem label="Titre final" value={article.title} />
          <DetailItem label="Extrait" value={article.excerpt} />
          <DetailItem
            label="ID WordPress"
            value={article.wpPostId ? `#${article.wpPostId}` : null}
          />
          <div className="border-b border-slate-100 py-3">
            <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              Lien WordPress
            </dt>
            <dd className="mt-1 text-sm">
              {article.wpUrl ? (
                <Link
                  href={article.wpUrl}
                  className="break-all text-naxialis hover:text-naxialis-dark"
                  target="_blank"
                  rel="noreferrer"
                >
                  {article.wpUrl}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <DetailItem label="Slug" value={article.slug} />
          <DetailItem
            label="Catégories"
            value={formatCategories(article.categories)}
          />
          <DetailItem label="Meta title" value={article.metaTitle} />
          <DetailItem
            label="Meta description"
            value={article.metaDescription}
          />
          <DetailItem label="Date" value={formatDate(article.createdAt)} />
          <DetailItem
            label="Durée"
            value={formatDuration(article.durationMs)}
          />
          <DetailItem
            label="Modèle"
            value={formatModelLabel(article.model)}
          />
          <DetailItem
            label="Tokens entrée"
            value={formatTokenCount(article.inputTokens)}
          />
          <DetailItem
            label="dont cache"
            value={formatTokenCount(article.cachedInputTokens)}
          />
          <DetailItem
            label="Tokens sortie"
            value={formatTokenCount(article.outputTokens)}
          />
          <DetailItem
            label="dont reasoning"
            value={formatTokenCount(article.reasoningTokens)}
          />
          <DetailItem
            label="Tokens total"
            value={
              article.inputTokens !== null && article.outputTokens !== null
                ? formatTokenCount(article.inputTokens + article.outputTokens)
                : null
            }
          />
          <div className="border-b border-slate-100 py-3 last:border-0">
            <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              Coût LLM estimé
            </dt>
            <dd className="mt-1 text-sm text-slate-900">
              {formatEstimatedCost(article.estimatedCost)}
            </dd>
            <p className="mt-1 text-xs text-slate-500">
              Hors éventuels frais liés aux outils.
            </p>
          </div>
          <DetailItem label="Session OpenAI" value={article.sessionId} />
          <DetailItem
            label="Message d’erreur"
            value={toPublicGenerationError(article.error)}
          />
        </dl>
      </section>
    </div>
  );
}
