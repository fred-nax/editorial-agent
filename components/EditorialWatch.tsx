"use client";

import { useMemo, useState } from "react";
import { EditorialWatchHistory } from "@/components/EditorialWatchHistory";
import { TopicProposalDialog } from "@/components/TopicProposalDialog";
import {
  loadVeilleSuggestions,
  VeilleSuggestionDialog,
} from "@/components/VeilleSuggestionDialog";
import type { SeoSuggestion } from "@/lib/veille/suggestions";
import { countByKind, filterArticles, kindLabel } from "@/lib/veille/classify";
import {
  buildTopicProposal,
  type VeilleTopicProposal,
} from "@/lib/veille/topic-proposal";
import {
  VEILLE_COUNTRIES,
  VEILLE_PERIODS,
  type VeilleArticle,
  type VeilleCountryCode,
  type VeilleFilter,
  type VeillePeriod,
  type VeilleSearchResult,
} from "@/lib/veille/types";
import { sortByVerifiedDate } from "@/lib/veille/verify";

type SortMode = "verified-date" | "search";

const FILTERS: Array<{ id: VeilleFilter; label: string }> = [
  { id: "all", label: "Tous" },
  { id: "news", label: "Actualités" },
  { id: "study", label: "Études et rapports" },
  { id: "guide", label: "Guides et analyses" },
  { id: "unknown", label: "Non classés" },
];

function formatVerifiedDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatRecordedAt(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));
}

function dateLabel(article: VeilleArticle): string {
  if (article.dateVerified && article.publishedOn) {
    return formatVerifiedDate(article.publishedOn);
  }
  return "Date non vérifiée";
}

