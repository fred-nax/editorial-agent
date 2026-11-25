"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Loader2, Radar, Search } from "lucide-react";
import { EditorialWatchHistory } from "@/components/EditorialWatchHistory";
import { TopicProposalDialog } from "@/components/TopicProposalDialog";
import { VeilleHelpDialog } from "@/components/VeilleHelpDialog";
import { SearchLoadingOverlay } from "@/components/SearchLoadingOverlay";
import { useWorkspaceOptional } from "@/components/workspace";
import {
  loadVeilleSuggestions,
  VeilleSuggestionDialog,
} from "@/components/VeilleSuggestionDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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

const SUMMARY_COLLAPSE_CHARS = 220;

type SortMode = "verified-date" | "search";

const FILTERS: Array<{ id: VeilleFilter; label: string }> = [
  { id: "all", label: "Tous" },
  { id: "news", label: "Actualités" },
  { id: "study", label: "Études et rapports" },
  { id: "guide", label: "Guides et analyses" },
  { id: "unknown", label: "Non classés" },
];

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50";

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

function dateFreshness(article: VeilleArticle): {
  verified: boolean;
  label: string;
} {
  if (article.dateVerified && article.publishedOn) {
    return {
      verified: true,
      label: `Date vérifiée · ${formatVerifiedDate(article.publishedOn)}`,
    };
  }
  return { verified: false, label: "Date non vérifiée" };
}

