"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readApiJson } from "@/lib/ai-visibility/http";

type Question = {
  id: string;
  text: string;
  intent: string | null;
  sortOrder: number;
  validated: boolean;
};

type EntityRef = {
  id: string;
  name: string;
  canonicalName?: string | null;
  domain: string | null;
  kind: string;
  category?: string;
  categoryConfidence?: number | null;
  categoryJustification?: string | null;
  categoryManual?: boolean;
  aliases?: unknown;
  parentEntityId?: string | null;
};

type Mention = {
  id: string;
  kind: string;
  appearanceOrder: number | null;
  excerpt: string | null;
  confidence?: number | null;
  rawName?: string | null;
  entity: EntityRef;
};

type ResponseRow = {
  id: string;
  questionId: string;
  repetitionIndex: number;
  status: string;
  responseText: string | null;
  error: string | null;
  durationMs: number | null;
  estimatedCostUsd: number | null;
  mentions: Mention[];
};

type Citation = {
  id: string;
  responseId: string;
  title: string | null;
  url: string;
  domain: string | null;
};

type Campaign = {
  id: string;
  brandId: string;
  subject: string;
  status: string;
  country: string;
  language: string;
  questionCount: number;
  repetitions: number;
  provider: string;
  model: string;
  instructions: string | null;
  analysisVersion: string;
  estimatedCalls: number | null;
  completedCalls: number;
  validResponses: number;
  failedResponses: number;
  mentionRate: number | null;
  recommendationRate: number | null;
  domainCitationRate: number | null;
  metricsSnapshot: unknown;
  previousMetricsSnapshot?: unknown;
  reanalyzeReport?: unknown;
  editorialHints: unknown;
  estimatedCostUsd: number | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  brand: { id: string; name: string; primaryDomain: string };
  questions: Question[];
  responses: ResponseRow[];
};

type EntityMetricsRow = {
  name: string;
  canonicalName?: string;
  domain: string | null;
  category?: string;
  categoryConfidence?: number | null;
  categoryJustification?: string | null;
  mentionCount: number;
  recommendationCount: number;
  citationCount?: number;
  mentionRate: number | null;
  recommendationRate?: number | null;
  citationRate?: number | null;
};

type MetricsSnapshot = {
  entities?: EntityMetricsRow[];
  competitors?: EntityMetricsRow[];
  sampleSizeNote?: string;
  mentionCount?: number;
  recommendationCount?: number;
  domainCitationCount?: number;
  validResponses?: number;
  analysisVersion?: string;
};

type EntityFilter =
  | "all"
  | "direct"
  | "indirect"
  | "software"
  | "institutions_sources"
  | "unclassified";

const FILTER_LABELS: Record<EntityFilter, string> = {
  all: "Tous",
  direct: "Concurrents directs",
  indirect: "Concurrents indirects",
  software: "Logiciels et plateformes",
  institutions_sources: "Institutions et sources",
  unclassified: "Non classés",
};

const CATEGORY_LABELS: Record<string, string> = {
  target_brand: "Marque cible",
  direct_competitor: "Concurrent direct",
  indirect_competitor: "Concurrent indirect",
  software_product: "Logiciel / plateforme",
  institution: "Institution",
  information_source: "Source documentaire",
  other: "Autre",
  unknown: "Non classé",
};

function formatRate(value: number | null | undefined): string {
  if (value == null) {
    return "—";
  }
  return `${Math.round(value * 100)} %`;
}

function matchesFilter(category: string | undefined, filter: EntityFilter): boolean {
  const cat = category ?? "unknown";
  switch (filter) {
    case "all":
      return true;
    case "direct":
      return cat === "direct_competitor";
    case "indirect":
      return cat === "indirect_competitor";
    case "software":
      return cat === "software_product";
    case "institutions_sources":
      return cat === "institution" || cat === "information_source";
    case "unclassified":
      return cat === "unknown" || cat === "other";
    default:
      return true;
  }
}