export function EditorialWatch() {
  const [theme, setTheme] = useState("");
  const [periodDays, setPeriodDays] = useState<(typeof VEILLE_PERIODS)[number]>(30);
  const [country, setCountry] = useState<(typeof VEILLE_COUNTRIES)[number]["code"]>("FR");
  const [sortMode, setSortMode] = useState<SortMode>("verified-date");
  const [filter, setFilter] = useState<VeilleFilter>("all");
  const [searchOrder, setSearchOrder] = useState<VeilleArticle[]>([]);
  const [result, setResult] = useState<VeilleSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<VeilleTopicProposal | null>(null);
  const [suggestion, setSuggestion] = useState<{
    article: VeilleArticle;
    request: ReturnType<typeof loadVeilleSuggestions>;
  } | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [openedSearch, setOpenedSearch] = useState<{ id: string; searchedAt: string } | null>(
    null
  );

  const counts = useMemo(() => countByKind(searchOrder), [searchOrder]);
  const articles = useMemo(() => {
    const selected = filterArticles(searchOrder, filter);
    if (sortMode === "search") {
      return selected;
    }
    return sortByVerifiedDate(selected);
  }, [searchOrder, filter, sortMode]);

  function showResult(next: VeilleSearchResult) {
    setResult(next);
    setSearchOrder(next.articles);
    setSortMode("verified-date");
    setFilter("all");
  }

  async function search(query?: {
    theme: string;
    periodDays: VeillePeriod;
    country: VeilleCountryCode;
  }) {
    const nextTheme = query?.theme ?? theme;
    const nextPeriod = query?.periodDays ?? periodDays;
    const nextCountry = query?.country ?? country;
    if (query) {
      setTheme(query.theme);
      setPeriodDays(query.periodDays);
      setCountry(query.country);
    }
    setLoading(true);
    setError(null);
    setOpenedSearch(null);
    try {
      const response = await fetch("/api/veille/search", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: nextTheme,
          periodDays: nextPeriod,
          country: nextCountry,
        }),
      });
      const payload = (await response.json()) as {
        result?: VeilleSearchResult;
        error?: string;
      };
      if (!response.ok || !payload.result) {
        setResult(null);
        setSearchOrder([]);
        setError(payload.error ?? "La recherche n’a pas abouti.");
        return;
      }
      showResult(payload.result);
      setHistoryKey((value) => value + 1);
    } catch {
      setError("La recherche n’a pas abouti.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Veille éditoriale</h1>
        <p className="mt-1 text-sm text-slate-600">
          Recherche de publications récentes. Aucun article WordPress n’est créé.
        </p>
      </div>

      <section className="space-y-4" aria-labelledby="veille-new-search-title">
      <h2 id="veille-new-search-title" className="text-base font-semibold text-slate-900">
        Nouvelle recherche
      </h2>
      <form
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-800">
            Thématique
          </span>
          <input
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
            required
            minLength={3}
            maxLength={160}
            disabled={loading}
            placeholder="Ex. agents IA pour les PME"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-naxialis focus:ring-2 focus:ring-naxialis/20 disabled:bg-slate-50"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-800">
              Période
            </span>
            <select
              value={periodDays}
              onChange={(event) =>
                setPeriodDays(Number(event.target.value) as (typeof VEILLE_PERIODS)[number])
              }
              disabled={loading}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-naxialis focus:ring-2 focus:ring-naxialis/20"
            >
              {VEILLE_PERIODS.map((days) => (
                <option key={days} value={days}>
                  {days} jours
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-800">
              Pays
            </span>
            <select
              value={country}
              onChange={(event) =>
                setCountry(event.target.value as (typeof VEILLE_COUNTRIES)[number]["code"])
              }
              disabled={loading}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-naxialis focus:ring-2 focus:ring-naxialis/20"
            >
              {VEILLE_COUNTRIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-md bg-naxialis px-4 py-2.5 text-sm font-medium text-white hover:bg-naxialis-dark disabled:opacity-60"
        >
          {loading ? "Recherche…" : "Rechercher les actualités"}
        </button>
      </form>
      </section>

      <EditorialWatchHistory
        refreshKey={historyKey}
        busy={loading}
        openedId={openedSearch?.id ?? null}
        onOpen={(search) => {
          setOpenedSearch({ id: search.id, searchedAt: search.searchedAt });
          setError(null);
          showResult(search.result);
        }}
        onRelaunch={(query) => {
          void search(query);
        }}
        onDeleted={(id) => {
          if (openedSearch?.id === id) {
            setOpenedSearch(null);
            setResult(null);
            setSearchOrder([]);
          }
        }}
      />

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {result ? (
        <section className="space-y-4" aria-labelledby="veille-results-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="veille-results-title" className="text-base font-semibold text-slate-900">
                Résultats affichés
              </h2>
              {openedSearch ? (
                <p className="mt-1 text-sm text-slate-700">
                  {`Résultats enregistrés le ${formatRecordedAt(openedSearch.searchedAt)}. Les sources n’ont pas été revérifiées.`}
                </p>
              ) : null}
              <p className="mt-1 text-sm font-medium text-slate-900">
                {searchOrder.length === 0
                  ? "Aucun résultat confirmé"
                  : articles.length === 0
                    ? "Aucune publication dans cette catégorie"
                    : `${articles.length} publication${articles.length > 1 ? "s" : ""}`}
              </p>
              <p className="mt-1 text-sm text-slate-600">{result.notice}</p>
              {result.discarded > 0 ? (
                <p className="mt-1 text-xs text-slate-500">
                  {result.discarded} proposition{result.discarded > 1 ? "s" : ""} écartée
                  {result.discarded > 1 ? "s" : ""} (URL non confirmée, doublon ou hors
                  période).
                </p>
              ) : null}
              {result.incomplete ? (
                <p className="mt-1 text-xs text-amber-800">
                  La réponse de recherche était incomplète.
                </p>
              ) : null}
            </div>
            {searchOrder.length > 1 ? (
              <label className="block text-sm text-slate-700">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  Trier
                </span>
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="verified-date">Date vérifiée</option>
                  <option value="search">Ordre de la recherche</option>
                </select>
              </label>
            ) : null}
          </div>
          {searchOrder.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {FILTERS.filter((item) => item.id !== "unknown" || counts.unknown > 0).map(
                (item) => {
                  const count = item.id === "all" ? searchOrder.length : counts[item.id];
                  const active = filter === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setFilter(item.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        active
                          ? "border-naxialis bg-naxialis text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      {item.label} ({count})
                    </button>
                  );
                }
              )}
            </div>
          ) : null}

          {articles.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white px-5 py-8 text-sm text-slate-600">
              {searchOrder.length === 0
                ? "Aucune publication confirmée pour cette recherche."
                : "Aucune publication dans cette catégorie."}
            </p>
          ) : (
            <ul className="grid gap-3">
              {articles.map((article) => (
                <li
                  key={article.url}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900">{article.title}</h3>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {kindLabel(article.kind)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    <span className="font-medium text-naxialis">{article.sourceName}</span>
                    {" · "}
                    {dateLabel(article)}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{article.summary}</p>
                  {article.event ? (
                    <p className="mt-2 text-sm text-slate-800">
                      <span className="font-medium">Information principale : </span>
                      {article.event}
                    </p>
                  ) : null}
                  {!article.dateVerified ? (
                    <p className="mt-2 text-xs text-slate-500">
                      La fraîcheur de cette source n’est pas confirmée.
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-naxialis underline-offset-2 hover:underline"
                    >
                      Ouvrir la publication
                    </a>
                    <button
                      type="button"
                      disabled={Boolean(proposal) || suggestion !== null}
                      onClick={() =>
                        setSuggestion({
                          article,
                          request: loadVeilleSuggestions(article, result.theme),
                        })
                      }
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-naxialis hover:bg-slate-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naxialis"
                    >
                      Suggérer 3 sujets SEO
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(proposal) || suggestion !== null}
                      onClick={() => setProposal(buildTopicProposal(article, result.theme))}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naxialis"
                    >
                      Proposer un sujet
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {suggestion && result ? (
        <VeilleSuggestionDialog
          article={suggestion.article}
          theme={result.theme}
          request={suggestion.request}
          onRetry={() =>
            setSuggestion({
              article: suggestion.article,
              request: loadVeilleSuggestions(suggestion.article, result.theme),
            })
          }
          onClose={() => setSuggestion(null)}
          onSelect={(choice: SeoSuggestion) => {
            setProposal(
              buildTopicProposal(suggestion.article, result.theme, {
                subject: choice.title,
                angle: choice.angle,
              })
            );
            setSuggestion(null);
          }}
        />
      ) : null}
      {proposal ? (
        <TopicProposalDialog proposal={proposal} onClose={() => setProposal(null)} />
      ) : null}
    </div>
  );
}
