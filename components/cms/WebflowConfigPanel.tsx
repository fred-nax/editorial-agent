"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WebflowReferencesSection } from "@/components/cms/WebflowReferencesSection";
import type { PublicSettingsView } from "@/components/settings/types";
import {
  WEBFLOW_OPTIONAL_EDITORIAL_FIELDS,
  WEBFLOW_REQUIRED_EDITORIAL_FIELDS,
  type WebflowCollectionField,
  type WebflowCollectionSummary,
  type WebflowEditorialFieldKey,
  type WebflowFieldMapping,
  type WebflowMappingIssue,
  type WebflowSiteSummary,
} from "@/lib/webflow/types";

type Props = {
  initial: PublicSettingsView["webflow"];
  encryptionConfigured: boolean;
  onUpdated?: (webflow: PublicSettingsView["webflow"]) => void;
};

const EDITORIAL_LABELS: Record<WebflowEditorialFieldKey, string> = {
  title: "Titre",
  slug: "Slug",
  content: "Contenu (Rich Text)",
  excerpt: "Résumé / excerpt",
  meta_title: "Titre SEO",
  meta_description: "Description SEO",
  featured_image: "Image à la une (facultatif)",
  alt_text: "Texte ALT (facultatif)",
  category: "Catégorie (facultatif)",
  author: "Auteur (facultatif)",
  reading_time: "Temps de lecture (facultatif)",
};

function emptyMappingFrom(
  current: PublicSettingsView["webflow"]["fieldMapping"]
): WebflowFieldMapping {
  const next: WebflowFieldMapping = {};
  for (const key of [
    ...WEBFLOW_REQUIRED_EDITORIAL_FIELDS,
    ...WEBFLOW_OPTIONAL_EDITORIAL_FIELDS,
  ]) {
    const entry = current[key];
    if (entry?.fieldId) {
      next[key] = {
        fieldId: entry.fieldId,
        fieldSlug: entry.fieldSlug ?? null,
        fieldType: entry.fieldType ?? null,
        displayName: entry.displayName ?? null,
      };
    }
  }
  return next;
}

