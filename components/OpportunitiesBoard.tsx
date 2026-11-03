"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ResearchConfigModal } from "@/components/ResearchConfigModal";
import { EDITORIAL_DOMAINS } from "@/lib/seo/domains";
import type { ResearchConfiguration } from "@/lib/seo/research-config";

type OpportunitySource = {
  title: string;
  url: string;
  date?: string | null;
};

type SimilarPost = {
  wpPostId: number;
  title: string;
  url: string;
  slug: string;
  score: number;
  reason: string;
};

type SimilarTopic = {
  topicId: string;
  subject: string;
  score: number;
  reason: string;
};

type ScoreRationale = {
  relevance?: string;
  commercial?: string;
  intent?: string;
  timeliness?: string;
  originality?: string;
};

type ContentType = "news" | "evergreen" | "commercial";
type TrendType = "emerging" | "news" | "evergreen" | "unverified";
type TrendConfidence = "low" | "medium" | "high";
type EditorialUrgency = "low" | "medium" | "high";

type SourceQualification = {
  title: string;
  url: string;
  date?: string | null;
  domain?: string;
  relevance?: "direct" | "contextual" | "irrelevant" | "indeterminate";
  role?: "trend_evidence" | "documentary" | "excluded";
  exclusionReason?: string | null;
  sharedInBatch?: boolean;
};

type TrendSignals = {
  independentDomains?: number;
  datedSources?: number;
  recent30?: number;
  recent90?: number;
  analysisVersion?: string;
  admissibleSourceCount?: number;
  documentarySourceCount?: number;
  excludedSourceCount?: number;
  sourceQualifications?: SourceQualification[];
  evidenceSources?: Array<{
    title: string;
    url: string;
    date?: string | null;
    domain?: string;
  }>;
  historyComparison?: {
    sourceCountDelta?: number;
    scoreDelta?: number;
    interpretation?: string;
  };
};

type SeoOpportunityItem = {
  id: string;
  title: string;
  subject: string;
  angle: string | null;
  searchIntent: string | null;
  theme: string;
  contentType: ContentType;
  rationale: string | null;
  sources: OpportunitySource[] | null;
  naxialisService: string | null;
  status: "new" | "reviewed" | "added_to_queue" | "dismissed";
  scoreTotal: number;
  scoreRelevance: number;
  scoreCommercial: number;
  scoreIntent: number;
  scoreTimeliness: number;
  scoreOriginality: number;
  scoreRationale: ScoreRationale | null;
  similarPosts: SimilarPost[] | null;
  similarTopics: SimilarTopic[] | null;
  duplicateRisk: string | null;
  topicId: string | null;
  createdAt: string;
  trendType?: TrendType | null;
  trendScore?: number | null;
  trendConfidence?: TrendConfidence | null;
  trendJustification?: string | null;
  trendCheckedAt?: string | null;
  editorialUrgency?: EditorialUrgency | null;
  trendSignals?: TrendSignals | null;
};

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

type CustomTheme = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
};

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

type ListPayload = {
  opportunities: SeoOpportunityItem[];
  lastSearch: SearchRun | null;
  runningSearch: SearchRun | null;
  inventoryCount: number;
  recentRuns?: SearchRun[];
  customThemes?: CustomTheme[];
  savedConfigs?: SavedConfig[];
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

const STATUS_LABELS: Record<SeoOpportunityItem["status"], string> = {
  new: "Nouvelle",
  reviewed: "Revue",
  added_to_queue: "Ajoutée à la file",
  dismissed: "Écartée",
};

const CONTENT_LABELS: Record<ContentType, string> = {
  news: "Actualité",
  evergreen: "Evergreen",
  commercial: "Commercial",
};

const TREND_LABELS: Record<TrendType, string> = {
  emerging: "Émergente",
  news: "Actualité ponctuelle",
  evergreen: "Evergreen",
  unverified: "Non démontrée",
};

const URGENCY_LABELS: Record<EditorialUrgency, string> = {
  low: "Faible",
  medium: "Moyenne",
  high: "Élevée",
};

const CONFIDENCE_LABELS: Record<TrendConfidence, string> = {
  low: "Faible",
  medium: "Moyenne",
  high: "Élevée",
};

function asSources(value: unknown): OpportunitySource[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is OpportunitySource =>
      !!item &&
      typeof item === "object" &&
      typeof (item as OpportunitySource).title === "string" &&
      typeof (item as OpportunitySource).url === "string"
  );
}

function asSimilarPosts(value: unknown): SimilarPost[] {
  return Array.isArray(value) ? (value as SimilarPost[]) : [];
}

function asSimilarTopics(value: unknown): SimilarTopic[] {
  return Array.isArray(value) ? (value as SimilarTopic[]) : [];
}

