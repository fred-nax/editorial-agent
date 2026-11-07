"use client";

import { useEffect, useRef, useState } from "react";
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
  onOpen,
  onRelaunch,
  onDeleted,
}: {
  refreshKey: number;
  busy: boolean;
  openedId: string | null;
  onOpen: (search: { id: string; searchedAt: string; result: VeilleSearchResult }) => void;
  onRelaunch: (query: {
    theme: string;
    periodDays: VeillePeriod;
    country: VeilleCountryCode;
  }) => void;
  onDeleted: (id: string) => void;
}) {
  const firstRefresh = useRef(true);
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
        setTotal(payload.total ?? payload.searches.length);
        setPageSize(payload.pageSize ?? 20);
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
    <section className="space-y-3" aria-labelledby="veille-history-title">
      <div>
        <h2 id="veille-history-title" className="text-base font-semibold text-slate-900">
          Recherches enregistrées
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Ouvrir recharge les publications déjà vérifiées, sans nouvelle recherche.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-600">Chargement des recherches enregistrées…</p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {!loading && searches.length === 0 && !error ? (
        <p className="rounded-lg border border-slate-200 bg-white px-5 py-6 text-sm text-slate-600">
          Aucune recherche enregistrée.
        </p>
      ) : null}

      {searches.length > 0 ? (
        <ul className="grid gap-3">
          {searches.map((search) => {
            const confirming = pendingDelete === search.id;
            const rowBusy = busy || openingId === search.id || deletingId === search.id;
            return (
              <li
                key={search.id}
                className={`rounded-lg border bg-white p-4 ${
                  openedId === search.id ? "border-naxialis" : "border-slate-200"
                }`}
              >
                <p className="text-sm font-semibold break-words text-slate-900">{search.theme}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Recherchée le {formatSearchedAt(search.searchedAt)}
                  {" · "}
                  {search.periodDays} jours
                  {" · "}
                  {search.countryLabel}
                  {" · "}
                  {search.articleCount} publication{search.articleCount > 1 ? "s" : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={rowBusy}
                    onClick={() => void openSearch(search.id)}
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naxialis"
                  >
                    {openingId === search.id ? "Ouverture…" : "Ouvrir"}
                  </button>
                  <button
                    type="button"
                    disabled={rowBusy}
                    onClick={() =>
                      onRelaunch({
                        theme: search.theme,
                        periodDays: search.periodDays,
                        country: search.country,
                      })
                    }
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-naxialis hover:bg-slate-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naxialis"
                  >
                    Relancer
                  </button>
                  {confirming ? (
                    <>
                      <button
                        type="button"
                        disabled={deletingId === search.id}
                        onClick={() => void confirmDelete(search.id)}
                        className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naxialis"
                      >
                        {deletingId === search.id ? "Suppression…" : "Confirmer la suppression"}
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === search.id}
                        onClick={() => setPendingDelete(null)}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Annuler
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={rowBusy}
                      onClick={() => setPendingDelete(search.id)}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naxialis"
                    >
                      Supprimer
                    </button>
                  )}
                </div>
                {confirming ? (
                  <p className="mt-2 text-xs text-slate-600">
                    Supprimer cette recherche enregistrée ?
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {total > pageSize ? (
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-60"
          >
            Précédent
          </button>
          <span>
            Page {page} / {pageCount}
          </span>
          <button
            type="button"
            disabled={page >= pageCount || loading}
            onClick={() => setPage((value) => value + 1)}
            className="rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-60"
          >
            Suivant
          </button>
        </div>
      ) : null}
    </section>
  );
}
