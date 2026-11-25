"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  InventoryErrorBanner,
  InventoryListShell,
  InventoryPagination,
  InventorySearchInput,
  InventoryStatCard,
  InventoryStatusBadge,
  InventorySyncMeta,
  formatInventoryDate,
} from "@/components/inventory/shared";

type DiagnosticPayload = {
  count: number;
  byStatus: Record<string, number>;
  running: { id: string } | null;
  diagnostic: {
    lastFinishedAt: string | null;
    lastStatus?: string | null;
    note?: string | null;
    lastError?: string | null;
  };
};

type InventoryItem = {
  id: string;
  wpPostId: number;
  title: string;
  slug: string;
  url: string | null;
  status: string;
  contentType: string;
  excerpt: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  categoryIds: number[];
  categoryLabels: string[];
  publishedAt: string | null;
  modifiedAt: string | null;
  syncedAt: string;
  adminUrl: string | null;
};

type CategoryOption = { id: number; name: string };

const STATUS_LABELS: Record<string, string> = {
  publish: "Publié",
  draft: "Brouillon",
  future: "Planifié",
  private: "Privé",
  pending: "En attente",
};

const TYPE_LABELS: Record<string, string> = {
  post: "Article",
  page: "Page",
};

/**
 * Panneau inventaire WordPress sur /inventory.
 * Tableau + filtres + détail ; sync via APIs existantes.
 */
