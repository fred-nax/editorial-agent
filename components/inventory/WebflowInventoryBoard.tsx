"use client";

import { useCallback, useEffect, useState } from "react";
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
  lastSync: {
    status: string;
    startedAt: string;
    finishedAt: string | null;
    mode: string;
  } | null;
  running: { id: string; startedAt: string } | null;
  diagnostic: {
    createdCount: number | null;
    updatedCount: number | null;
    unchangedCount: number | null;
    missingCount: number | null;
    note: string | null;
    lastError: string | null;
    lastFinishedAt: string | null;
  };
};

type InventoryItem = {
  id: string;
  webflowItemId: string;
  title: string;
  slug: string;
  url: string | null;
  status: string;
  excerpt: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  lastUpdatedAt: string | null;
  lastPublishedAt: string | null;
  isLive: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  published: "Publié",
  draft: "Brouillon",
  archived: "Archivé",
  changed: "Publié (modifs non publiées)",
  missing: "Absent distant",
};

export function WebflowInventoryBoard() {
  const [diag, setDiag] = useState<DiagnosticPayload | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDiagnostic = useCallback(async () => {
    const response = await fetch("/api/webflow-inventory/sync", {
      cache: "no-store",
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(body?.error ?? "Impossible de charger le diagnostic.");
    }
    return (await response.json()) as DiagnosticPayload;
  }, []);

  const loadItems = useCallback(
    async (nextPage: number, q: string, statusFilter: string) => {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: "20",
      });
      if (q.trim()) {
        params.set("q", q.trim());
      }
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      const response = await fetch(
        `/api/webflow-inventory/items?${params.toString()}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Impossible de charger l’inventaire.");
      }
      return (await response.json()) as {
        items: InventoryItem[];
        total: number;
        page: number;
        pageCount: number;
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
        loadItems(page, search, status),
      ]);
      setDiag(nextDiag);
      setSyncing(Boolean(nextDiag.running));
      setItems(nextItems.items);
      setTotal(nextItems.total);
      setPage(nextItems.page);
      setPageCount(nextItems.pageCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }, [loadDiagnostic, loadItems, page, search, status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!syncing) {
      return;
    }
    const timer = setInterval(() => {
      void refresh();
    }, 2500);
    return () => clearInterval(timer);
  }, [syncing, refresh]);

  async function handleSync() {
    setError(null);
    setSyncing(true);
    try {
      const response = await fetch("/api/webflow-inventory/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      });
      if (!response.ok && response.status !== 202) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Synchronisation refusée.");
      }
      await refresh();
    } catch (err) {
      setSyncing(false);
      setError(err instanceof Error ? err.message : "Sync impossible.");
    }
  }

  const byStatus = diag?.byStatus ?? {};
  const published = byStatus.published ?? 0;
  const drafts = byStatus.draft ?? 0;
  const archived = byStatus.archived ?? 0;
  const changed = byStatus.changed ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F172A]">
            Inventaire Webflow
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Synchronisation lecture seule de la collection CMS de l’espace
            actif. Aucun inventaire WordPress n’est réutilisé.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => void handleSync()}
          disabled={syncing}
          className="bg-[#0F5270] text-white hover:bg-[#0C425A]"
        >
          {syncing ? "Synchronisation…" : "Synchroniser"}
        </Button>
      </div>

      {error ? <InventoryErrorBanner message={error} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <InventoryStatCard label="Total" value={diag?.count ?? 0} />
        <InventoryStatCard label="Publiés" value={published} />
        <InventoryStatCard label="Brouillons" value={drafts} />
        <InventoryStatCard label="Archivés" value={archived} />
        <InventoryStatCard label="Modifs non publiées" value={changed} />
      </div>

      <InventorySyncMeta
        lastFinishedAt={diag?.diagnostic.lastFinishedAt ?? null}
        lastStatus={diag?.lastSync?.status ?? null}
        note={diag?.diagnostic.note ?? null}
        lastError={diag?.diagnostic.lastError ?? null}
        extra={
          diag?.diagnostic.createdCount != null ? (
            <p className="mt-1 text-[#64748B]">
              +{diag.diagnostic.createdCount} créés ·{" "}
              {diag.diagnostic.updatedCount ?? 0} modifiés ·{" "}
              {diag.diagnostic.unchangedCount ?? 0} inchangés ·{" "}
              {diag.diagnostic.missingCount ?? 0} absents distants
            </p>
          ) : null
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row">
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
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="published">Publié</SelectItem>
            <SelectItem value="draft">Brouillon</SelectItem>
            <SelectItem value="changed">Modifs non publiées</SelectItem>
            <SelectItem value="archived">Archivé</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <InventoryListShell
        loading={loading}
        empty={items.length === 0}
        emptyMessage="Aucun article dans l’inventaire. Lancez une synchronisation ou vérifiez le mapping CMS."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs tracking-wide text-[#64748B] uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Titre</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Publié</th>
                <th className="px-4 py-3 font-medium">Modifié</th>
                <th className="px-4 py-3 font-medium">Lien</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {items.map((item) => (
                <tr key={item.id} className="align-top hover:bg-[#F8FAFC]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#0F172A]">{item.title}</p>
                    <p className="mt-0.5 text-xs text-[#94A3B8]">{item.slug}</p>
                    {item.excerpt ? (
                      <p className="mt-2 line-clamp-2 text-sm text-[#64748B]">
                        {item.excerpt}
                      </p>
                    ) : null}
                    {(item.metaTitle || item.metaDescription) && (
                      <p className="mt-2 text-xs text-[#94A3B8]">
                        SEO : {item.metaTitle ?? "—"}
                        {item.metaDescription
                          ? ` · ${item.metaDescription.slice(0, 80)}`
                          : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <InventoryStatusBadge
                      status={item.status}
                      label={STATUS_LABELS[item.status] ?? item.status}
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#64748B]">
                    {formatInventoryDate(item.lastPublishedAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#64748B]">
                    {formatInventoryDate(item.lastUpdatedAt)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#0F5270] underline"
                      >
                        URL publique
                      </a>
                    ) : (
                      <span className="text-[#94A3B8]">URL non vérifiée</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </InventoryListShell>

      <InventoryPagination
        total={total}
        page={page}
        pageCount={pageCount}
        unitLabel="article"
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
    </div>
  );
}