function PublicationCard({
  article,
  actionsDisabled,
  onSuggest,
  onPropose,
}: {
  article: VeilleArticle;
  actionsDisabled: boolean;
  onSuggest: () => void;
  onPropose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const freshness = dateFreshness(article);
  const summary = article.summary.trim();
  const canCollapse = summary.length > SUMMARY_COLLAPSE_CHARS;
  const shownSummary =
    !canCollapse || expanded
      ? summary
      : `${summary.slice(0, SUMMARY_COLLAPSE_CHARS).trimEnd()}…`;

  return (
    <article className="rounded-lg border border-[#E2E8F0] bg-white p-4 transition-colors hover:border-slate-300">
      <h3 className="text-[0.95rem] font-semibold leading-snug break-words text-[#0F172A]">
        {article.title}
      </h3>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge
          variant="outline"
          className="max-w-full truncate border-[#E2E8F0] bg-slate-50 font-medium text-naxialis"
          title={article.sourceName}
        >
          {article.sourceName}
        </Badge>
        <Badge
          variant="outline"
          className={
            freshness.verified
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }
        >
          {freshness.label}
        </Badge>
        <Badge
          variant="outline"
          className="border-[#E2E8F0] bg-slate-50 text-slate-700"
        >
          {kindLabel(article.kind)}
        </Badge>
      </div>

      {summary ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-sm leading-6 text-slate-700">{shownSummary}</p>
          {canCollapse ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-slate-600"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  <ChevronUp className="size-3.5" aria-hidden />
                  Réduire
                </>
              ) : (
                <>
                  <ChevronDown className="size-3.5" aria-hidden />
                  Lire la suite
                </>
              )}
            </Button>
          ) : null}
        </div>
      ) : null}

      {article.event ? (
        <div className="mt-3 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm text-slate-800">
          <span className="font-semibold text-slate-900">
            Information principale :{" "}
          </span>
          {article.event}
        </div>
      ) : null}

      {!freshness.verified ? (
        <p className="mt-2 text-xs text-slate-500">
          La fraîcheur de cette source n’est pas confirmée.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 max-w-full gap-1.5 border-[#E2E8F0] text-naxialis"
          nativeButton={false}
          render={
            <a href={article.url} target="_blank" rel="noreferrer" />
          }
        >
          <ExternalLink className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">Ouvrir la publication</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={actionsDisabled}
          onClick={onSuggest}
          className="h-8 border-[#E2E8F0] text-naxialis"
        >
          Suggérer 3 sujets SEO
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={actionsDisabled}
          onClick={onPropose}
          className="h-8 bg-naxialis text-white hover:bg-naxialis-dark"
        >
          Proposer un sujet
        </Button>
      </div>
    </article>
  );
}

export function EditorialWatch() {
  const workspaceCtx = useWorkspaceOptional();
  const workspaceFetch = workspaceCtx?.workspaceFetch ?? fetch;
  const workspaceEpoch = workspaceCtx?.epoch ?? 0;
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
  const [historyTotal, setHistoryTotal] = useState<number | null>(null);
  const [openedSearch, setOpenedSearch] = useState<{ id: string; searchedAt: string } | null>(
    null
  );
  const [activeQuery, setActiveQuery] = useState<{
    theme: string;
    periodDays: VeillePeriod;
    country: VeilleCountryCode;
  } | null>(null);
  const searchGeneration = useRef(0);

  useEffect(() => {
    if (workspaceEpoch === 0) {
      return;
    }
    searchGeneration.current += 1;
    setResult(null);
    setSearchOrder([]);
    setError(null);
    setProposal(null);
    setSuggestion(null);
    setOpenedSearch(null);
    setActiveQuery(null);
    setHistoryKey((value) => value + 1);
  }, [workspaceEpoch]);

  const counts = useMemo(() => countByKind(searchOrder), [searchOrder]);
  const articles = useMemo(() => {
    const selected = filterArticles(searchOrder, filter);
    if (sortMode === "search") {
      return selected;
    }
    return sortByVerifiedDate(selected);
  }, [searchOrder, filter, sortMode]);

  const activeCountryLabel =
    VEILLE_COUNTRIES.find((item) => item.code === activeQuery?.country)?.label ??
    activeQuery?.country ??
    "";

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
    const generation = ++searchGeneration.current;
    setLoading(true);
    setError(null);
    setOpenedSearch(null);
    setSuggestion(null);
    setProposal(null);
    // Conserve les résultats précédents sous l’overlay flouté jusqu’à la réponse.
    setActiveQuery({
      theme: nextTheme,
      periodDays: nextPeriod,
      country: nextCountry,
    });
    try {
      const response = await workspaceFetch("/api/veille/search", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: nextTheme,
          periodDays: nextPeriod,
          country: nextCountry,
        }),
      });
      if (generation !== searchGeneration.current) {
        return;
      }
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
      if (generation !== searchGeneration.current) {
        return;
      }
      setError("La recherche n’a pas abouti.");
    } finally {
      if (generation === searchGeneration.current) {
        setLoading(false);
        setActiveQuery(null);
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-[#E2E8F0] bg-white text-[#0F5270]">
              <Radar className="size-4" aria-hidden />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Veille éditoriale
            </h1>
            <VeilleHelpDialog />
          </div>
          <p className="max-w-2xl text-sm text-slate-600">
            Recherche de publications récentes. Aucun brouillon CMS n’est créé.
          </p>
        </div>
        {(historyTotal !== null || result) && (
          <div className="flex flex-wrap items-center gap-2">
            {historyTotal !== null ? (
              <Badge
                variant="outline"
                className="border-[#E2E8F0] bg-white text-slate-600"
              >
                {historyTotal} recherche{historyTotal > 1 ? "s" : ""} enregistrée
                {historyTotal > 1 ? "s" : ""}
              </Badge>
            ) : null}
            {result ? (
              <Badge
                variant="outline"
                className="border-[#E2E8F0] bg-white text-slate-600"
              >
                {searchOrder.length} publication{searchOrder.length > 1 ? "s" : ""} affichée
                {searchOrder.length > 1 ? "s" : ""}
              </Badge>
            ) : null}
          </div>
        )}
      </div>

      <section aria-labelledby="veille-new-search-title">
        <Card className="border border-[#E2E8F0] bg-white shadow-none ring-0">
          <CardHeader className="gap-1 border-b border-[#E2E8F0] p-4 sm:p-5">
            <CardTitle
              id="veille-new-search-title"
              className="text-base font-semibold text-[#0F172A]"
            >
              Nouvelle recherche
            </CardTitle>
            <CardDescription className="text-sm text-slate-600">
              Thématique, période et zone géographique — puis lancement de la veille.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void search();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="veille-theme" className="text-slate-800">
                  Thématique
                </Label>
                <Input
                  id="veille-theme"
                  value={theme}
                  onChange={(event) => setTheme(event.target.value)}
                  required
                  minLength={3}
                  maxLength={160}
                  disabled={loading}
                  placeholder="Ex. agents IA pour les PME"
                  className="h-9 border-[#E2E8F0] bg-white"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor="veille-period" className="text-slate-800">
                    Période
                  </Label>
                  <select
                    id="veille-period"
                    value={periodDays}
                    onChange={(event) =>
                      setPeriodDays(
                        Number(event.target.value) as (typeof VEILLE_PERIODS)[number]
                      )
                    }
                    disabled={loading}
                    className={selectClassName}
                  >
                    {VEILLE_PERIODS.map((days) => (
                      <option key={days} value={days}>
                        {days} jours
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="veille-country" className="text-slate-800">
                    Zone géographique
                  </Label>
                  <select
                    id="veille-country"
                    value={country}
                    onChange={(event) =>
                      setCountry(
                        event.target.value as (typeof VEILLE_COUNTRIES)[number]["code"]
                      )
                    }
                    disabled={loading}
                    className={selectClassName}
                    aria-label="Zone géographique"
                  >
                    {VEILLE_COUNTRIES.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end sm:col-span-2 lg:col-span-1">
                  <Button
                    type="submit"
                    disabled={loading}
                    className="h-9 w-full gap-1.5 bg-naxialis text-white hover:bg-naxialis-dark lg:min-w-[13.5rem]"
                  >
                    {loading ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Search className="size-3.5" aria-hidden />
                    )}
                    {loading ? "Recherche…" : "Rechercher les actualités"}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <aside className="order-2 min-w-0 space-y-6 lg:order-1 lg:col-span-3">
          <EditorialWatchHistory
            refreshKey={historyKey}
            busy={loading}
            openedId={openedSearch?.id ?? null}
            onMeta={({ total }) => setHistoryTotal(total)}
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
        </aside>

        <div className="order-1 min-w-0 space-y-4 lg:order-2 lg:col-span-9">
          {error && !loading ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {error}
            </div>
          ) : null}

          {result ? (
            <section className="space-y-4" aria-labelledby="veille-results-title">
              <Card className="border border-[#E2E8F0] bg-white shadow-none ring-0">
                <CardHeader className="gap-3 border-b border-[#E2E8F0] p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <CardTitle
                        id="veille-results-title"
                        className="text-base font-semibold text-[#0F172A]"
                      >
                        Résultats affichés
                      </CardTitle>
                      {openedSearch ? (
                        <p className="text-sm text-slate-700">
                          {`Résultats enregistrés le ${formatRecordedAt(openedSearch.searchedAt)}. Les sources n’ont pas été revérifiées.`}
                        </p>
                      ) : null}
                      <p className="text-sm font-medium text-slate-900">
                        {searchOrder.length === 0
                          ? "Aucun résultat confirmé"
                          : articles.length === 0
                            ? "Aucune publication dans cette catégorie"
                            : `${articles.length} publication${articles.length > 1 ? "s" : ""}`}
                      </p>
                      <p className="text-sm text-slate-600">{result.notice}</p>
                      {result.discarded > 0 ? (
                        <p className="text-xs text-slate-500">
                          {result.discarded} proposition
                          {result.discarded > 1 ? "s" : ""} écartée
                          {result.discarded > 1 ? "s" : ""} (URL non confirmée, doublon ou
                          hors période).
                        </p>
                      ) : null}
                      {result.incomplete ? (
                        <p className="text-xs text-amber-800">
                          La réponse de recherche était incomplète.
                        </p>
                      ) : null}
                    </div>
                    {searchOrder.length > 1 ? (
                      <div className="w-full shrink-0 sm:w-48">
                        <Label
                          htmlFor="veille-sort"
                          className="mb-1.5 text-xs font-medium text-slate-500"
                        >
                          Trier
                        </Label>
                        <select
                          id="veille-sort"
                          value={sortMode}
                          onChange={(event) =>
                            setSortMode(event.target.value as SortMode)
                          }
                          className={selectClassName}
                        >
                          <option value="verified-date">Date vérifiée</option>
                          <option value="search">Ordre de la recherche</option>
                        </select>
                      </div>
                    ) : null}
                  </div>

                  {searchOrder.length > 0 ? (
                    <>
                      <Separator className="bg-[#E2E8F0]" />
                      <div
                        className="flex flex-wrap gap-2"
                        role="group"
                        aria-label="Filtrer par type de publication"
                      >
                        {FILTERS.filter(
                          (item) => item.id !== "unknown" || counts.unknown > 0
                        ).map((item) => {
                          const count =
                            item.id === "all" ? searchOrder.length : counts[item.id];
                          const active = filter === item.id;
                          return (
                            <Button
                              key={item.id}
                              type="button"
                              size="sm"
                              variant={active ? "default" : "outline"}
                              onClick={() => setFilter(item.id)}
                              aria-pressed={active}
                              className={
                                active
                                  ? "h-7 rounded-full bg-naxialis text-white hover:bg-naxialis-dark"
                                  : "h-7 rounded-full border-[#E2E8F0] bg-white text-slate-700"
                              }
                            >
                              {item.label} ({count})
                            </Button>
                          );
                        })}
                      </div>
                    </>
                  ) : null}
                </CardHeader>

                <CardContent className="p-4 sm:p-5">
                  {articles.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-5 py-10 text-center text-sm text-slate-600">
                      {searchOrder.length === 0
                        ? "Aucune publication confirmée pour cette recherche."
                        : "Aucune publication dans cette catégorie."}
                    </div>
                  ) : (
                    <ul className="grid gap-3">
                      {articles.map((article) => (
                        <li key={article.url} className="min-w-0">
                          <PublicationCard
                            article={article}
                            actionsDisabled={
                              Boolean(proposal) || suggestion !== null
                            }
                            onSuggest={() =>
                              setSuggestion({
                                article,
                                request: loadVeilleSuggestions(
                                  article,
                                  result.theme
                                ),
                              })
                            }
                            onPropose={() =>
                              setProposal(
                                buildTopicProposal(article, result.theme)
                              )
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </section>
          ) : !error ? (
            <Card className="min-h-[22rem] border border-dashed border-[#E2E8F0] bg-white shadow-none ring-0">
              <CardContent className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
                <span className="inline-flex size-10 items-center justify-center rounded-md border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F5270]">
                  <Search className="size-4" aria-hidden />
                </span>
                <p className="text-sm font-medium text-slate-900">
                  Aucun résultat affiché
                </p>
                <p className="max-w-sm text-sm text-slate-600">
                  Lancez une nouvelle recherche ou ouvrez une recherche enregistrée
                  pour afficher les publications.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {loading && activeQuery ? (
        <SearchLoadingOverlay
          open={loading}
          title="Recherche d'actualités en cours…"
          primaryLabel={activeQuery.theme}
          detailLabel={`${activeCountryLabel} · ${activeQuery.periodDays} jours`}
        />
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