export function WordPressInventoryPanel() {
  const [diag, setDiag] = useState<DiagnosticPayload | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [contentType, setContentType] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("modified_desc");
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDiagnostic = useCallback(async () => {
    const response = await fetch("/api/wordpress-inventory/sync", {
      cache: "no-store",
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(
        body?.error ?? "Chargement inventaire WordPress impossible."
      );
    }
    return (await response.json()) as DiagnosticPayload;
  }, []);

  const loadItems = useCallback(
    async (opts: {
      page: number;
      q: string;
      status: string;
      contentType: string;
      category: string;
      sort: string;
    }) => {
      const params = new URLSearchParams({
        page: String(opts.page),
        pageSize: "20",
        sort: opts.sort,
      });
      if (opts.q.trim()) {
        params.set("q", opts.q.trim());
      }
      if (opts.status !== "all") {
        params.set("status", opts.status);
      }
      if (opts.contentType !== "all") {
        params.set("contentType", opts.contentType);
      }
      if (opts.category !== "all") {
        params.set("category", opts.category);
      }
      const response = await fetch(
        `/api/wordpress-inventory/items?${params.toString()}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Impossible de charger la liste.");
      }
      return (await response.json()) as {
        items: InventoryItem[];
        total: number;
        page: number;
        pageCount: number;
        categoryOptions: CategoryOption[];
      };
    },
    []
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextDiag, nextItems] = await Promise.all([
        loadDiagnostic(),
        loadItems({
          page,
          q: search,
          status,
          contentType,
          category,
          sort,
        }),
      ]);
      setDiag(nextDiag);
      setRunning(Boolean(nextDiag.running));
      setItems(nextItems.items);
      setTotal(nextItems.total);
      setPage(nextItems.page);
      setPageCount(nextItems.pageCount);
      setCategoryOptions(nextItems.categoryOptions ?? []);
      setSelectedId((current) => {
        if (!current) {
          return null;
        }
        return nextItems.items.some((item) => item.id === current)
          ? current
          : null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setLoading(false);
    }
  }, [
    loadDiagnostic,
    loadItems,
    page,
    search,
    status,
    contentType,
    category,
    sort,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!running) {
      return;
    }
    const timer = setInterval(() => {
      void refresh();
    }, 2500);
    return () => clearInterval(timer);
  }, [running, refresh]);

  async function handleSync(mode: "incremental" | "full") {
    setError(null);
    setRunning(true);
    try {
      const response = await fetch("/api/wordpress-inventory/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok && response.status !== 202) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Synchronisation refusée.");
      }
      await refresh();
    } catch (err) {
      setRunning(false);
      setError(err instanceof Error ? err.message : "Sync impossible.");
    }
  }

  const byStatus = diag?.byStatus ?? {};
  const count = diag?.count ?? 0;
  const selected = items.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F172A]">
            Inventaire WordPress
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Inventaire local des posts et pages. La synchronisation reste aussi
            disponible depuis{" "}
            <Link
              href="/opportunities"
              className="text-[#0F5270] underline underline-offset-2"
            >
              Opportunités SEO
            </Link>
            .
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={running}
            onClick={() => void handleSync("incremental")}
          >
            Sync incrémentale
          </Button>
          <Button
            type="button"
            disabled={running}
            onClick={() => void handleSync("full")}
            className="bg-[#0F5270] text-white hover:bg-[#0C425A]"
          >
            {running ? "Synchronisation…" : "Sync complète"}
          </Button>
        </div>
      </div>

      {error ? <InventoryErrorBanner message={error} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InventoryStatCard label="Total" value={count} />
        <InventoryStatCard label="Publiés" value={byStatus.publish ?? 0} />
        <InventoryStatCard label="Brouillons" value={byStatus.draft ?? 0} />
        <InventoryStatCard
          label="Autres"
          value={Math.max(
            0,
            count - (byStatus.publish ?? 0) - (byStatus.draft ?? 0)
          )}
        />
      </div>

      <InventorySyncMeta
        lastFinishedAt={diag?.diagnostic?.lastFinishedAt ?? null}
        lastStatus={diag?.diagnostic?.lastStatus ?? null}
        note={diag?.diagnostic?.note ?? null}
        lastError={diag?.diagnostic?.lastError ?? null}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
        <InventorySearchInput
          value={search}
          onChange={(value) => {
            setPage(1);
            setSearch(value);
          }}
        />
        <Select
          value={status}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setPage(1);
              setStatus(value);
            }
          }}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="publish">Publié</SelectItem>
            <SelectItem value="draft">Brouillon</SelectItem>
            <SelectItem value="future">Planifié</SelectItem>
            <SelectItem value="private">Privé</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={contentType}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setPage(1);
              setContentType(value);
            }
          }}
        >
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="post">Article</SelectItem>
            <SelectItem value="page">Page</SelectItem>
          </SelectContent>
        </Select>
        {categoryOptions.length > 0 ? (
          <Select
            value={category}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setPage(1);
                setCategory(value);
              }
            }}
          >
            <SelectTrigger className="sm:w-52">
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les catégories</SelectItem>
              {categoryOptions.map((option) => (
                <SelectItem key={option.id} value={String(option.id)}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Select
          value={sort}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setPage(1);
              setSort(value);
            }
          }}
        >
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Tri" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="modified_desc">Modifié (récent)</SelectItem>
            <SelectItem value="modified_asc">Modifié (ancien)</SelectItem>
            <SelectItem value="published_desc">Publié (récent)</SelectItem>
            <SelectItem value="published_asc">Publié (ancien)</SelectItem>
            <SelectItem value="title_asc">Titre A→Z</SelectItem>
            <SelectItem value="title_desc">Titre Z→A</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <InventoryListShell
        loading={loading}
        empty={items.length === 0}
        emptyMessage="Aucun contenu dans l’inventaire. Lancez une synchronisation ou assouplissez les filtres."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs tracking-wide text-[#64748B] uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Titre</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Catégorie</th>
                <th className="px-4 py-3 font-medium">Publié</th>
                <th className="px-4 py-3 font-medium">Modifié</th>
                <th className="px-4 py-3 font-medium">Liens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {items.map((item) => {
                const isSelected = item.id === selectedId;
                return (
                  <tr
                    key={item.id}
                    className={
                      isSelected
                        ? "bg-[#F0F9FF]"
                        : "hover:bg-[#F8FAFC] cursor-pointer"
                    }
                    onClick={() =>
                      setSelectedId((current) =>
                        current === item.id ? null : item.id
                      )
                    }
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#0F172A]">{item.title}</p>
                      <p className="mt-0.5 text-xs text-[#94A3B8]">
                        {item.slug}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[#475569]">
                      {TYPE_LABELS[item.contentType] ?? item.contentType}
                    </td>
                    <td className="px-4 py-3">
                      <InventoryStatusBadge
                        status={item.status}
                        label={STATUS_LABELS[item.status] ?? item.status}
                      />
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3 text-[#475569]">
                      {item.categoryLabels.length > 0
                        ? item.categoryLabels.join(", ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#64748B]">
                      {formatInventoryDate(item.publishedAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#64748B]">
                      {formatInventoryDate(item.modifiedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className="flex flex-col gap-1 text-xs"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#0F5270] underline"
                          >
                            Publié
                          </a>
                        ) : (
                          <span className="text-[#94A3B8]">Pas d’URL</span>
                        )}
                        {item.adminUrl ? (
                          <a
                            href={item.adminUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#0F5270] underline"
                          >
                            Admin WP
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </InventoryListShell>

      <InventoryPagination
        total={total}
        page={page}
        pageCount={pageCount}
        unitLabel="contenu"
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />

      {selected ? (
        <div className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#0F172A]">
                {selected.title}
              </h2>
              <p className="mt-0.5 text-xs text-[#94A3B8]">
                {TYPE_LABELS[selected.contentType] ?? selected.contentType} ·{" "}
                {selected.slug} · WP #{selected.wpPostId}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedId(null)}
            >
              Fermer
            </Button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium tracking-wide text-[#94A3B8] uppercase">
                Résumé
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-[#475569]">
                {selected.excerpt?.trim() || "Aucun extrait synchronisé."}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide text-[#94A3B8] uppercase">
                Métadonnées SEO
              </p>
              <p className="mt-1 text-sm text-[#475569]">
                Meta title :{" "}
                {selected.metaTitle?.trim() ||
                  "non synchronisé (hors WordPressPost)"}
              </p>
              <p className="mt-1 text-sm text-[#475569]">
                Meta description :{" "}
                {selected.metaDescription?.trim() ||
                  "non synchronisée (hors WordPressPost)"}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            {selected.url ? (
              <a
                href={selected.url}
                target="_blank"
                rel="noreferrer"
                className="text-[#0F5270] underline"
              >
                Voir le contenu publié
              </a>
            ) : null}
            {selected.adminUrl ? (
              <a
                href={selected.adminUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#0F5270] underline"
              >
                Ouvrir dans l’admin WordPress
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
