"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, CircleHelp, Settings2 } from "lucide-react";
import {
  ALLOWED_REQUEST_COUNTS,
  RESEARCH_GOALS,
  type DomainSelection,
  type ResearchConfiguration,
  type ResearchGoal,
  type ResearchMode,
} from "@/lib/seo/research-config";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type SavedConfig = {
  id: string;
  name: string;
  mode: ResearchMode;
  researchGoal: ResearchGoal;
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
  defaultQuota?: number;
  explorationAngles?: unknown;
  legacyKey?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onLaunch: (config: ResearchConfiguration) => Promise<void>;
  savedConfigs: SavedConfig[];
  customThemes: CustomTheme[];
  launching: boolean;
  onConfigsChanged: () => Promise<void>;
  /** Ouvre le gestionnaire de thématiques sans superposer deux Dialog. */
  onManageThemes?: () => void;
};

function themesToSelections(themes: CustomTheme[]): DomainSelection[] {
  return themes
    .filter((theme) => theme.active)
    .map((theme) => ({
      domainId: theme.id,
      enabled: true,
      quota: theme.defaultQuota ?? 5,
      description: null,
    }));
}

function findTheme(
  themes: CustomTheme[],
  domainId: string
): CustomTheme | undefined {
  return themes.find(
    (theme) =>
      theme.id === domainId ||
      (theme.legacyKey != null && theme.legacyKey === domainId)
  );
}

/**
 * Charge une config sauvegardée : conserve les valeurs (y compris thématiques
 * inactives pour consultation) et complète avec les thématiques actives absentes.
 */
function asDomainSelections(
  value: unknown,
  themes: CustomTheme[]
): DomainSelection[] {
  if (!Array.isArray(value)) {
    return themesToSelections(themes);
  }

  const result: DomainSelection[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as DomainSelection;
    if (typeof row.domainId !== "string") {
      continue;
    }
    const theme = findTheme(themes, row.domainId);
    if (!theme || seen.has(theme.id)) {
      continue;
    }
    seen.add(theme.id);
    result.push({
      domainId: theme.id,
      enabled: row.enabled !== false && Number(row.quota) > 0,
      quota: Number(row.quota) || 0,
      description: row.description ?? null,
    });
  }

  for (const theme of themes.filter((item) => item.active)) {
    if (seen.has(theme.id)) {
      continue;
    }
    result.push({
      domainId: theme.id,
      enabled: false,
      quota: theme.defaultQuota ?? 5,
      description: null,
    });
  }

  return result;
}

/** Après retour du gestionnaire : conserve les saisies, synchronise le catalogue. */
function mergeDomainsWithCatalog(
  prev: DomainSelection[],
  themes: CustomTheme[]
): DomainSelection[] {
  const prevById = new Map(prev.map((item) => [item.domainId, item]));
  const next: DomainSelection[] = [];
  const seen = new Set<string>();

  for (const theme of themes.filter((item) => item.active)) {
    const existing = prevById.get(theme.id);
    next.push(
      existing ?? {
        domainId: theme.id,
        enabled: true,
        quota: theme.defaultQuota ?? 5,
        description: null,
      }
    );
    seen.add(theme.id);
  }

  for (const item of prev) {
    if (seen.has(item.domainId)) {
      continue;
    }
    const theme = findTheme(themes, item.domainId);
    if (theme && !theme.active) {
      next.push(item);
      seen.add(item.domainId);
    }
  }

  return next;
}

