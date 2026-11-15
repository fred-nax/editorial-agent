"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ResearchConfigModal } from "@/components/ResearchConfigModal";
import { SearchLoadingOverlay } from "@/components/SearchLoadingOverlay";
import { Search, SlidersHorizontal } from "lucide-react";
import { OpportunityDetailPanel } from "@/components/opportunities/opportunity-detail-panel";
import type { SeoOpportunityItem } from "@/components/opportunities/opportunity-display";
import { OpportunityHelpDialog } from "@/components/opportunities/opportunity-help-dialog";
import { OpportunityResultList } from "@/components/opportunities/opportunity-result-list";
import {
  OpportunitySummaryCards,
  type OpportunitySummaryCounts,
} from "@/components/opportunities/opportunity-summary-cards";
import { SeoResetMenu } from "@/components/opportunities/seo-reset-menu";
import {
  ThemeManagerDialog,
  type ManagedTheme,
} from "@/components/opportunities/theme-manager-dialog";
import { WordPressSyncMenu } from "@/components/opportunities/wordpress-sync-menu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { parseResponseJson } from "@/lib/http/parse-response-json";
import {
  researchGoalLabel,
  type ResearchConfiguration,
  type ResearchGoal,
} from "@/lib/seo/research-config";

type SyncRun = {
  id: string;
  status: string;
  mode: string;
  fetchedCount: number;
  upsertedCount: number;
  expectedTotal?: number | null;
  storedCount?: number | null;
  pagesFetched?: number | null;
  totalPages?: number | null;
  statusBreakdown?: Record<string, number> | null;
  diagnosticNote?: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type SearchRun = {
  id: string;
  status: string;
  foundCount: number;
  themes?: unknown;
  mode?: string | null;
  researchGoal?: string | null;
  customTopic?: string | null;
  researchInstructions?: string | null;
  requestedCount?: number | null;
  configSnapshot?: unknown;
  skippedExisting?: number | null;
  rejectedCount?: number | null;
  domainBreakdown?: Record<string, number> | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type SavedConfig = {
  id: string;
  name: string;
  mode: "domains" | "free";
  researchGoal: "seo" | "trends" | "problems" | "commercial";
  domains: unknown;
  customTopic: string | null;
  researchInstructions: string | null;
  requestedCount: number;
  customThemeId: string | null;
};

type CustomTheme = ManagedTheme;

type InventoryDiagnostic = {
  expectedTotal: number | null;
  fetchedCount: number | null;
  upsertedCount: number | null;
  storedCount: number | null;
  pagesFetched: number | null;
  totalPages: number | null;
  statusBreakdown: Record<string, number> | null;
  note: string | null;
  lastError: string | null;
  lastStatus: string | null;
  lastFinishedAt: string | null;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

type ListPayload = {
  opportunities: SeoOpportunityItem[];
  lastSearch: SearchRun | null;
  runningSearch: SearchRun | null;
  inventoryCount: number;
  recentRuns?: SearchRun[];
  customThemes?: CustomTheme[];
  savedConfigs?: SavedConfig[];
  total?: number;
  page?: number;
  pageSize?: number;
  pageCount?: number;
  summaryCounts?: OpportunitySummaryCounts;
  error?: string;
};

type InventoryPayload = {
  count: number;
  byStatus?: Record<string, number>;
  lastSync: SyncRun | null;
  running: SyncRun | null;
  diagnostic?: InventoryDiagnostic;
  error?: string;
};

function searchStatusLabel(run: SearchRun | null, running: SearchRun | null): string {
  if (running) {
    return "Recherche en cours…";
  }
  if (!run) {
    return "Aucune recherche";
  }
  if (run.status === "completed") {
    return `Recherche terminée · ${run.foundCount} nouvelle(s)`;
  }
  if (run.status === "failed") {
    return `Recherche échouée${run.error ? ` · ${run.error}` : ""}`;
  }
  if (run.status === "running") {
    return "Recherche en cours…";
  }
  return `Statut : ${run.status}`;
}

type SeoOverlayCopy = {
  primaryLabel: string;
  detailLabel: string | null;
};

function isResearchGoal(value: unknown): value is ResearchGoal {
  return (
    value === "seo" ||
    value === "trends" ||
    value === "problems" ||
    value === "commercial"
  );
}

function seoOverlayDetail(
  goal: unknown,
  requestedCount: number | null | undefined
): string | null {
  const parts: string[] = [];
  if (isResearchGoal(goal)) {
    parts.push(researchGoalLabel(goal));
  }
  if (typeof requestedCount === "number" && requestedCount > 0) {
    parts.push(`${requestedCount} piste${requestedCount > 1 ? "s" : ""}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Libellés overlay à partir d’une config client (POST) ou d’un run serveur. */
function seoSearchOverlayCopy(
  run: SearchRun | null,
  pending: ResearchConfiguration | null
): SeoOverlayCopy {
  const mode = run?.mode ?? pending?.mode ?? "domains";
  if (mode === "free") {
    const topic =
      (run?.customTopic && run.customTopic.trim()) ||
      (pending?.customTopic && pending.customTopic.trim()) ||
      "Sujet libre";
    return {
      primaryLabel: topic,
      detailLabel: seoOverlayDetail(
        run?.researchGoal ?? pending?.researchGoal,
        run?.requestedCount ?? pending?.requestedCount
      ),
    };
  }
  return {
    primaryLabel: "Recherche multithématique",
    detailLabel: seoOverlayDetail(
      run?.researchGoal ?? pending?.researchGoal,
      run?.requestedCount ?? pending?.requestedCount
    ),
  };
}

export function OpportunitiesBoard() {
  const [opportunities, setOpportunities] = useState<SeoOpportunityItem[]>([]);
  const [inventoryCount, setInventoryCount] = useState(0);
  const [diagnostic, setDiagnostic] = useState<InventoryDiagnostic | null>(null);
  const [lastSync, setLastSync] = useState<SyncRun | null>(null);
  const [runningSync, setRunningSync] = useState<SyncRun | null>(null);
  const [lastSearch, setLastSearch] = useState<SearchRun | null>(null);
  const [runningSearch, setRunningSearch] = useState<SearchRun | null>(null);
  const [recentRuns, setRecentRuns] = useState<SearchRun[]>([]);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
  const [theme, setTheme] = useState("");
  const [status, setStatus] = useState("");
  const [contentType, setContentType] = useState("");
  const [trendType, setTrendType] = useState("");
  const [urgency, setUrgency] = useState("");
  const [runIdFilter, setRunIdFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searching, setSearching] = useState(false);
  /** Config locale le temps du POST, avant que `runningSearch` soit renseigné. */
  const [pendingSearchConfig, setPendingSearchConfig] =
    useState<ResearchConfiguration | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [themeManagerOpen, setThemeManagerOpen] = useState(false);
  const [resumeConfigAfterThemes, setResumeConfigAfterThemes] =
    useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(20);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [summaryCounts, setSummaryCounts] = useState<OpportunitySummaryCounts>({
    detected: 0,
    highPriority: 0,
    toHandle: 0,
  });

  const loadInventory = useCallback(async () => {
    const response = await fetch("/api/wordpress-inventory/sync");
    const payload = await parseResponseJson<InventoryPayload>(
      response,
      "Impossible de charger l’inventaire"
    );
    setInventoryCount(payload.count);
    setLastSync(payload.lastSync);
    setRunningSync(payload.running);
    setDiagnostic(payload.diagnostic ?? null);
  }, []);

  const loadOpportunities = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (theme) {
      params.set("theme", theme);
    }
    if (status) {
      params.set("status", status);
    }
    if (contentType) {
      params.set("contentType", contentType);
    }
    if (trendType) {
      params.set("trendType", trendType);
    }
    if (urgency) {
      params.set("urgency", urgency);
    }
    if (runIdFilter) {
      params.set("runId", runIdFilter);
    }
    const response = await fetch(`/api/opportunities?${params.toString()}`);
    const payload = await parseResponseJson<ListPayload>(
      response,
      "Impossible de charger les opportunités"
    );
    const items = payload.opportunities ?? [];
    const nextTotal = payload.total ?? items.length;
    const nextPageCount = Math.max(
      1,
      payload.pageCount ?? (Math.ceil(nextTotal / pageSize) || 1)
    );
    const nextPage = Math.min(
      Math.max(1, payload.page ?? page),
      nextPageCount
    );

    setOpportunities(items);
    setTotal(nextTotal);
    setPageCount(nextPageCount);
    if (nextPage !== page) {
      setPage(nextPage);
    }
    setLastSearch(payload.lastSearch);
    setRunningSearch(payload.runningSearch);
    setInventoryCount(payload.inventoryCount ?? 0);
    setRecentRuns(payload.recentRuns ?? []);
    setSavedConfigs(payload.savedConfigs ?? []);
    setCustomThemes(payload.customThemes ?? []);
    if (payload.summaryCounts) {
      setSummaryCounts(payload.summaryCounts);
    }
    setSelectedId((prev) =>
      prev && items.some((item) => item.id === prev) ? prev : null
    );
  }, [
    page,
    pageSize,
    theme,
    status,
    contentType,
    trendType,
    urgency,
    runIdFilter,
  ]);

  const refresh = useCallback(async () => {
    setError(null);
    await Promise.all([loadInventory(), loadOpportunities()]);
  }, [loadInventory, loadOpportunities]);

  // Filtres / taille de page → revenir à la page 1 (évite une page vide).
  useEffect(() => {
    setPage(1);
  }, [theme, status, contentType, trendType, urgency, runIdFilter, pageSize]);

  useEffect(() => {
    if (!selectedId) {
      setMobileDetailOpen(false);
    }
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erreur de chargement.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!runningSync && !runningSearch) {
      return;
    }
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [runningSync, runningSearch, refresh]);

  const wasRunningSearch = useRef(false);
  const wasRunningSync = useRef(false);

  useEffect(() => {
    if (runningSearch) {
      wasRunningSearch.current = true;
      setMessage("Recherche en cours…");
      // Le run serveur porte les libellés (y compris après reload).
      setPendingSearchConfig(null);
      return;
    }
    if (wasRunningSearch.current && lastSearch) {
      wasRunningSearch.current = false;
      setPendingSearchConfig(null);
      if (lastSearch.status === "completed") {
        setMessage(
          `Recherche terminée : ${lastSearch.foundCount} opportunité(s) créée(s).`
        );
      } else if (lastSearch.status === "failed") {
        setMessage(null);
        setError(lastSearch.error ?? "Recherche échouée.");
      } else {
        setMessage(null);
      }
    }
  }, [runningSearch, lastSearch]);

  useEffect(() => {
    if (runningSync) {
      wasRunningSync.current = true;
      setMessage("Synchronisation en cours…");
      return;
    }
    if (wasRunningSync.current && lastSync) {
      wasRunningSync.current = false;
      if (lastSync.status === "completed") {
        setMessage(
          `Synchronisation terminée : ${lastSync.fetchedCount} récupéré(s), ${lastSync.storedCount ?? inventoryCount} en base.`
        );
      } else if (lastSync.status === "failed") {
        setMessage(null);
        setError(lastSync.error ?? "Synchronisation échouée.");
      } else {
        setMessage(null);
      }
    }
  }, [runningSync, lastSync, inventoryCount]);

  async function handleSync(mode: "incremental" | "full") {
    setSyncing(true);
    setError(null);
    setMessage(
      mode === "full"
        ? "Synchronisation complète démarrée…"
        : "Synchronisation incrémentale démarrée…"
    );
    try {
      const response = await fetch("/api/wordpress-inventory/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const payload = (await response.json()) as {
        error?: string;
        run?: SyncRun;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Synchronisation impossible.");
      }
      setRunningSync(payload.run ?? null);
      await refresh();
    } catch (err) {
      setMessage(null);
      setError(err instanceof Error ? err.message : "Erreur synchronisation.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSearch(config?: ResearchConfiguration) {
    if (searching || runningSearch) {
      return;
    }
    setSearching(true);
    setPendingSearchConfig(config ?? null);
    setError(null);
    setMessage("Recherche démarrée…");
    try {
      const response = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config ?? {}),
      });
      const payload = (await response.json()) as {
        error?: string;
        run?: SearchRun;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Recherche impossible.");
      }
      setRunningSearch(payload.run ?? null);
      if (payload.run?.id) {
        setRunIdFilter(payload.run.id);
      }
      await refresh();
    } catch (err) {
      setPendingSearchConfig(null);
      setMessage(null);
      setError(err instanceof Error ? err.message : "Erreur recherche.");
    } finally {
      setSearching(false);
    }
  }

  async function handleQueue(id: string) {
    setPendingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/opportunities/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "queue" }),
      });
      const payload = (await response.json()) as {
        error?: string;
        alreadyAdded?: boolean;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Ajout à la file impossible.");
      }
      setMessage(
        payload.alreadyAdded
          ? "Déjà présent dans la file de sujets."
          : "Opportunité ajoutée à la file (sans génération)."
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur ajout file.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleDismiss(id: string) {
    setPendingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/opportunities/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Impossible d’écarter.");
      }
      if (selectedId === id) {
        clearSelection();
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setPendingId(null);
    }
  }

  const busy = syncing || searching || !!runningSync || !!runningSearch;
  const searchOverlayOpen = searching || Boolean(runningSearch);
  const seoOverlay = seoSearchOverlayCopy(
    runningSearch,
    pendingSearchConfig
  );
  const wpSynced =
    !syncing &&
    !runningSync &&
    lastSync?.status === "completed" &&
    !lastSync.error;

  // Ordre serveur stable (scoreTotal ↓, title ↑, id ↑) — pas de re-tri client.
  const selected = opportunities.find((item) => item.id === selectedId) ?? null;

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(page * pageSize, total);

  function selectOpportunity(id: string) {
    setSelectedId(id);
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px)").matches
    ) {
      setMobileDetailOpen(true);
    }
  }

  function clearSelection() {
    setSelectedId(null);
    setMobileDetailOpen(false);
  }

  return (
    <div className="space-y-6">
      <SearchLoadingOverlay
        open={searchOverlayOpen}
        title="Recherche d'opportunités SEO en cours…"
        primaryLabel={seoOverlay.primaryLabel}
        detailLabel={seoOverlay.detailLabel}
        startedAtIso={runningSearch?.startedAt ?? null}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">
              Opportunités SEO
            </h1>
            <OpportunityHelpDialog />
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Recherche multithématique, inventaire WP en lecture seule, scoring
            éditorial et qualification de tendance sur preuves sourcées. Aucune
            publication WordPress depuis ce module.
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {wpSynced ? (
            <span className="order-last inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 sm:order-none">
              WP synchronisé
            </span>
          ) : null}
          <WordPressSyncMenu
            disabled={busy}
            syncing={syncing || Boolean(runningSync)}
            onIncremental={() => void handleSync("incremental")}
            onFull={() => void handleSync("full")}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setConfigOpen(true)}
            className="h-9 gap-1.5 border-slate-300 bg-white text-slate-700"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            Configurer
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || inventoryCount === 0}
            onClick={() => void handleSearch()}
            className="h-9 gap-1.5 bg-naxialis text-white hover:bg-naxialis/90"
          >
            <Search className="size-3.5" aria-hidden />
            {runningSearch || searching ? "Recherche…" : "Lancer la recherche"}
          </Button>
          <SeoResetMenu
            disabled={busy}
            onError={(msg) => {
              setMessage(null);
              setError(msg);
            }}
            onMessage={(msg) => {
              setError(null);
              setMessage(msg);
            }}
            onResetComplete={async () => {
              clearSelection();
              setRunIdFilter("");
              setPage(1);
              await refresh();
            }}
          />
        </div>
      </div>

      <ResearchConfigModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        launching={searching}
        savedConfigs={savedConfigs}
        customThemes={customThemes}
        onConfigsChanged={async () => {
          await loadOpportunities();
        }}
        onLaunch={async (config) => {
          await handleSearch(config);
        }}
        onManageThemes={() => {
          setResumeConfigAfterThemes(true);
          setConfigOpen(false);
          setThemeManagerOpen(true);
        }}
      />

      <OpportunitySummaryCards
        counts={summaryCounts}
        isGlobalView={
          !theme &&
          !status &&
          !contentType &&
          !trendType &&
          !urgency &&
          !runIdFilter
        }
        urgencyFilter={urgency}
        statusFilter={status}
        onShowAll={() => {
          // Vue globale = mêmes filtres table que le total « détectées » (API sans filtre).
          // Ne touche pas aux configs de recherche sauvegardées ni au modal.
          setTheme("");
          setStatus("");
          setContentType("");
          setTrendType("");
          setUrgency("");
          setRunIdFilter("");
        }}
        onShowHighPriority={() => {
          // Enum Prisma EditorialUrgency.high — filtre board déjà existant.
          setUrgency("high");
          setStatus("");
        }}
        onShowToHandle={() => {
          // « À traiter » = OpportunityStatus.new (ouvertes, pas encore revue / file / écartée).
          setStatus("new");
          setUrgency("");
        }}
      />

      <div className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 text-xs text-slate-500">
        <p>
          <span className="font-medium text-slate-700">Inventaire WP :</span>{" "}
          {inventoryCount}
          {" · "}
          Annoncés {diagnostic?.expectedTotal ?? "—"} / récupérés{" "}
          {diagnostic?.fetchedCount ?? "—"} / en base{" "}
          {diagnostic?.storedCount ?? inventoryCount}
          {" · "}
          <span className="font-medium text-slate-700">Recherche :</span>{" "}
          {searchStatusLabel(lastSearch, runningSearch)}
          {" · "}
          <span className="font-medium text-slate-700">Sync :</span>{" "}
          {lastSync
            ? `${lastSync.status}${
                lastSync.finishedAt
                  ? ` · ${new Date(lastSync.finishedAt).toLocaleString("fr-FR")}`
                  : ""
              }`
            : "Jamais"}
        </p>
        {diagnostic?.note ? (
          <p className="mt-1 text-slate-600">{diagnostic.note}</p>
        ) : null}
        {lastSync?.error || diagnostic?.lastError ? (
          <p className="mt-1 text-red-700">
            {lastSync?.error ?? diagnostic?.lastError}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Recherche</span>
          <select
            value={runIdFilter}
            onChange={(event) => setRunIdFilter(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
          >
            <option value="">Toutes</option>
            {recentRuns.map((run) => (
              <option key={run.id} value={run.id}>
                {new Date(run.startedAt).toLocaleString("fr-FR")} ·{" "}
                {run.mode === "free"
                  ? run.customTopic ?? "sujet libre"
                  : "domaines"}{" "}
                · {run.status}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-sm sm:col-span-2 lg:col-span-1 xl:col-span-1">
          <span className="font-medium text-slate-700">Thématique</span>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
            >
              <option value="">Toutes</option>
              {customThemes
                .filter((item) => item.active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              {customThemes.some((item) => !item.active) ? (
                <optgroup label="Inactives (historique)">
                  {customThemes
                    .filter((item) => !item.active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} (inactive)
                      </option>
                    ))}
                </optgroup>
              ) : null}
            </select>
            <ThemeManagerDialog
              themes={customThemes}
              open={themeManagerOpen}
              onOpenChange={(next) => {
                setThemeManagerOpen(next);
                if (!next && resumeConfigAfterThemes) {
                  setResumeConfigAfterThemes(false);
                  void loadOpportunities().finally(() => {
                    setConfigOpen(true);
                  });
                }
              }}
              onChanged={async () => {
                await loadOpportunities();
              }}
            />
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Type éditorial</span>
          <select
            value={contentType}
            onChange={(event) => setContentType(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
          >
            <option value="">Tous</option>
            <option value="news">Actualité</option>
            <option value="evergreen">Evergreen</option>
            <option value="commercial">Commercial</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Tendance</span>
          <select
            value={trendType}
            onChange={(event) => setTrendType(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
          >
            <option value="">Toutes</option>
            <option value="emerging">Émergente</option>
            <option value="news">Actualité ponctuelle</option>
            <option value="evergreen">Evergreen</option>
            <option value="unverified">Non démontrée</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Urgence</span>
          <select
            value={urgency}
            onChange={(event) => setUrgency(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
          >
            <option value="">Toutes</option>
            <option value="high">Élevée</option>
            <option value="medium">Moyenne</option>
            <option value="low">Faible</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Statut</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
          >
            <option value="">Tous</option>
            <option value="new">Nouvelle</option>
            <option value="reviewed">Revue</option>
            <option value="added_to_queue">Ajoutée à la file</option>
            <option value="dismissed">Écartée</option>
          </select>
        </label>
      </div>

      {error ? (
        <div className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                setLoading(true);
                try {
                  await refresh();
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Erreur de chargement."
                  );
                } finally {
                  setLoading(false);
                }
              })();
            }}
            className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100"
          >
            Réessayer
          </button>
        </div>
      ) : null}
      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:grid-cols-[minmax(0,45%)_minmax(0,55%)]">
            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
                <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Résultats
                  <span className="ml-1.5 normal-case text-slate-500">
                    · {total}
                  </span>
                </p>
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="whitespace-nowrap">Par page</span>
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      const next = Number(event.target.value) as PageSize;
                      if (PAGE_SIZE_OPTIONS.includes(next)) {
                        setPageSize(next);
                      }
                    }}
                    className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus-visible:border-[#0F5270] focus-visible:ring-2 focus-visible:ring-[#0F5270]/20"
                    aria-label="Nombre de résultats par page"
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="min-h-0 max-h-[min(60vh,34rem)] flex-1 overflow-y-auto lg:max-h-[min(65vh,38rem)]">
                <OpportunityResultList
                  items={opportunities}
                  selectedId={selectedId}
                  onSelect={selectOpportunity}
                />
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3.5 py-2.5 text-xs text-slate-600">
                <p>
                  {rangeStart}–{rangeEnd} sur {total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#0F5270]/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Précédent
                  </button>
                  <span className="tabular-nums text-slate-700">
                    Page {page} sur {pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={page >= pageCount || loading || total === 0}
                    onClick={() =>
                      setPage((prev) => Math.min(pageCount, prev + 1))
                    }
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#0F5270]/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Suivant
                  </button>
                </div>
              </div>
            </div>

            <div className="hidden min-h-[24rem] overflow-hidden rounded-lg border border-slate-200 bg-white lg:flex lg:max-h-[min(75vh,44rem)] lg:flex-col">
              <OpportunityDetailPanel
                opportunity={selected}
                pendingId={pendingId}
                onQueue={(id) => void handleQueue(id)}
                onDismiss={(id) => void handleDismiss(id)}
              />
            </div>
          </div>

          <Sheet
            open={mobileDetailOpen && Boolean(selected)}
            onOpenChange={(open) => {
              setMobileDetailOpen(open);
              if (!open) {
                // Conserve la sélection liste, ferme seulement le panneau mobile.
              }
            }}
          >
            <SheetContent
              side="bottom"
              showCloseButton
              className="flex h-[min(92vh,40rem)] max-h-[92vh] w-full flex-col gap-0 overflow-hidden rounded-t-xl p-0 sm:max-w-none lg:hidden"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>
                  {selected?.title ?? "Détail de l’opportunité"}
                </SheetTitle>
                <SheetDescription>
                  Angle, justification, scores et sources de l’opportunité
                  sélectionnée.
                </SheetDescription>
              </SheetHeader>
              <OpportunityDetailPanel
                opportunity={selected}
                pendingId={pendingId}
                onQueue={(id) => void handleQueue(id)}
                onDismiss={(id) => void handleDismiss(id)}
                onClose={() => setMobileDetailOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}
