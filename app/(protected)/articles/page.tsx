import type { Metadata } from "next";
import Link from "next/link";
import { ArticleHistory } from "@/components/ArticleHistory";
import { listArticleHistory } from "@/lib/articles/history-query";
import { recoverStaleGenerations } from "@/lib/generation-recovery";
import { resolveActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Historique",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await recoverStaleGenerations();
  const workspace = await resolveActiveWorkspace();
  const cmsLabel =
    workspace.cmsProvider === "webflow" ? "Webflow" : "WordPress";

  const params = await searchParams;
  const page = Number(firstParam(params.page) ?? "1");
  const pageSize = Number(firstParam(params.pageSize) ?? "20");
  const status = firstParam(params.status) ?? "all";
  const q = firstParam(params.q) ?? "";

  const history = await listArticleHistory({
    workspaceId: workspace.id,
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 20,
    status,
    q,
  });

  const buildHref = (nextPage: number) => {
    const sp = new URLSearchParams();
    if (nextPage > 1) sp.set("page", String(nextPage));
    if (history.pageSize !== 20) sp.set("pageSize", String(history.pageSize));
    if (status && status !== "all") sp.set("status", status);
    if (q.trim()) sp.set("q", q.trim());
    const qs = sp.toString();
    return qs ? `/articles?${qs}` : "/articles";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Historique</h1>
        <p className="mt-1 text-sm text-slate-600">
          Générations {cmsLabel} de l&apos;espace {workspace.name}
          {history.total > 0
            ? ` — ${history.total} résultat${history.total > 1 ? "s" : ""}.`
            : "."}
        </p>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
        role="search"
        aria-label="Filtrer l’historique"
      >
        <div className="min-w-[12rem] flex-1">
          <label
            htmlFor="articles-q"
            className="block text-xs font-medium text-slate-600"
          >
            Recherche
          </label>
          <input
            id="articles-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Sujet ou titre"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="articles-status"
            className="block text-xs font-medium text-slate-600"
          >
            Statut
          </label>
          <select
            id="articles-status"
            name="status"
            defaultValue={status}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">Tous</option>
            <option value="completed">Terminé</option>
            <option value="failed">Échec</option>
            <option value="running">En cours</option>
            <option value="queued">En file</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="articles-pageSize"
            className="block text-xs font-medium text-slate-600"
          >
            Par page
          </label>
          <select
            id="articles-pageSize"
            name="pageSize"
            defaultValue={String(history.pageSize)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Filtrer
        </button>
      </form>

      <ArticleHistory articles={history.articles} />

      {history.pageCount > 1 ? (
        <nav
          className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600"
          aria-label="Pagination historique"
        >
          <p>
            Page {history.page} / {history.pageCount}
          </p>
          <div className="flex gap-2">
            {history.page > 1 ? (
              <Link
                href={buildHref(history.page - 1)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50"
              >
                Précédent
              </Link>
            ) : (
              <span className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-400">
                Précédent
              </span>
            )}
            {history.page < history.pageCount ? (
              <Link
                href={buildHref(history.page + 1)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50"
              >
                Suivant
              </Link>
            ) : (
              <span className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-400">
                Suivant
              </span>
            )}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
