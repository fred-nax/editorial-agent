"use client";

import { useEffect, useRef, useState } from "react";
import { History, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { WatchSearchSummary } from "@/lib/veille/history";
import type {
  VeilleCountryCode,
  VeillePeriod,
  VeilleSearchResult,
} from "@/lib/veille/types";

type HistoryPayload = {
  searches?: WatchSearchSummary[];
  page?: number;
  pageSize?: number;
  total?: number;
  error?: string;
};

function formatSearchedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(date);
}

export function EditorialWatchHistory({
  refreshKey,
  busy,
  openedId,
  onMeta,
  onOpen,
  onRelaunch,
  onDeleted,
}: {
  refreshKey: number;
  busy: boolean;
  openedId: string | null;
  onMeta?: (meta: { total: number }) => void;
  onOpen: (search: { id: string; searchedAt: string; result: VeilleSearchResult }) => void;
  onRelaunch: (query: {
    theme: string;
    periodDays: VeillePeriod;
    country: VeilleCountryCode;
  }) => void;
  onDeleted: (id: string) => void;
}) {
  const firstRefresh = useRef(true);
  const onMetaRef = useRef(onMeta);
  onMetaRef.current = onMeta;
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [searches, setSearches] = useState<WatchSearchSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (firstRefresh.current) {
      firstRefresh.current = false;
      return;
    }
    setPage(1);
    setReload((value) => value + 1);
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch(`/api/veille/searches?page=${page}`, { credentials: "same-origin" })
      .then(async (response) => {
        const payload = (await response.json()) as HistoryPayload;
        if (!response.ok || !payload.searches) {
          throw new Error(payload.error ?? "Les recherches enregistrées n’ont pas pu être lues.");
        }
        return payload;
      })
      .then((payload) => {
        if (cancelled || !payload.searches) {
          return;
        }
        setSearches(payload.searches);
        const nextTotal = payload.total ?? payload.searches.length;
        setTotal(nextTotal);
        setPageSize(payload.pageSize ?? 20);
        onMetaRef.current?.({ total: nextTotal });
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setSearches([]);
          setError(
            reason instanceof Error
              ? reason.message
              : "Les recherches enregistrées n’ont pas pu être lues."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page, reload]);

  async function openSearch(id: string) {
    setOpeningId(id);
    setError(null);
    try {
      const response = await fetch(`/api/veille/searches/${id}`, {
        credentials: "same-origin",
      });
      const payload = (await response.json()) as {
        search?: { id: string; searchedAt: string; result: VeilleSearchResult };
        error?: string;
      };
      if (!response.ok || !payload.search) {
        setError(payload.error ?? "Cette recherche enregistrée est introuvable.");
        return;
      }
      onOpen(payload.search);
    } catch {
      setError("Cette recherche enregistrée est illisible.");
    } finally {
      setOpeningId(null);
    }
  }

  async function confirmDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/veille/searches/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok || !payload.deleted) {
        setError(payload.error ?? "La recherche n’a pas pu être supprimée.");
        return;
      }
      setPendingDelete(null);
      onDeleted(id);
      const nextCount = searches.length - 1;
      if (nextCount === 0 && page > 1) {
        setPage(page - 1);
      } else {
        setReload((value) => value + 1);
      }
    } catch {
      setError("La recherche n’a pas pu être supprimée.");
    } finally {
      setDeletingId(null);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section aria-labelledby="veille-history-title">
      <Card className="border border-[#E2E8F0] bg-white shadow-none ring-0">
        <CardHeader className="gap-1.5 border-b border-[#E2E8F0] p-4 sm:p-5">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F5270]">
              <History className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 space-y-1">
              <CardTitle
                id="veille-history-title"
                className="text-base font-semibold text-[#0F172A]"
              >
                Recherches enregistrées
              </CardTitle>
              <CardDescription className="text-sm text-slate-600">
                Ouvrir recharge les publications déjà vérifiées, sans nouvelle recherche.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 p-4 sm:p-5">
          {loading ? (
            <div
              className="space-y-3"
              aria-busy="true"
              aria-live="polite"
              aria-label="Chargement des recherches enregistrées…"
            >
              <p className="sr-only">Chargement des recherches enregistrées…</p>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {error}
            </div>
          ) : null}

          {!loading && searches.length === 0 && !error ? (
            <div className="rounded-lg border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-4 py-8 text-center text-sm text-slate-600">
              Aucune recherche enregistrée.
            </div>
          ) : null}

          {searches.length > 0 ? (
            <ul className="grid gap-2.5">
              {searches.map((search) => {
                const confirming = pendingDelete === search.id;
                const rowBusy =
                  busy || openingId === search.id || deletingId === search.id;
                const selected = openedId === search.id;
                return (
                  <li key={search.id}>
                    <div
                      className={`rounded-lg border bg-white p-3 transition-colors ${
                        selected
                          ? "border-naxialis ring-1 ring-naxialis/20"
                          : "border-[#E2E8F0] hover:border-slate-300"
                      }`}
                    >
                      <p className="text-sm font-semibold break-words text-slate-900">
                        {search.theme}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Recherchée le {formatSearchedAt(search.searchedAt)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge
                          variant="outline"
                          className="border-[#E2E8F0] bg-slate-50 text-slate-600"
                        >
                          {search.periodDays} jours
                        </Badge>
                        <Badge
                          variant="outline"
                          className="border-[#E2E8F0] bg-slate-50 text-slate-600"
                        >
                          {search.countryLabel}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="border-[#E2E8F0] bg-slate-50 text-slate-600"
                        >
                          {search.articleCount} publication
                          {search.articleCount > 1 ? "s" : ""}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={rowBusy}
                          onClick={() => void openSearch(search.id)}
                          className="h-8 border-[#E2E8F0] text-slate-700"
                        >
                          {openingId === search.id ? (
                            <>
                              <Loader2 className="size-3.5 animate-spin" aria-hidden />
                              Ouverture…
                            </>
                          ) : (
                            "Ouvrir"
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={rowBusy}
                          onClick={() =>
                            onRelaunch({
                              theme: search.theme,
                              periodDays: search.periodDays,
                              country: search.country,
                            })
                          }
                          className="h-8 gap-1.5 border-[#E2E8F0] text-naxialis"
                        >
                          <RotateCcw className="size-3.5" aria-hidden />
                          Relancer
                        </Button>
                        {confirming ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={deletingId === search.id}
                              onClick={() => void confirmDelete(search.id)}
                              className="h-8"
                            >
                              {deletingId === search.id
                                ? "Suppression…"
                                : "Confirmer la suppression"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={deletingId === search.id}
                              onClick={() => setPendingDelete(null)}
                              className="h-8 border-[#E2E8F0] text-slate-700"
                            >
                              Annuler
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={rowBusy}
                            onClick={() => setPendingDelete(search.id)}
                            className="h-8 gap-1.5 border-[#E2E8F0] text-slate-700"
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                            Supprimer
                          </Button>
                        )}
                      </div>
                      {confirming ? (
                        <p className="mt-2 text-xs text-slate-600">
                          Supprimer cette recherche enregistrée ?
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {total > pageSize ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-[#E2E8F0] pt-3 text-sm text-slate-600">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="h-8 border-[#E2E8F0]"
              >
                Précédent
              </Button>
              <span className="px-1">
                Page {page} / {pageCount}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page >= pageCount || loading}
                onClick={() => setPage((value) => value + 1)}
                className="h-8 border-[#E2E8F0]"
              >
                Suivant
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