function scoreTone(score: number): string {
  if (score >= 80) {
    return "bg-emerald-50 text-emerald-800 border-emerald-200";
  }
  if (score >= 60) {
    return "bg-amber-50 text-amber-800 border-amber-200";
  }
  return "bg-slate-50 text-slate-700 border-slate-200";
}

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
  const [configOpen, setConfigOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    const response = await fetch("/api/wordpress-inventory/sync");
    const payload = (await response.json()) as InventoryPayload;
    if (!response.ok) {
      throw new Error(payload.error ?? "Impossible de charger l’inventaire.");
    }
    setInventoryCount(payload.count);
    setLastSync(payload.lastSync);
    setRunningSync(payload.running);
    setDiagnostic(payload.diagnostic ?? null);
  }, []);

  const loadOpportunities = useCallback(async () => {
    const params = new URLSearchParams();
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
    const payload = (await response.json()) as ListPayload;
    if (!response.ok) {
      throw new Error(payload.error ?? "Impossible de charger les opportunités.");
    }
    setOpportunities(payload.opportunities);
    setLastSearch(payload.lastSearch);
    setRunningSearch(payload.runningSearch);
    setInventoryCount(payload.inventoryCount);
    setRecentRuns(payload.recentRuns ?? []);
    setSavedConfigs(payload.savedConfigs ?? []);
    setCustomThemes(payload.customThemes ?? []);
  }, [theme, status, contentType, trendType, urgency, runIdFilter]);

  const refresh = useCallback(async () => {
    setError(null);
    await Promise.all([loadInventory(), loadOpportunities()]);
  }, [loadInventory, loadOpportunities]);

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
      return;
    }
    if (wasRunningSearch.current && lastSearch) {
      wasRunningSearch.current = false;
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
        setSelectedId(null);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setPendingId(null);
    }
  }

  const busy = syncing || searching || !!runningSync || !!runningSearch;

  const sorted = useMemo(
    () =>
      [...opportunities].sort(
        (a, b) => b.scoreTotal - a.scoreTotal || a.title.localeCompare(b.title)
      ),
    [opportunities]
  );

  const selected = sorted.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Opportunités SEO
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Recherche multithématique, inventaire WP en lecture seule, scoring
            éditorial et qualification de tendance sur preuves sourcées. Aucune
            publication WordPress depuis ce module.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSync("incremental")}
            className="rounded-md bg-naxialis-dark px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {runningSync ? "Sync en cours…" : "Synchroniser WordPress"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSync("full")}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            Sync complète
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfigOpen(true)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            Configurer la recherche
          </button>
          <button
            type="button"
            disabled={busy || inventoryCount === 0}
            onClick={() => void handleSearch()}
            className="rounded-md bg-naxialis px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {runningSearch ? "Recherche…" : "Rechercher des opportunités"}
          </button>
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
      />

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Inventaire WP
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {inventoryCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Annoncés API : {diagnostic?.expectedTotal ?? "—"} · Récupérés :{" "}
            {diagnostic?.fetchedCount ?? "—"} · Upsertés :{" "}
            {diagnostic?.upsertedCount ?? "—"} · En base :{" "}
            {diagnostic?.storedCount ?? inventoryCount} · Pages :{" "}
            {diagnostic?.pagesFetched ?? "—"}
            {diagnostic?.totalPages != null
              ? `/${diagnostic.totalPages}`
              : ""}
          </p>
          {diagnostic?.note ? (
            <p className="mt-2 text-xs text-slate-600">{diagnostic.note}</p>
          ) : null}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Recherche
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {searchStatusLabel(lastSearch, runningSearch)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {lastSearch?.mode === "free"
              ? `Sujet libre : ${lastSearch.customTopic ?? "—"}`
              : `Quotas défaut : ${EDITORIAL_DOMAINS.map((d) => d.defaultQuota).join(" / ")}`}
          </p>
          {lastSearch ? (
            <p className="mt-1 text-xs text-slate-500">
              Demandé : {lastSearch.requestedCount ?? "—"} · Créé :{" "}
              {lastSearch.foundCount} · Doublons/existants :{" "}
              {lastSearch.skippedExisting ?? 0} · Rejetés :{" "}
              {lastSearch.rejectedCount ?? 0}
            </p>
          ) : null}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Dernière sync
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {lastSync
              ? `${lastSync.status}${
                  lastSync.finishedAt
                    ? ` · ${new Date(lastSync.finishedAt).toLocaleString("fr-FR")}`
                    : ""
                }`
              : "Jamais"}
          </p>
          {lastSync?.error || diagnostic?.lastError ? (
            <p className="mt-1 text-xs text-red-700">
              {lastSync?.error ?? diagnostic?.lastError}
            </p>
          ) : null}
        </div>
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
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Thématique</span>
          <select
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
          >
            <option value="">Toutes</option>
            {EDITORIAL_DOMAINS.map((item) => (
              <option key={item.id} value={item.label}>
                {item.label}
              </option>
            ))}
            {customThemes.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name} (perso)
              </option>
            ))}
          </select>
        </label>
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
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
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
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {sorted.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-slate-500">
                Aucune opportunité pour ces filtres. Synchronisez puis lancez une
                recherche.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="px-3 py-2 font-medium">Titre</th>
                      <th className="px-3 py-2 font-medium">Tendance</th>
                      <th className="px-3 py-2 font-medium">Urgence</th>
                      <th className="px-3 py-2 font-medium">Score</th>
                      <th className="px-3 py-2 font-medium">WP</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((item) => (
                      <tr
                        key={item.id}
                        className={`border-b border-slate-100 ${
                          selectedId === item.id ? "bg-slate-50" : "bg-white"
                        }`}
                      >
                        <td className="max-w-[16rem] px-3 py-2 font-medium text-slate-900">
                          <button
                            type="button"
                            className="text-left hover:underline"
                            onClick={() => setSelectedId(item.id)}
                          >
                            {item.title}
                          </button>
                          <p className="mt-0.5 text-xs font-normal text-slate-500">
                            {item.theme.replace(
                              "Intelligence artificielle et agents IA",
                              "IA / agents"
                            )}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {item.trendType
                            ? TREND_LABELS[item.trendType]
                            : "—"}
                          {item.trendScore != null ? (
                            <span className="block text-xs text-slate-500">
                              {item.trendScore}/100 · conf.{" "}
                              {item.trendConfidence
                                ? CONFIDENCE_LABELS[item.trendConfidence]
                                : "—"}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {item.editorialUrgency
                            ? URGENCY_LABELS[item.editorialUrgency]
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded border px-1.5 py-0.5 text-xs font-semibold ${scoreTone(item.scoreTotal)}`}
                          >
                            {item.scoreTotal}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {item.duplicateRisk && item.duplicateRisk !== "none"
                            ? item.duplicateRisk
                            : "ok"}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="text-xs font-medium text-naxialis underline"
                            onClick={() => setSelectedId(item.id)}
                          >
                            Détails
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            {!selected ? (
              <p className="text-sm text-slate-500">
                Sélectionnez une opportunité pour afficher l’angle, les sources,
                les sous-scores et les articles similaires.
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${scoreTone(selected.scoreTotal)}`}
                    >
                      Éditorial {selected.scoreTotal}/100
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {CONTENT_LABELS[selected.contentType ?? "evergreen"]}
                    </span>
                    {selected.trendType ? (
                      <span className="rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-900">
                        Tendance : {TREND_LABELS[selected.trendType]}
                        {selected.trendScore != null
                          ? ` · ${selected.trendScore}/100`
                          : ""}
                      </span>
                    ) : (
                      <span className="rounded bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                        Tendance non évaluée (historique)
                      </span>
                    )}
                    {selected.editorialUrgency ? (
                      <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
                        Urgence {URGENCY_LABELS[selected.editorialUrgency]}
                      </span>
                    ) : null}
                    {selected.duplicateRisk &&
                    selected.duplicateRisk !== "none" ? (
                      <span className="rounded bg-orange-50 px-2 py-0.5 text-xs text-orange-800">
                        Doublon WP : {selected.duplicateRisk}
                      </span>
                    ) : (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
                        Pas de doublon WP fort
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">
                    {selected.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">{selected.subject}</p>
                </div>

                {selected.trendJustification ? (
                  <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      Justification de tendance
                      {selected.trendConfidence
                        ? ` · confiance ${CONFIDENCE_LABELS[selected.trendConfidence]}`
                        : ""}
                      {selected.trendSignals?.analysisVersion
                        ? ` · ${selected.trendSignals.analysisVersion}`
                        : ""}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {selected.trendJustification}
                    </p>
                    {selected.trendCheckedAt ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Vérifié le{" "}
                        {new Date(selected.trendCheckedAt).toLocaleString(
                          "fr-FR"
                        )}
                      </p>
                    ) : null}
                    {selected.trendSignals?.historyComparison?.interpretation ? (
                      <p className="mt-2 text-xs text-slate-600">
                        Historique :{" "}
                        {selected.trendSignals.historyComparison.interpretation}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {selected.angle ? (
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">Angle :</span> {selected.angle}
                  </p>
                ) : null}
                {selected.searchIntent ? (
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">Intention :</span>{" "}
                    {selected.searchIntent}
                  </p>
                ) : null}
                {selected.rationale ? (
                  <p className="text-sm text-slate-600">{selected.rationale}</p>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ["Pertinence", selected.scoreRelevance, selected.scoreRationale?.relevance],
                    ["Commercial", selected.scoreCommercial, selected.scoreRationale?.commercial],
                    ["Intention", selected.scoreIntent, selected.scoreRationale?.intent],
                    ["Actualité", selected.scoreTimeliness, selected.scoreRationale?.timeliness],
                    ["Originalité", selected.scoreOriginality, selected.scoreRationale?.originality],
                  ].map(([label, value, tip]) => (
                    <div key={String(label)} className="text-xs text-slate-600">
                      <p className="font-medium text-slate-800">
                        {label} · {value}
                      </p>
                      {tip ? <p className="mt-0.5 leading-snug">{tip}</p> : null}
                    </div>
                  ))}
                </div>

                {(() => {
                  const qualifications =
                    selected.trendSignals?.sourceQualifications ?? [];
                  const legacySources = asSources(selected.sources);
                  if (qualifications.length === 0 && legacySources.length === 0) {
                    return null;
                  }

                  if (qualifications.length === 0) {
                    return (
                      <div>
                        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                          Sources (historique)
                        </p>
                        <ul className="mt-1 space-y-1">
                          {legacySources.map((source) => (
                            <li key={`${source.url}-${source.title}`}>
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-naxialis underline"
                              >
                                {source.title}
                                {source.date ? ` (${source.date})` : ""}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  }

                  const evidence = qualifications.filter(
                    (item) => item.role === "trend_evidence"
                  );
                  const documentary = qualifications.filter(
                    (item) => item.role === "documentary"
                  );
                  const excluded = qualifications.filter(
                    (item) => item.role === "excluded"
                  );

                  function renderQualifiedList(
                    items: SourceQualification[],
                    emptyLabel: string
                  ) {
                    if (items.length === 0) {
                      return (
                        <p className="mt-1 text-xs text-slate-500">{emptyLabel}</p>
                      );
                    }
                    return (
                      <ul className="mt-1 space-y-1.5">
                        {items.map((source) => (
                          <li key={`${source.role}-${source.url}-${source.title}`}>
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-naxialis underline"
                            >
                              {source.title}
                              {source.date ? ` (${source.date})` : ""}
                            </a>
                            {source.exclusionReason ? (
                              <p className="text-xs text-slate-500">
                                {source.exclusionReason}
                              </p>
                            ) : null}
                            {source.sharedInBatch ? (
                              <p className="text-xs text-amber-700">
                                Également citée sur d’autres opportunités du lot.
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold tracking-wide text-emerald-800 uppercase">
                          Preuves de tendance
                        </p>
                        {renderQualifiedList(
                          evidence,
                          "Aucune preuve directe retenue."
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                          Sources documentaires
                        </p>
                        {renderQualifiedList(
                          documentary,
                          "Aucune source documentaire."
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                          Sources exclues du calcul
                        </p>
                        {renderQualifiedList(
                          excluded,
                          "Aucune source exclue."
                        )}
                      </div>
                    </div>
                  );
                })()}

                {asSimilarPosts(selected.similarPosts).length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      Articles WP similaires
                    </p>
                    <ul className="mt-1 space-y-1 text-sm text-slate-700">
                      {asSimilarPosts(selected.similarPosts).map((post) => (
                        <li key={post.wpPostId}>
                          <a
                            href={post.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            {post.title}
                          </a>
                          <span className="text-slate-500">
                            {" "}
                            · {Math.round(post.score * 100)} % — {post.reason}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {asSimilarTopics(selected.similarTopics).length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      Sujets déjà en file
                    </p>
                    <ul className="mt-1 space-y-1 text-sm text-slate-700">
                      {asSimilarTopics(selected.similarTopics).map((topic) => (
                        <li key={topic.topicId}>
                          {topic.subject}
                          <span className="text-slate-500">
                            {" "}
                            · {Math.round(topic.score * 100)} %
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    disabled={
                      pendingId === selected.id ||
                      selected.status === "added_to_queue"
                    }
                    onClick={() => void handleQueue(selected.id)}
                    className="rounded-md bg-naxialis-dark px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {selected.status === "added_to_queue"
                      ? "Déjà en file"
                      : pendingId === selected.id
                        ? "Ajout…"
                        : "Ajouter à la file de sujets"}
                  </button>
                  {selected.status !== "dismissed" &&
                  selected.status !== "added_to_queue" ? (
                    <button
                      type="button"
                      disabled={pendingId === selected.id}
                      onClick={() => void handleDismiss(selected.id)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
                    >
                      Écarter
                    </button>
                  ) : null}
                  {selected.topicId ? (
                    <Link
                      href="/topics"
                      className="self-center text-xs text-naxialis underline"
                    >
                      Voir la file
                    </Link>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
