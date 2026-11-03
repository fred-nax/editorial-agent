"use client";

import { useEffect, useMemo, useState } from "react";
import { EDITORIAL_DOMAINS } from "@/lib/seo/domains";
import {
  ALLOWED_REQUEST_COUNTS,
  RESEARCH_GOALS,
  defaultDomainSelections,
  type DomainSelection,
  type ResearchConfiguration,
  type ResearchGoal,
  type ResearchMode,
} from "@/lib/seo/research-config";

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
};

type Props = {
  open: boolean;
  onClose: () => void;
  onLaunch: (config: ResearchConfiguration) => Promise<void>;
  savedConfigs: SavedConfig[];
  customThemes: CustomTheme[];
  launching: boolean;
  onConfigsChanged: () => Promise<void>;
};

function asDomainSelections(value: unknown): DomainSelection[] {
  if (!Array.isArray(value)) {
    return defaultDomainSelections();
  }
  const defaults = defaultDomainSelections();
  return defaults.map((domain) => {
    const match = value.find(
      (item) =>
        item &&
        typeof item === "object" &&
        (item as DomainSelection).domainId === domain.domainId
    ) as DomainSelection | undefined;
    if (!match) {
      return { ...domain, enabled: false, quota: 0 };
    }
    return {
      domainId: domain.domainId,
      enabled: match.enabled !== false && Number(match.quota) > 0,
      quota: Number(match.quota) || 0,
      description: match.description ?? null,
    };
  });
}

export function ResearchConfigModal({
  open,
  onClose,
  onLaunch,
  savedConfigs,
  customThemes,
  launching,
  onConfigsChanged,
}: Props) {
  const [mode, setMode] = useState<ResearchMode>("domains");
  const [domains, setDomains] = useState<DomainSelection[]>(defaultDomainSelections());
  const [customTopic, setCustomTopic] = useState("");
  const [researchGoal, setResearchGoal] = useState<ResearchGoal>("seo");
  const [requestedCount, setRequestedCount] = useState(10);
  const [instructions, setInstructions] = useState("");
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [configName, setConfigName] = useState("");
  const [saveTheme, setSaveTheme] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
  }, [open]);

  const totalQuota = useMemo(
    () =>
      domains.reduce(
        (sum, item) => sum + (item.enabled ? Math.max(0, item.quota) : 0),
        0
      ),
    [domains]
  );

  function loadConfig(id: string) {
    setSelectedConfigId(id);
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
    if (config.mode === "domains") {
      setDomains(asDomainSelections(config.domains));
    }
  }

  function loadTheme(themeId: string) {
    const theme = customThemes.find((item) => item.id === themeId);
    if (!theme) {
      return;
    }
    setMode("free");
    setCustomTopic(theme.name);
    if (theme.description) {
      setInstructions(theme.description);
    }
  }

  function buildPayload(): ResearchConfiguration {
    return {
      mode,
      researchGoal,
      researchInstructions: instructions.trim() || null,
      customTopic: mode === "free" ? customTopic.trim() : null,
      requestedCount: mode === "free" ? requestedCount : totalQuota,
      domains:
        mode === "domains"
          ? domains.map((item) => ({
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
      setError(err instanceof Error ? err.message : "Erreur enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLaunch() {
    setError(null);
    try {
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
        await onConfigsChanged();
      }
      await onLaunch(buildPayload());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lancement impossible.");
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8">
      <div className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Configurer la recherche
            </h2>
            <p className="text-sm text-slate-500">
              Domaines Naxialis ou sujet libre — sans génération d’article.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
          >
            Fermer
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
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
                Thématique personnalisée
              </span>
              <select
                defaultValue=""
                onChange={(event) => loadTheme(event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="">Charger une thématique…</option>
                {customThemes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("domains")}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                mode === "domains"
                  ? "bg-naxialis text-white"
                  : "border border-slate-300 text-slate-700"
              }`}
            >
              Domaines Naxialis
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
          </div>

          {mode === "domains" ? (
            <div className="space-y-3">
              {domains.map((item, index) => {
                const meta = EDITORIAL_DOMAINS.find((d) => d.id === item.domainId);
                return (
                  <div
                    key={item.domainId}
                    className="rounded-md border border-slate-200 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={(event) => {
                            const next = [...domains];
                            next[index] = {
                              ...item,
                              enabled: event.target.checked,
                              quota: event.target.checked
                                ? item.quota || meta?.defaultQuota || 1
                                : 0,
                            };
                            setDomains(next);
                          }}
                        />
                        {meta?.label ?? item.domainId}
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        Quota
                        <input
                          type="number"
                          min={0}
                          max={30}
                          disabled={!item.enabled}
                          value={item.quota}
                          onChange={(event) => {
                            const next = [...domains];
                            next[index] = {
                              ...item,
                              quota: Number(event.target.value) || 0,
                            };
                            setDomains(next);
                          }}
                          className="w-20 rounded-md border border-slate-300 px-2 py-1"
                        />
                      </label>
                    </div>
                    <input
                      type="text"
                      placeholder="Description éditoriale facultative"
                      value={item.description ?? ""}
                      disabled={!item.enabled}
                      onChange={(event) => {
                        const next = [...domains];
                        next[index] = {
                          ...item,
                          description: event.target.value,
                        };
                        setDomains(next);
                      }}
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                );
              })}
              <p className="text-sm text-slate-600">
                Total demandé : <strong>{totalQuota}</strong>
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
                  onChange={(event) => setCustomTopic(event.target.value)}
                  placeholder="Ex. Cybersécurité des PME"
                  className="rounded-md border border-slate-300 px-3 py-2"
                  maxLength={200}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">
                  Nombre d’opportunités
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
            <span className="font-medium text-slate-700">Objectif de recherche</span>
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
              {RESEARCH_GOALS.find((goal) => goal.id === researchGoal)
                ?.description ?? ""}
              {researchGoal === "trends"
                ? " Les sources générales hors angle ne compteront pas comme preuve de tendance."
                : ""}
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">
              Consignes complémentaires
            </span>
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Paramètres de recherche (pas d’instructions système)."
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">
                Nom de la configuration
              </span>
              <input
                type="text"
                value={configName}
                onChange={(event) => setConfigName(event.target.value)}
                placeholder="Ex. Veille IA hebdomadaire"
                className="rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="button"
              disabled={saving || launching}
              onClick={() => void handleSaveConfig()}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : "Enregistrer la configuration"}
            </button>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={launching}
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