function QuotaHelpTooltip() {
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          type="button"
          delay={200}
          closeOnClick={false}
          className="inline-flex size-5 items-center justify-center rounded text-slate-400 outline-none transition-colors hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-[#0F5270]/30"
          aria-label="À propos du quota"
        >
          <CircleHelp className="size-3.5" aria-hidden />
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="z-[60] max-w-[280px] flex-col items-start gap-1.5 whitespace-normal border border-slate-200 bg-white px-3 py-2.5 text-left text-xs leading-relaxed text-slate-700 shadow-md [&>*:last-child]:border [&>*:last-child]:border-r-0 [&>*:last-child]:border-b-0 [&>*:last-child]:border-slate-200 [&>*:last-child]:bg-white [&>*:last-child]:fill-white"
        >
          <span className="font-semibold text-slate-900">
            À quoi sert le quota ?
          </span>
          <span>
            Nombre cible d’opportunités SEO à générer pour cette thématique lors
            d’une recherche.
          </span>
          <span>
            Le résultat final peut être inférieur au nombre demandé après
            validation et détection des doublons.
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ResearchConfigModal({
  open,
  onClose,
  onLaunch,
  savedConfigs,
  customThemes,
  launching,
  onConfigsChanged,
  onManageThemes,
}: Props) {
  const activeThemes = useMemo(
    () => customThemes.filter((theme) => theme.active),
    [customThemes]
  );
  const inactiveThemes = useMemo(
    () => customThemes.filter((theme) => !theme.active),
    [customThemes]
  );

  const [mode, setMode] = useState<ResearchMode>("domains");
  const [domains, setDomains] = useState<DomainSelection[]>([]);
  const [customTopic, setCustomTopic] = useState("");
  const [researchGoal, setResearchGoal] = useState<ResearchGoal>("seo");
  const [requestedCount, setRequestedCount] = useState(10);
  const [instructions, setInstructions] = useState("");
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [configName, setConfigName] = useState("");
  const [saveTheme, setSaveTheme] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedAdvanced, setExpandedAdvanced] = useState<
    Record<string, boolean>
  >({});

  const preserveDraftRef = useRef(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }

    setError(null);

    if (preserveDraftRef.current) {
      preserveDraftRef.current = false;
      wasOpenRef.current = true;
      setDomains((prev) => mergeDomainsWithCatalog(prev, customThemes));
      return;
    }

    // Première ouverture de la session : quotas catalogue. Les réouvertures
    // (hors retour « Gérer les thématiques ») conservent le brouillon local.
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      setDomains((prev) =>
        prev.length === 0
          ? themesToSelections(activeThemes)
          : mergeDomainsWithCatalog(prev, customThemes)
      );
    }
  }, [open, activeThemes, customThemes]);

  const themeById = useMemo(() => {
    const map = new Map<string, CustomTheme>();
    for (const theme of customThemes) {
      map.set(theme.id, theme);
    }
    return map;
  }, [customThemes]);

  const totalQuota = useMemo(
    () =>
      domains.reduce((sum, item) => {
        const theme = themeById.get(item.domainId);
        if (!theme?.active || !item.enabled) {
          return sum;
        }
        return sum + Math.max(0, item.quota);
      }, 0),
    [domains, themeById]
  );

  function loadConfig(id: string) {
    setSelectedConfigId(id);
    setExpandedAdvanced({});
    if (!id) {
      setDomains(themesToSelections(activeThemes));
      setConfigName("");
      setSelectedThemeId(null);
      setMode("domains");
      setCustomTopic("");
      setInstructions("");
      setResearchGoal("seo");
      setRequestedCount(10);
      return;
    }
    const config = savedConfigs.find((item) => item.id === id);
    if (!config) {
      return;
    }
    setMode(config.mode);
    setResearchGoal(config.researchGoal);
    setRequestedCount(config.requestedCount);
    setCustomTopic(config.customTopic ?? "");
    setInstructions(config.researchInstructions ?? "");
    setConfigName(config.name);
    setSelectedThemeId(config.customThemeId);
    if (config.mode === "domains") {
      setDomains(asDomainSelections(config.domains, customThemes));
    }
  }

  function loadTheme(themeId: string) {
    if (!themeId) {
      return;
    }
    const theme = customThemes.find((item) => item.id === themeId);
    if (!theme) {
      return;
    }
    setMode("free");
    setCustomTopic(theme.name);
    setSelectedThemeId(theme.id);
    if (theme.description) {
      setInstructions(theme.description);
    }
  }

  function updateDomain(domainId: string, patch: Partial<DomainSelection>) {
    setDomains((prev) =>
      prev.map((item) =>
        item.domainId === domainId ? { ...item, ...patch } : item
      )
    );
  }

  function toggleAdvanced(domainId: string) {
    setExpandedAdvanced((prev) => ({
      ...prev,
      [domainId]: !prev[domainId],
    }));
  }

  function buildPayload(): ResearchConfiguration {
    return {
      mode,
      researchGoal,
      researchInstructions: instructions.trim() || null,
      customTopic: mode === "free" ? customTopic.trim() : null,
      requestedCount: mode === "free" ? requestedCount : totalQuota,
      customThemeId: mode === "free" ? selectedThemeId : null,
      domains:
        mode === "domains"
          ? domains
              .filter((item) => themeById.get(item.domainId)?.active)
              .map((item) => ({
                ...item,
                enabled: item.enabled && item.quota > 0,
              }))
          : undefined,
      configId: selectedConfigId || null,
    };
  }

  async function handleSaveConfig() {
    setSaving(true);
    setError(null);
    try {
      const name = configName.trim();
      if (!name) {
        throw new Error("Indiquez un nom pour enregistrer la configuration.");
      }
      const payload = { name, ...buildPayload() };
      const response = selectedConfigId
        ? await fetch(`/api/research-configs/${selectedConfigId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/research-configs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = (await response.json()) as {
        error?: string;
        config?: SavedConfig;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Enregistrement impossible.");
      }
      if (data.config) {
        setSelectedConfigId(data.config.id);
      }
      await onConfigsChanged();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Enregistrement impossible."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleLaunch() {
    setError(null);
    try {
      let themeIdForLaunch = selectedThemeId;
      if (mode === "free" && saveTheme && customTopic.trim()) {
        const themeResponse = await fetch("/api/custom-themes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: customTopic.trim(),
            description: instructions.trim() || null,
          }),
        });
        const themePayload = (await themeResponse.json()) as {
          error?: string;
          theme?: CustomTheme;
        };
        if (!themeResponse.ok) {
          throw new Error(themePayload.error ?? "Thématique non enregistrée.");
        }
        themeIdForLaunch = themePayload.theme?.id ?? themeIdForLaunch;
        await onConfigsChanged();
      }
      const payload = buildPayload();
      if (mode === "free") {
        payload.customThemeId = themeIdForLaunch;
      }
      await onLaunch(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lancement impossible.");
    }
  }

  function handleManageThemes() {
    if (!onManageThemes) {
      return;
    }
    preserveDraftRef.current = true;
    onManageThemes();
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3 sm:p-6">
      <div className="my-2 flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl sm:my-4">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Configurer la recherche
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            Fermer
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">
                Configuration enregistrée
              </span>
              <select
                value={selectedConfigId}
                onChange={(event) => loadConfig(event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="">Nouvelle configuration</option>
                {savedConfigs.map((config) => (
                  <option key={config.id} value={config.id}>
                    {config.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">
                Charger une thématique (sujet libre)
              </span>
              <select
                defaultValue=""
                onChange={(event) => {
                  loadTheme(event.target.value);
                  event.target.value = "";
                }}
                className="rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="">Charger une thématique…</option>
                {activeThemes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                  </option>
                ))}
                {inactiveThemes.length > 0 ? (
                  <optgroup label="Inactives (historique)">
                    {inactiveThemes.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {theme.name} (inactive)
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("domains")}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                mode === "domains"
                  ? "bg-naxialis text-white"
                  : "border border-slate-300 text-slate-700"
              }`}
            >
              Thématiques configurées
            </button>
            <button
              type="button"
              onClick={() => setMode("free")}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                mode === "free"
                  ? "bg-naxialis text-white"
                  : "border border-slate-300 text-slate-700"
              }`}
            >
              Sujet libre
            </button>
            {onManageThemes ? (
              <button
                type="button"
                onClick={handleManageThemes}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Settings2 className="size-3.5" aria-hidden />
                Gérer les thématiques
              </button>
            ) : null}
          </div>

          {mode === "domains" ? (
            <div className="space-y-2">
              {activeThemes.length === 0 &&
              !domains.some((item) => themeById.get(item.domainId)) ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Aucune thématique active. Utilisez « Gérer les thématiques »
                  avant de lancer une recherche multi-thématiques.
                </p>
              ) : null}

              <ul className="divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200">
                {domains.map((item) => {
                  const meta = themeById.get(item.domainId);
                  const inactive = Boolean(meta && !meta.active);
                  const advancedOpen = Boolean(expandedAdvanced[item.domainId]);
                  const hasDescription = Boolean(
                    item.description && item.description.trim()
                  );

                  return (
                    <li
                      key={item.domainId}
                      className={`bg-white ${inactive ? "bg-slate-50/80" : ""}`}
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-slate-800">
                          <input
                            type="checkbox"
                            checked={item.enabled && !inactive}
                            disabled={inactive || launching || saving}
                            onChange={(event) => {
                              updateDomain(item.domainId, {
                                enabled: event.target.checked,
                                quota: event.target.checked
                                  ? item.quota || meta?.defaultQuota || 1
                                  : 0,
                              });
                            }}
                          />
                          <span className="truncate">
                            {meta?.name ?? item.domainId}
                          </span>
                          {inactive ? (
                            <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                              Inactive
                            </span>
                          ) : null}
                        </label>

                        <div className="flex items-center gap-1.5 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                            Quota
                            <QuotaHelpTooltip />
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={30}
                            disabled={
                              inactive ||
                              !item.enabled ||
                              launching ||
                              saving
                            }
                            value={item.quota}
                            onChange={(event) => {
                              updateDomain(item.domainId, {
                                quota: Number(event.target.value) || 0,
                              });
                            }}
                            className="h-8 w-16 rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus-visible:border-[#0F5270] focus-visible:ring-2 focus-visible:ring-[#0F5270]/20 disabled:bg-slate-100"
                            aria-label={`Quota pour ${meta?.name ?? item.domainId}`}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleAdvanced(item.domainId)}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          aria-expanded={advancedOpen}
                        >
                          <ChevronDown
                            className={`size-3.5 transition-transform ${
                              advancedOpen ? "rotate-180" : ""
                            }`}
                            aria-hidden
                          />
                          Options
                          {hasDescription && !advancedOpen ? (
                            <span
                              className="size-1.5 rounded-full bg-[#0F5270]"
                              aria-hidden
                            />
                          ) : null}
                        </button>
                      </div>

                      {advancedOpen ? (
                        <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2.5">
                          <label className="flex flex-col gap-1 text-sm">
                            <span className="font-medium text-slate-700">
                              Consigne spécifique (facultatif)
                            </span>
                            <input
                              type="text"
                              placeholder="Ne remplace pas la description ni les angles du catalogue"
                              value={item.description ?? ""}
                              disabled={
                                inactive ||
                                !item.enabled ||
                                launching ||
                                saving
                              }
                              maxLength={300}
                              onChange={(event) => {
                                updateDomain(item.domainId, {
                                  description: event.target.value,
                                });
                              }}
                              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus-visible:border-[#0F5270] focus-visible:ring-2 focus-visible:ring-[#0F5270]/20 disabled:bg-slate-100"
                            />
                          </label>
                          {inactive ? (
                            <p className="mt-1.5 text-xs text-slate-500">
                              Thématique inactive : conservée pour consultation
                              des anciennes configurations, exclue des nouvelles
                              recherches.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              <p className="text-sm text-slate-600">
                Total demandé : <strong>{totalQuota}</strong>
                {totalQuota > 30 ? (
                  <span className="ml-2 text-amber-700">
                    (max recommandé : 30)
                  </span>
                ) : null}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">
                  Sujet à explorer *
                </span>
                <input
                  type="text"
                  value={customTopic}
                  onChange={(event) => {
                    setCustomTopic(event.target.value);
                    setSelectedThemeId(null);
                  }}
                  placeholder="Ex. Cybersécurité des PME"
                  className="rounded-md border border-slate-300 px-3 py-2"
                  maxLength={200}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                  Nombre d’opportunités
                  <QuotaHelpTooltip />
                </span>
                <select
                  value={requestedCount}
                  onChange={(event) =>
                    setRequestedCount(Number(event.target.value))
                  }
                  className="rounded-md border border-slate-300 px-3 py-2"
                >
                  {ALLOWED_REQUEST_COUNTS.map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={saveTheme}
                  onChange={(event) => setSaveTheme(event.target.checked)}
                />
                Enregistrer comme thématique permanente
              </label>
            </div>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">
              Objectif de recherche
            </span>
            {/* Objectifs supportés : seo | trends | problems | commercial */}
            <select
              value={researchGoal}
              onChange={(event) =>
                setResearchGoal(event.target.value as ResearchGoal)
              }
              className="rounded-md border border-slate-300 px-3 py-2"
            >
              {RESEARCH_GOALS.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">
              {
                RESEARCH_GOALS.find((goal) => goal.id === researchGoal)
                  ?.description
              }
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">
              Consignes de recherche (facultatif)
            </span>
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
              maxLength={2000}
            />
          </label>
        </div>

        <div className="flex shrink-0 flex-wrap items-end gap-2 border-t border-slate-200 bg-slate-50/80 px-4 py-3">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">
              Nom de la configuration
            </span>
            <input
              value={configName}
              onChange={(event) => setConfigName(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2"
              placeholder="Ex. Veille hebdo IA"
            />
          </label>
          <button
            type="button"
            disabled={saving || launching}
            onClick={() => void handleSaveConfig()}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            type="button"
            disabled={launching || saving}
            onClick={() => void handleLaunch()}
            className="rounded-md bg-naxialis px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {launching ? "Lancement…" : "Lancer la recherche"}
          </button>
        </div>
      </div>
    </div>
  );
}