function parseAliases(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function formatAnalysisDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function AiVisibilityCampaignDetail({
  brandId,
  campaignId,
}: {
  brandId: string;
  campaignId: string;
}) {
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draftQuestions, setDraftQuestions] = useState<
    Array<{ id?: string; text: string; intent?: string }>
  >([]);
  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(
    null
  );
  const [entityFilter, setEntityFilter] = useState<EntityFilter>("all");
  const [selectedEntityKey, setSelectedEntityKey] = useState<string | null>(
    null
  );
  const [editCategory, setEditCategory] = useState("unknown");
  const [editAliases, setEditAliases] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/ai-visibility/campaigns/${campaignId}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const parsed = await readApiJson<{
        campaign?: Campaign;
        citations?: Citation[];
      }>(res);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      if (!parsed.data.campaign) {
        throw new Error("Campagne introuvable.");
      }
      setCampaign(parsed.data.campaign);
      setCitations(parsed.data.citations ?? []);
      setDraftQuestions(
        parsed.data.campaign.questions.map((q) => ({
          id: q.id,
          text: q.text,
          intent: q.intent ?? "information",
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!campaign || campaign.status !== "running") {
      return;
    }
    const timer = setInterval(() => {
      void load();
    }, 4000);
    return () => clearInterval(timer);
  }, [campaign, load]);

  const metrics = (campaign?.metricsSnapshot ?? null) as MetricsSnapshot | null;

  const entityTable = useMemo(() => {
    if (metrics?.entities?.length) {
      return metrics.entities;
    }
    if (metrics?.competitors?.length) {
      return metrics.competitors.map((row) => ({
        ...row,
        category: row.category ?? "direct_competitor",
        citationCount: row.citationCount ?? 0,
      }));
    }
    return [];
  }, [metrics]);

  const directCompetitors = useMemo(
    () =>
      entityTable.filter((row) => (row.category ?? "") === "direct_competitor"),
    [entityTable]
  );

  const filteredEntities = useMemo(
    () =>
      entityTable.filter((row) => matchesFilter(row.category, entityFilter)),
    [entityTable, entityFilter]
  );

  const selectedEntityMentions = useMemo(() => {
    if (!campaign || !selectedEntityKey) {
      return [];
    }
    return campaign.responses.flatMap((response) =>
      response.mentions
        .filter((mention) => {
          const key = `${(mention.entity.canonicalName || mention.entity.name).toLowerCase()}|${mention.entity.domain ?? ""}`;
          return key === selectedEntityKey;
        })
        .map((mention) => ({ mention, response }))
    );
  }, [campaign, selectedEntityKey]);

  const selectedEntityMeta = useMemo(() => {
    if (!selectedEntityMentions.length) {
      return null;
    }
    return selectedEntityMentions[0]!.mention.entity;
  }, [selectedEntityMentions]);

  useEffect(() => {
    if (selectedEntityMeta) {
      setEditCategory(selectedEntityMeta.category ?? "unknown");
      setEditAliases(parseAliases(selectedEntityMeta.aliases).join(", "));
    }
  }, [selectedEntityMeta]);

  const selectedResponse = campaign?.responses.find(
    (item) => item.id === selectedResponseId
  );

  const selectedCitations = citations.filter(
    (item) => item.responseId === selectedResponseId
  );

  const editorialHints = Array.isArray(campaign?.editorialHints)
    ? (campaign!.editorialHints as Array<{
        title: string;
        rationale: string;
        relatedQuestions?: string[];
      }>)
    : [];

  async function generateQuestions() {
    setBusy("generate");
    setError(null);
    try {
      const res = await fetch(
        `/api/ai-visibility/campaigns/${campaignId}/questions`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }
      );
      const parsed = await readApiJson<{ questions?: Question[] }>(res);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  async function saveQuestions() {
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(
        `/api/ai-visibility/campaigns/${campaignId}/questions`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ questions: draftQuestions }),
        }
      );
      const parsed = await readApiJson(res);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  async function runCampaign() {
    setBusy("run");
    setError(null);
    try {
      const res = await fetch(
        `/api/ai-visibility/campaigns/${campaignId}/run`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }
      );
      const parsed = await readApiJson(res);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  async function reanalyzeLocal() {
    setBusy("reanalyze");
    setError(null);
    try {
      const res = await fetch(
        `/api/ai-visibility/campaigns/${campaignId}/reanalyze`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({}),
        }
      );
      const parsed = await readApiJson(res);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteCampaign() {
    if (!campaign) {
      return;
    }
    const confirmed = window.confirm(
      `Supprimer définitivement la campagne « ${campaign.subject} » ?\n\nCette action est irréversible : questions, réponses, observations et métriques associées seront effacées. La marque et ses paramètres seront conservés.`
    );
    if (!confirmed) {
      return;
    }

    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(
        `/api/ai-visibility/campaigns/${campaignId}`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }
      );
      const parsed = await readApiJson<{
        success?: boolean;
        brandId?: string;
      }>(res);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      const targetBrandId =
        typeof parsed.data.brandId === "string" && parsed.data.brandId
          ? parsed.data.brandId
          : brandId;
      router.push(`/ai-visibility/${targetBrandId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
      setBusy(null);
    }
  }

  async function saveEntityCorrection() {
    if (!selectedEntityMeta?.id) {
      return;
    }
    setBusy("entity");
    setError(null);
    try {
      const res = await fetch(
        `/api/ai-visibility/entities/${selectedEntityMeta.id}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            category: editCategory,
            aliases: editAliases,
          }),
        }
      );
      const parsed = await readApiJson(res);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  if (!campaign) {
    return (
      <p className="text-sm text-slate-500">
        {error ?? "Chargement de la campagne…"}
      </p>
    );
  }

  const canEditQuestions =
    campaign.status === "pending" || campaign.status === "questions_ready";
  const canRun =
    campaign.status === "questions_ready" ||
    campaign.status === "failed" ||
    campaign.status === "partial" ||
    campaign.status === "completed";
  const canReanalyze =
    campaign.responses.some((item) => item.status === "completed") &&
    campaign.status !== "running";

  function renderEntityTable(
    rows: EntityMetricsRow[],
    title: string,
    emptyLabel: string
  ) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {title.toLowerCase().includes("entit") ? (
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value as EntityFilter)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              {(Object.keys(FILTER_LABELS) as EntityFilter[]).map((key) => (
                <option key={key} value={key}>
                  {FILTER_LABELS[key]}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{emptyLabel}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nom canonique</th>
                  <th className="px-3 py-2">Domaine</th>
                  <th className="px-3 py-2">Catégorie</th>
                  <th className="px-3 py-2">Mentions</th>
                  <th className="px-3 py-2">Recos</th>
                  <th className="px-3 py-2">Citations</th>
                  <th className="px-3 py-2">Taux mention</th>
                  <th className="px-3 py-2">Confiance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const key = `${(row.canonicalName || row.name).toLowerCase()}|${row.domain ?? ""}`;
                  return (
                    <tr
                      key={key}
                      className={`cursor-pointer hover:bg-slate-50 ${
                        selectedEntityKey === key ? "bg-slate-50" : ""
                      }`}
                      onClick={() => setSelectedEntityKey(key)}
                    >
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {row.canonicalName || row.name}
                      </td>
                      <td className="px-3 py-2">{row.domain ?? "—"}</td>
                      <td className="px-3 py-2">
                        {CATEGORY_LABELS[row.category ?? "unknown"] ??
                          row.category ??
                          "—"}
                      </td>
                      <td className="px-3 py-2">{row.mentionCount}</td>
                      <td className="px-3 py-2">{row.recommendationCount}</td>
                      <td className="px-3 py-2">{row.citationCount ?? 0}</td>
                      <td className="px-3 py-2">
                        {formatRate(row.mentionRate)}
                      </td>
                      <td className="px-3 py-2">
                        {row.categoryConfidence != null
                          ? `${Math.round(row.categoryConfidence * 100)} %`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/ai-visibility/${brandId}`}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← {campaign.brand.name}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">
          {campaign.subject}
        </h1>
        <p className="text-sm text-slate-600">
          {campaign.provider}/{campaign.model} · {campaign.country}/
          {campaign.language} · statut <strong>{campaign.status}</strong> ·{" "}
          {campaign.analysisVersion}
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {campaign.error ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {campaign.error}
        </p>
      ) : null}

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <div>
          <p className="text-xs uppercase text-slate-500">Mentions</p>
          <p className="text-lg font-semibold">
            {formatRate(campaign.mentionRate)}
          </p>
          <p className="text-xs text-slate-500">
            {metrics?.mentionCount ?? "—"} / {campaign.validResponses} valides
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Recommandations</p>
          <p className="text-lg font-semibold">
            {formatRate(campaign.recommendationRate)}
          </p>
          <p className="text-xs text-slate-500">
            {metrics?.recommendationCount ?? "—"} / {campaign.validResponses}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Citation domaine</p>
          <p className="text-lg font-semibold">
            {formatRate(campaign.domainCitationRate)}
          </p>
          <p className="text-xs text-slate-500">
            {metrics?.domainCitationCount ?? "—"} réponses avec citation
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Progression / coût</p>
          <p className="text-lg font-semibold">
            {campaign.completedCalls}/{campaign.estimatedCalls ?? "?"}
          </p>
          <p className="text-xs text-slate-500">
            {campaign.failedResponses} échec(s)
            {campaign.estimatedCostUsd != null
              ? ` · ~$${campaign.estimatedCostUsd.toFixed(4)}`
              : ""}
          </p>
        </div>
      </section>

      {metrics?.sampleSizeNote ? (
        <p className="text-xs text-slate-500">{metrics.sampleSizeNote}</p>
      ) : null}

      {campaign.reanalyzeReport &&
      typeof campaign.reanalyzeReport === "object" ? (
        <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900 marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span>Détails techniques de l’analyse</span>
              <span className="font-normal text-xs text-slate-500">
                {campaign.analysisVersion}
                {" · "}
                {campaign.validResponses} réponse
                {campaign.validResponses === 1 ? "" : "s"} analysée
                {campaign.validResponses === 1 ? "" : "s"}
                {formatAnalysisDate(campaign.finishedAt)
                  ? ` · ${formatAnalysisDate(campaign.finishedAt)}`
                  : ""}
              </span>
            </span>
          </summary>
          {(() => {
            const report = campaign.reanalyzeReport as {
              analysisVersion?: string;
              mode?: string;
              usedLlm?: boolean;
              historicalExamined?: number;
              preserved?: string[];
              newlyDetected?: string[];
              rejected?: Array<{ name: string; reason: string }>;
              ambiguous?: string[];
              merged?: string[];
              manualPreserved?: string[];
              unverifiableHistorical?: string[];
              note?: string;
              metricsBefore?: {
                mentionRate?: number | null;
                recommendationRate?: number | null;
                domainCitationRate?: number | null;
              } | null;
              metricsAfter?: {
                mentionRate?: number | null;
                recommendationRate?: number | null;
                domainCitationRate?: number | null;
              };
            };
            return (
              <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-500">
                  {report.analysisVersion ?? "—"} · mode{" "}
                  {report.mode ?? "—"}
                  {report.usedLlm ? " · LLM" : " · local"} · historiques
                  examinés : {report.historicalExamined ?? 0}
                </p>
                {report.note ? (
                  <p className="text-xs text-slate-600">{report.note}</p>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-3 text-xs">
                  <p>
                    Mentions avant/après :{" "}
                    {formatRate(report.metricsBefore?.mentionRate ?? null)} →{" "}
                    {formatRate(report.metricsAfter?.mentionRate ?? null)}
                  </p>
                  <p>
                    Recos avant/après :{" "}
                    {formatRate(
                      report.metricsBefore?.recommendationRate ?? null
                    )}{" "}
                    → {formatRate(report.metricsAfter?.recommendationRate ?? null)}
                  </p>
                  <p>
                    Citations avant/après :{" "}
                    {formatRate(
                      report.metricsBefore?.domainCitationRate ?? null
                    )}{" "}
                    →{" "}
                    {formatRate(
                      report.metricsAfter?.domainCitationRate ?? null
                    )}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Conservées ({report.preserved?.length ?? 0})
                    </p>
                    <p className="mt-1 text-slate-700">
                      {(report.preserved ?? []).join(", ") || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Nouvelles ({report.newlyDetected?.length ?? 0})
                    </p>
                    <p className="mt-1 text-slate-700">
                      {(report.newlyDetected ?? []).join(", ") || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Ambiguës / unknown ({report.ambiguous?.length ?? 0})
                    </p>
                    <p className="mt-1 text-slate-700">
                      {(report.ambiguous ?? []).join(", ") || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Corrections manuelles ({report.manualPreserved?.length ?? 0})
                    </p>
                    <p className="mt-1 text-slate-700">
                      {(report.manualPreserved ?? []).join(", ") || "—"}
                    </p>
                  </div>
                </div>
                {(report.rejected?.length ?? 0) > 0 ? (
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Rejetées ({report.rejected!.length})
                    </p>
                    <ul className="mt-1 max-h-40 list-disc space-y-1 overflow-auto pl-5 text-xs text-slate-600">
                      {report.rejected!.map((item, index) => (
                        <li key={`${item.name}-${index}`}>
                          <span className="font-medium text-slate-800">
                            {item.name}
                          </span>
                          {" — "}
                          {item.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })()}
        </details>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Questions</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Actions campagne">
            {canEditQuestions ? (
              <>
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => void generateQuestions()}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                >
                  {busy === "generate" ? "Génération…" : "Générer"}
                </button>
                <button
                  type="button"
                  disabled={busy != null || draftQuestions.length === 0}
                  onClick={() => void saveQuestions()}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                >
                  {busy === "save" ? "Enregistrement…" : "Valider questions"}
                </button>
              </>
            ) : null}
            {canRun && campaign.status !== "running" ? (
              <button
                type="button"
                disabled={busy != null || campaign.questions.length === 0}
                onClick={() => void runCampaign()}
                className="rounded-md bg-naxialis-dark px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy === "run" ? "Lancement…" : "Lancer l’analyse"}
              </button>
            ) : null}
            {canReanalyze ? (
              <button
                type="button"
                disabled={busy != null}
                onClick={() => void reanalyzeLocal()}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                title="Recalcule classification et métriques sans nouvelle recherche web"
              >
                {busy === "reanalyze"
                  ? "Réanalyse…"
                  : "Réanalyser (local)"}
              </button>
            ) : null}
            {campaign.status !== "running" ? (
              <button
                type="button"
                disabled={busy != null}
                onClick={() => void deleteCampaign()}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                {busy === "delete" ? "Suppression…" : "Supprimer la campagne"}
              </button>
            ) : null}
          </div>
        </div>

        {draftQuestions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Générez puis validez les questions avant le lancement.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {draftQuestions.map((question, index) => (
              <li key={question.id ?? index} className="flex gap-2">
                <span className="mt-2 w-6 shrink-0 text-xs text-slate-400">
                  {index + 1}.
                </span>
                {canEditQuestions ? (
                  <textarea
                    value={question.text}
                    onChange={(e) => {
                      const next = [...draftQuestions];
                      next[index] = { ...question, text: e.target.value };
                      setDraftQuestions(next);
                    }}
                    rows={2}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                ) : (
                  <div className="w-full rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800">
                    <p>{question.text}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Intent : {question.intent ?? "—"}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {renderEntityTable(
        directCompetitors,
        "Concurrents directs",
        "Aucun concurrent direct classé. Les institutions, logiciels et entités non classées restent dans « Toutes les entités »."
      )}

      {renderEntityTable(
        filteredEntities,
        "Toutes les entités",
        "Aucune entité pour ce filtre."
      )}

      {selectedEntityMeta ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Détail —{" "}
                {selectedEntityMeta.canonicalName || selectedEntityMeta.name}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {CATEGORY_LABELS[selectedEntityMeta.category ?? "unknown"] ??
                  selectedEntityMeta.category}
                {selectedEntityMeta.categoryManual
                  ? " · correction manuelle verrouillée"
                  : ""}
              </p>
            </div>
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-slate-800"
              onClick={() => setSelectedEntityKey(null)}
            >
              Fermer
            </button>
          </div>

          <p className="mt-2 text-sm text-slate-700">
            {selectedEntityMeta.categoryJustification ??
              "Aucune justification enregistrée."}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-xs uppercase text-slate-500">
                Catégorie (manuel)
              </span>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-xs uppercase text-slate-500">
                Alias (séparés par virgule)
              </span>
              <input
                value={editAliases}
                onChange={(e) => setEditAliases(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy != null}
            onClick={() => void saveEntityCorrection()}
            className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {busy === "entity" ? "Enregistrement…" : "Enregistrer la correction"}
          </button>

          <h3 className="mt-4 text-xs font-semibold uppercase text-slate-500">
            Observations ({selectedEntityMentions.length})
          </h3>
          <ul className="mt-2 space-y-2 text-sm">
            {selectedEntityMentions.map(({ mention, response }) => {
              const question = campaign.questions.find(
                (item) => item.id === response.questionId
              );
              return (
                <li
                  key={mention.id}
                  className="rounded-md border border-slate-100 bg-slate-50 p-2"
                >
                  <p className="font-medium text-slate-800">
                    {mention.kind}
                    {mention.rawName ? ` · brut : ${mention.rawName}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {question?.text ?? "Question"} · rep{" "}
                    {response.repetitionIndex}
                  </p>
                  {mention.excerpt ? (
                    <p className="mt-1 text-slate-600">« {mention.excerpt} »</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Réponses ({campaign.responses.length})
        </h2>
        {campaign.responses.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Aucune réponse pour l’instant.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {campaign.responses.map((response) => {
              const question = campaign.questions.find(
                (item) => item.id === response.questionId
              );
              return (
                <button
                  key={response.id}
                  type="button"
                  onClick={() => setSelectedResponseId(response.id)}
                  className={`block w-full rounded-md border px-3 py-2 text-left text-sm ${
                    selectedResponseId === response.id
                      ? "border-naxialis-dark bg-slate-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-800">
                      Q{question ? campaign.questions.indexOf(question) + 1 : "?"}{" "}
                      · rep {response.repetitionIndex} · {response.status}
                    </p>
                    <p className="text-xs text-slate-500">
                      {response.mentions.length} entité(s)
                      {response.durationMs != null
                        ? ` · ${response.durationMs} ms`
                        : ""}
                    </p>
                  </div>
                  <p className="mt-1 line-clamp-1 text-slate-600">
                    {question?.text ?? "Question"}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {selectedResponse ? (
          <div className="mt-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <h3 className="font-semibold text-slate-900">Réponse brute</h3>
            {selectedResponse.error ? (
              <p className="text-red-700">{selectedResponse.error}</p>
            ) : null}
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-white p-3 text-xs text-slate-800">
              {selectedResponse.responseText || "(vide)"}
            </pre>
            <div>
              <h4 className="font-medium text-slate-800">Mentions</h4>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {selectedResponse.mentions.map((mention) => (
                  <li key={mention.id}>
                    {mention.entity.canonicalName || mention.entity.name} (
                    {CATEGORY_LABELS[mention.entity.category ?? ""] ??
                      mention.entity.kind}
                    ) — {mention.kind}
                    {mention.excerpt ? (
                      <span className="block text-xs text-slate-500">
                        « {mention.excerpt} »
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-slate-800">Sources citées</h4>
              {selectedCitations.length === 0 ? (
                <p className="text-xs text-slate-500">Aucune source.</p>
              ) : (
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {selectedCitations.map((citation) => (
                    <li key={citation.id}>
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-naxialis-dark hover:underline"
                      >
                        {citation.title || citation.url}
                      </a>
                      {citation.domain ? (
                        <span className="text-xs text-slate-500">
                          {" "}
                          ({citation.domain})
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {editorialHints.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Opportunités éditoriales (consultation)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Aucune création automatique de Topic ni brouillon WordPress. Validation
            manuelle requise avant réutilisation éventuelle du SEO Opportunity
            Finder.
          </p>
          <ul className="mt-3 space-y-3">
            {editorialHints.map((hint, index) => (
              <li
                key={`${hint.title}-${index}`}
                className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm"
              >
                <p className="font-medium text-slate-900">{hint.title}</p>
                <p className="mt-1 text-slate-600">{hint.rationale}</p>
                {hint.relatedQuestions?.length ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Questions liées : {hint.relatedQuestions.join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
