import Link from "next/link";
import { ExternalLink, History } from "lucide-react";
import {
  dashboardCardClassName,
  dashboardCardHeaderClassName,
  dashboardIconBadgeClassName,
} from "@/components/dashboard/card-shell";
import { GenerationStatusBadge } from "@/components/dashboard/status-badge";
import { CmsDestinationBadge } from "@/components/cms/CmsDestinationBadge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatEstimatedCost } from "@/lib/format";
import type { GenerationStatus } from "@/lib/status";

export type DashboardGenerationRow = {
  id: string;
  subject: string;
  title: string | null;
  status: GenerationStatus;
  createdAt: Date | string;
  wpPostId: number | null;
  wpUrl: string | null;
  cmsDestination?: string | null;
  cmsExternalId?: string | null;
  estimatedCost: number | null;
  progressStage?: string | null;
  error?: string | null;
};

function ArticleTitleCell({
  title,
  subject,
}: {
  title: string | null;
  subject: string;
}) {
  const trimmedTitle = title?.trim() ?? "";
  const primary = trimmedTitle || subject;
  const showSubject = trimmedTitle.length > 0 && trimmedTitle !== subject.trim();

  return (
    <div className="min-w-0 max-w-lg">
      <p className="truncate text-sm font-medium text-[#0F172A]">{primary}</p>
      {showSubject ? (
        <p className="mt-0.5 truncate text-xs text-slate-500" title={subject}>
          Sujet : {subject}
        </p>
      ) : null}
    </div>
  );
}

function CmsAction({
  cmsDestination,
  cmsExternalId,
  wpUrl,
  wpPostId,
}: {
  cmsDestination?: string | null;
  cmsExternalId?: string | null;
  wpUrl: string | null;
  wpPostId: number | null;
}) {
  if (cmsDestination === "webflow") {
    return (
      <span className="text-sm text-slate-600">
        {cmsExternalId ? `ID ${cmsExternalId.slice(0, 10)}…` : "Webflow"}
      </span>
    );
  }
  if (wpUrl && wpPostId) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 border-[#E2E8F0] text-sm"
        nativeButton={false}
        render={<a href={wpUrl} target="_blank" rel="noreferrer" />}
      >
        WP #{wpPostId}
        <ExternalLink data-icon="inline-end" />
      </Button>
    );
  }
  if (wpPostId) {
    return <span className="text-sm text-slate-600">#{wpPostId}</span>;
  }
  return <span className="text-sm text-slate-500">—</span>;
}

export function DashboardRecentGenerations({
  articles,
}: {
  articles: DashboardGenerationRow[];
}) {
  return (
    <Card className={dashboardCardClassName}>
      <CardHeader className={dashboardCardHeaderClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={dashboardIconBadgeClassName}>
                <History className="size-4" aria-hidden />
              </span>
              <CardTitle className="text-base font-semibold text-[#0F172A]">
                Générations récentes
              </CardTitle>
            </div>
            <CardDescription className="text-sm text-slate-500">
              Titres, destinations CMS, statuts et coûts LLM.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/articles" />}
            className="h-8 border-[#E2E8F0] text-sm"
          >
            Voir l’historique
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0 pt-0">
        {articles.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-600">
            Aucune génération pour le moment.
          </p>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                    <TableHead className="h-10 px-5 text-xs font-medium tracking-wide text-slate-600 uppercase">
                      Article
                    </TableHead>
                    <TableHead className="h-10 px-3 text-xs font-medium tracking-wide text-slate-600 uppercase">
                      CMS
                    </TableHead>
                    <TableHead className="h-10 px-3 text-xs font-medium tracking-wide text-slate-600 uppercase">
                      Statut
                    </TableHead>
                    <TableHead className="h-10 px-3 text-xs font-medium tracking-wide text-slate-600 uppercase">
                      Date
                    </TableHead>
                    <TableHead
                      className="h-10 px-3 text-xs font-medium tracking-wide text-slate-600 uppercase"
                      title="Hors éventuels frais liés aux outils."
                    >
                      Coût LLM
                    </TableHead>
                    <TableHead className="h-10 px-3 text-xs font-medium tracking-wide text-slate-600 uppercase">
                      Réf.
                    </TableHead>
                    <TableHead className="h-10 px-5 text-right text-xs font-medium tracking-wide text-slate-600 uppercase">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {articles.map((article) => (
                    <TableRow key={article.id} className="border-[#E2E8F0]">
                      <TableCell className="px-5 py-3.5">
                        <ArticleTitleCell
                          title={article.title}
                          subject={article.subject}
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3.5">
                        <CmsDestinationBadge
                          destination={article.cmsDestination}
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3.5">
                        <GenerationStatusBadge
                          status={article.status}
                          progressStage={article.progressStage}
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3.5 whitespace-nowrap text-sm text-slate-700">
                        {formatDate(article.createdAt)}
                      </TableCell>
                      <TableCell
                        className="px-3 py-3.5 text-sm text-slate-700"
                        title={
                          article.estimatedCost == null
                            ? "Coût LLM inconnu — hors images et outils."
                            : "Estimation LLM — hors images et outils."
                        }
                      >
                        {formatEstimatedCost(article.estimatedCost)}
                      </TableCell>
                      <TableCell className="px-3 py-3.5">
                        <CmsAction
                          cmsDestination={article.cmsDestination}
                          cmsExternalId={article.cmsExternalId}
                          wpUrl={article.wpUrl}
                          wpPostId={article.wpPostId}
                        />
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 border-[#E2E8F0] text-sm"
                          nativeButton={false}
                          render={<Link href={`/articles/${article.id}`} />}
                        >
                          Détail
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 p-5 md:hidden">
              {articles.map((article) => (
                <article
                  key={article.id}
                  className="rounded-lg border border-[#E2E8F0] bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <ArticleTitleCell
                      title={article.title}
                      subject={article.subject}
                    />
                    <GenerationStatusBadge
                      status={article.status}
                      progressStage={article.progressStage}
                    />
                  </div>
                  <div className="mt-2">
                    <CmsDestinationBadge
                      destination={article.cmsDestination}
                    />
                  </div>
                  {article.status === "failed" && article.error ? (
                    <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800">
                      {article.error}
                    </p>
                  ) : null}
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-600">
                    <div>
                      <dt className="text-xs text-slate-500">Date</dt>
                      <dd className="text-slate-700">
                        {formatDate(article.createdAt)}
                      </dd>
                    </div>
                    <div>
                      <dt
                        className="text-xs text-slate-500"
                        title={
                          article.estimatedCost == null
                            ? "Coût LLM inconnu — hors images et outils."
                            : "Estimation LLM — hors images et outils."
                        }
                      >
                        Coût LLM estimé
                      </dt>
                      <dd className="text-slate-700">
                        {formatEstimatedCost(article.estimatedCost)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <CmsAction
                      cmsDestination={article.cmsDestination}
                      cmsExternalId={article.cmsExternalId}
                      wpUrl={article.wpUrl}
                      wpPostId={article.wpPostId}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 border-[#E2E8F0] text-sm"
                      nativeButton={false}
                      render={<Link href={`/articles/${article.id}`} />}
                    >
                      Détail
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