export function WebflowConfigPanel({
  initial,
  encryptionConfigured,
  onUpdated,
}: Props) {
  const [open, setOpen] = useState(!initial.connectionConfigured);
  const [agentId, setAgentId] = useState(initial.agentId ?? "");
  const [apiToken, setApiToken] = useState("");
  const [siteId, setSiteId] = useState(initial.siteId ?? "");
  const [collectionId, setCollectionId] = useState(initial.collectionId ?? "");
  const [mapping, setMapping] = useState<WebflowFieldMapping>(() =>
    emptyMappingFrom(initial.fieldMapping)
  );
  const [sites, setSites] = useState<WebflowSiteSummary[]>([]);
  const [collections, setCollections] = useState<WebflowCollectionSummary[]>(
    []
  );
  const [fields, setFields] = useState<WebflowCollectionField[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [mappingIssues, setMappingIssues] = useState<WebflowMappingIssue[]>(
    []
  );

  const tokenHint = initial.apiTokenConfigured
    ? "Token enregistré — laissez vide pour conserver."
    : "Token Data API V2 (jamais réaffiché).";

  const fieldOptions = useMemo(
    () =>
      fields.map((field) => ({
        value: field.id,
        label: `${field.displayName}${field.slug ? ` (${field.slug})` : ""} · ${field.type}${field.isRequired ? " · requis" : ""}`,
      })),
    [fields]
  );

  const loadSites = useCallback(async () => {
    setLoadingSites(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/webflow/sites", {
        credentials: "same-origin",
      });
      const payload = (await response.json()) as {
        sites?: WebflowSiteSummary[];
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Impossible de charger les sites.");
        return;
      }
      setSites(payload.sites ?? []);
    } catch {
      setError("Impossible de charger les sites Webflow.");
    } finally {
      setLoadingSites(false);
    }
  }, []);

  const loadCollections = useCallback(async (selectedSiteId: string) => {
    if (!selectedSiteId) {
      setCollections([]);
      return;
    }
    setLoadingCollections(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/settings/webflow/collections?siteId=${encodeURIComponent(selectedSiteId)}`,
        { credentials: "same-origin" }
      );
      const payload = (await response.json()) as {
        collections?: WebflowCollectionSummary[];
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Impossible de charger les collections.");
        return;
      }
      setCollections(payload.collections ?? []);
    } catch {
      setError("Impossible de charger les collections Webflow.");
    } finally {
      setLoadingCollections(false);
    }
  }, []);

  const loadFields = useCallback(async (selectedCollectionId: string) => {
    if (!selectedCollectionId) {
      setFields([]);
      return;
    }
    setLoadingFields(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/settings/webflow/collections/${encodeURIComponent(selectedCollectionId)}/fields`,
        { credentials: "same-origin" }
      );
      const payload = (await response.json()) as {
        collection?: { fields?: WebflowCollectionField[] };
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Impossible de charger les champs.");
        return;
      }
      setFields(payload.collection?.fields ?? []);
    } catch {
      setError("Impossible de charger les champs de la collection.");
    } finally {
      setLoadingFields(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !initial.apiTokenConfigured) {
      return;
    }
    void loadSites();
  }, [open, initial.apiTokenConfigured, loadSites]);

  useEffect(() => {
    if (!open || !siteId || !initial.apiTokenConfigured) {
      return;
    }
    void loadCollections(siteId);
  }, [open, siteId, initial.apiTokenConfigured, loadCollections]);

  useEffect(() => {
    if (!open || !collectionId || !initial.apiTokenConfigured) {
      return;
    }
    void loadFields(collectionId);
  }, [open, collectionId, initial.apiTokenConfigured, loadFields]);

  function setMappingField(
    editorial: WebflowEditorialFieldKey,
    fieldId: string
  ) {
    if (!fieldId) {
      setMapping((prev) => {
        const next = { ...prev };
        delete next[editorial];
        return next;
      });
      return;
    }
    const field = fields.find((item) => item.id === fieldId);
    setMapping((prev) => ({
      ...prev,
      [editorial]: {
        fieldId,
        fieldSlug: field?.slug ?? null,
        fieldType: field?.type ?? null,
        displayName: field?.displayName ?? null,
      },
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    setMappingIssues([]);
    try {
      const body: Record<string, unknown> = {
        agentId: agentId.trim() || null,
        siteId: siteId.trim() || null,
        collectionId: collectionId.trim() || null,
        fieldMapping: mapping,
      };
      if (apiToken.trim()) {
        body.apiToken = apiToken.trim();
      }

      const response = await fetch("/api/settings/webflow", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as PublicSettingsView & {
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Enregistrement impossible.");
        return;
      }
      onUpdated?.(payload.webflow);
      setAgentId(payload.webflow.agentId ?? "");
      setSiteId(payload.webflow.siteId ?? "");
      setCollectionId(payload.webflow.collectionId ?? "");
      setMapping(emptyMappingFrom(payload.webflow.fieldMapping));
      setApiToken("");
      setNotice(
        "Configuration Webflow enregistrée. Génération d’items toujours désactivée."
      );

      if (payload.webflow.apiTokenConfigured && payload.webflow.collectionId) {
        await validateMapping(
          payload.webflow.collectionId,
          emptyMappingFrom(payload.webflow.fieldMapping)
        );
      }
    } catch {
      setError("Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function validateMapping(
    targetCollectionId: string,
    targetMapping: WebflowFieldMapping
  ) {
    try {
      const response = await fetch("/api/settings/webflow/mapping/validate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: targetCollectionId,
          fieldMapping: targetMapping,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        issues?: WebflowMappingIssue[];
        error?: string;
      };
      if (!response.ok) {
        setMappingIssues([
          {
            code: "invalid_entry",
            message: payload.error ?? "Validation du mapping impossible.",
          },
        ]);
        return;
      }
      setMappingIssues(payload.issues ?? []);
    } catch {
      setMappingIssues([
        {
          code: "invalid_entry",
          message: "Validation du mapping impossible.",
        },
      ]);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestOk(null);
    setTestMessage(null);
    try {
      const response = await fetch("/api/settings/webflow/test", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiToken: apiToken.trim() || undefined,
          siteId: siteId.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        details?: {
          featuredImagesReady?: boolean | null;
          assetsReadOk?: boolean | number | null;
          assetsProbeMessage?: string | null;
        };
      };
      setTestOk(Boolean(payload.ok));
      let message = payload.message ?? "Résultat du test indisponible.";
      if (payload.ok && payload.details?.featuredImagesReady === false) {
        message +=
          " Attention : le token peut être valide pour sites/cms sans autoriser Assets (images à la une).";
      }
      setTestMessage(message);
      if (payload.ok) {
        await loadSites();
        if (siteId.trim()) {
          await loadCollections(siteId.trim());
        }
      }
    } catch {
      setTestOk(false);
      setTestMessage("Test de connexion impossible.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Masquer la configuration" : "Configurer Webflow"}
        </Button>
      </div>

      {open ? (
        <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50/80 p-4">
          {!encryptionConfigured ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              APP_SETTINGS_ENCRYPTION_KEY requis pour enregistrer le token
              Webflow en base.
            </p>
          ) : null}

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {notice}
            </p>
          ) : null}
          {testMessage ? (
            <p
              className={`rounded-md border px-3 py-2 text-sm ${
                testOk
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-950"
              }`}
            >
              {testMessage}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="webflow-token">Token API Webflow</Label>
              <Input
                id="webflow-token"
                type="password"
                autoComplete="off"
                value={apiToken}
                onChange={(event) => setApiToken(event.target.value)}
                placeholder={tokenHint}
              />
              <p className="text-xs text-slate-500">{tokenHint}</p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="webflow-agent">
                Identifiant agent OpenAI Webflow
              </Label>
              <Input
                id="webflow-agent"
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
                placeholder="OPENAI_WEBFLOW_AGENT_ID"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void testConnection()}
              disabled={testing || (!apiToken.trim() && !initial.apiTokenConfigured)}
            >
              {testing ? "Test en cours…" : "Tester la connexion"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadSites()}
              disabled={loadingSites || !initial.apiTokenConfigured}
            >
              {loadingSites ? "Chargement…" : "Rafraîchir les sites"}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="webflow-site">Site Webflow</Label>
              <select
                id="webflow-site"
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={siteId}
                onChange={(event) => {
                  setSiteId(event.target.value);
                  setCollectionId("");
                  setFields([]);
                  setCollections([]);
                }}
              >
                <option value="">— Sélectionner —</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.displayName}
                    {site.shortName ? ` (${site.shortName})` : ""}
                  </option>
                ))}
              </select>
              {siteId && sites.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Site courant : {siteId}
                  {loadingSites ? " (chargement…)" : ""}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="webflow-collection">Collection CMS</Label>
              <select
                id="webflow-collection"
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={collectionId}
                disabled={!siteId || loadingCollections}
                onChange={(event) => {
                  setCollectionId(event.target.value);
                  setFields([]);
                }}
              >
                <option value="">— Sélectionner —</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.displayName}
                    {collection.slug ? ` (${collection.slug})` : ""}
                  </option>
                ))}
              </select>
              {loadingCollections ? (
                <p className="text-xs text-slate-500">
                  Chargement des collections…
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Mapping des champs
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Associez chaque donnée éditoriale à un champ réel de la
                collection. Les slugs ne sont pas supposés identiques d’un site
                à l’autre.
              </p>
              {loadingFields ? (
                <p className="mt-2 text-xs text-slate-500">
                  Chargement des champs…
                </p>
              ) : null}
            </div>

            <div className="grid gap-3">
              {(
                [
                  ...WEBFLOW_REQUIRED_EDITORIAL_FIELDS,
                  ...WEBFLOW_OPTIONAL_EDITORIAL_FIELDS,
                ] as WebflowEditorialFieldKey[]
              ).map((editorial) => (
                <div key={editorial} className="space-y-1">
                  <Label htmlFor={`wf-map-${editorial}`}>
                    {EDITORIAL_LABELS[editorial]}
                    {WEBFLOW_REQUIRED_EDITORIAL_FIELDS.includes(
                      editorial as (typeof WEBFLOW_REQUIRED_EDITORIAL_FIELDS)[number]
                    )
                      ? " *"
                      : ""}
                  </Label>
                  <select
                    id={`wf-map-${editorial}`}
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    value={mapping[editorial]?.fieldId ?? ""}
                    disabled={fields.length === 0}
                    onChange={(event) =>
                      setMappingField(editorial, event.target.value)
                    }
                  >
                    <option value="">— Non associé —</option>
                    {fieldOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {mappingIssues.length > 0 ? (
              <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {mappingIssues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>{issue.message}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!collectionId || fields.length === 0}
              onClick={() => void validateMapping(collectionId, mapping)}
            >
              Valider le mapping
            </Button>
          </div>

          {initial.connectionConfigured && collectionId ? (
            <WebflowReferencesSection />
          ) : null}

          <p className="text-xs text-slate-500">
            Les brouillons CMS sont créés en staged uniquement — aucune
            publication automatique.
          </p>
        </div>
      ) : null}
    </div>
  );
}
