import Link from "next/link";
import { ArticleStatus } from "@/components/ArticleStatus";
import { CmsDestinationBadge } from "@/components/cms/CmsDestinationBadge";
import { formatDate, formatEstimatedCost } from "@/lib/format";
import { runningStatusHint } from "@/lib/progress";
import type { GenerationStatus } from "@/lib/status";

export type ArticleHistoryItem = {
  id: string;
  subject: string;
  title: string | null;
  status: GenerationStatus;
  createdAt: Date | string;
  wpPostId: number | null;
  cmsDestination?: string | null;
  cmsExternalId?: string | null;
  estimatedCost: number | null;
  progressStage?: string | null;
};

function HistoryStatus({
  status,
  progressStage,
}: {
  status: GenerationStatus;
  progressStage?: string | null;
}) {
  const hint = runningStatusHint(status, progressStage);
  if (hint) {
    return (
      <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-800">
        {hint}
      </span>
    );
  }
  return <ArticleStatus status={status} />;
}

function CmsRef({
  cmsDestination,
  cmsExternalId,
  wpPostId,
}: {
  cmsDestination?: string | null;
  cmsExternalId?: string | null;
  wpPostId: number | null;
}) {
  const isWebflow = cmsDestination === "webflow";
  if (isWebflow) {
    return (
      <span className="text-slate-600">
        {cmsExternalId ? cmsExternalId.slice(0, 12) : "—"}
      </span>
    );
  }
  return (
    <span className="text-slate-600">
      {wpPostId ? `#${wpPostId}` : "—"}
    </span>
  );
}

export function ArticleHistory({
  articles,
}: {
  articles: ArticleHistoryItem[];
}) {
  if (articles.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
        Aucune génération pour le moment.
      </p>
    );
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Sujet</th>
              <th className="px-4 py-3">CMS</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Titre</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Réf. CMS</th>
              <th className="px-4 py-3" title="Hors éventuels frais liés aux outils.">
                Coût LLM estimé
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => (
              <tr key={article.id} className="border-b border-slate-100 last:border-0">
                <td className="max-w-xs px-4 py-3 font-medium text-slate-900">
                  {article.subject}
                </td>
                <td className="px-4 py-3">
                  <CmsDestinationBadge destination={article.cmsDestination} />
                </td>
                <td className="px-4 py-3">
                  <HistoryStatus
                    status={article.status}
                    progressStage={article.progressStage}
                  />
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {article.title ?? "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {formatDate(article.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <CmsRef
                    cmsDestination={article.cmsDestination}
                    cmsExternalId={article.cmsExternalId}
                    wpPostId={article.wpPostId}
                  />
                </td>
                <td
                  className="px-4 py-3 text-slate-600"
                  title="Hors éventuels frais liés aux outils."
                >
                  {formatEstimatedCost(article.estimatedCost)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/articles/${article.id}`}
                    className="font-medium text-naxialis hover:text-naxialis-dark"
                  >
                    Voir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {articles.map((article) => (
          <article
            key={article.id}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-medium text-slate-900">
                {article.subject}
              </h3>
              <HistoryStatus
                status={article.status}
                progressStage={article.progressStage}
              />
            </div>
            <div className="mt-2">
              <CmsDestinationBadge destination={article.cmsDestination} />
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {article.title ?? "Titre non généré"}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
              <div>
                <dt>Date</dt>
                <dd className="text-slate-700">{formatDate(article.createdAt)}</dd>
              </div>
              <div>
                <dt>Réf. CMS</dt>
                <dd className="text-slate-700">
                  <CmsRef
                    cmsDestination={article.cmsDestination}
                    cmsExternalId={article.cmsExternalId}
                    wpPostId={article.wpPostId}
                  />
                </dd>
              </div>
              <div>
                <dt title="Hors éventuels frais liés aux outils.">
                  Coût LLM estimé
                </dt>
                <dd className="text-slate-700">
                  {formatEstimatedCost(article.estimatedCost)}
                </dd>
              </div>
            </dl>
            <Link
              href={`/articles/${article.id}`}
              className="mt-3 inline-flex text-sm font-medium text-naxialis"
            >
              Voir
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
