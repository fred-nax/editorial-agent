"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useWorkspaceOptional } from "@/components/workspace";

type CategoryOption = {
  id: number;
  name: string;
  label?: string;
};

type AuthorOption = {
  id: number;
  name: string;
};

export function WordPressReferencesSection() {
  const workspaceCtx = useWorkspaceOptional();
  const workspaceFetch = workspaceCtx?.workspaceFetch ?? fetch;
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [authors, setAuthors] = useState<AuthorOption[]>([]);
  const [mode, setMode] = useState<"automatic" | "manual">("automatic");
  const [defaultCategoryIds, setDefaultCategoryIds] = useState<number[]>([]);
  const [defaultAuthorId, setDefaultAuthorId] = useState<number | null>(null);
  const [apiUserId, setApiUserId] = useState<number | null>(null);
  const [authorCapability, setAuthorCapability] = useState<string | null>(null);
  const [authorMessage, setAuthorMessage] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await workspaceFetch("/api/wordpress-references");
      const payload = (await response.json()) as {
        categories?: CategoryOption[];
        authors?: AuthorOption[];
        defaults?: {
          mode?: "automatic" | "manual";
          categoryIds?: number[];
          authorId?: number | null;
          apiUserId?: number | null;
        };
        authorCapability?: string | null;
        authorMessage?: string | null;
        syncedAt?: string | null;
        counts?: { categories?: number; authors?: number };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Chargement impossible.");
      }
      setCategories(payload.categories ?? []);
      setAuthors(payload.authors ?? []);
      setMode(payload.defaults?.mode === "manual" ? "manual" : "automatic");
      setDefaultCategoryIds(payload.defaults?.categoryIds ?? []);
      setDefaultAuthorId(payload.defaults?.authorId ?? null);
      setApiUserId(payload.defaults?.apiUserId ?? null);
      setAuthorCapability(payload.authorCapability ?? null);
      setAuthorMessage(payload.authorMessage ?? null);
      setSyncedAt(payload.syncedAt ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, [workspaceFetch]);

  useEffect(() => {
    void load();
  }, [load, workspaceCtx?.epoch]);

  async function syncNow() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await workspaceFetch("/api/wordpress-references", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        categoriesUpserted?: number;
        authorsUpserted?: number;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Synchronisation impossible.");
      }
      setNotice(
        `Synchronisé : ${payload.categoriesUpserted ?? 0} catégorie(s), ${payload.authorsUpserted ?? 0} auteur(s).`
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Synchronisation impossible."
      );
    } finally {
      setSyncing(false);
    }
  }

  async function saveDefaults() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await workspaceFetch(
        "/api/wordpress-references/defaults",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            categoryIds: mode === "manual" ? defaultCategoryIds : [],
            authorId: defaultAuthorId,
          }),
        }
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Enregistrement impossible.");
      }
      setNotice("Paramètres catégories / auteurs enregistrés.");
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Enregistrement impossible."
      );
    } finally {
      setSaving(false);
    }
  }

  function toggleDefaultCategory(id: number) {
    setDefaultCategoryIds((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id]
    );
  }

  const canAssign = authorCapability === "can_assign";

  return (
    <div className="space-y-4 rounded-lg border border-[#E2E8F0] p-4 dark:border-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[#0F172A] dark:text-slate-100">
            Catégories et auteurs WordPress
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Synchronisation lecture seule. Aucune création ni suppression
            distante.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={syncing || loading}
          onClick={() => void syncNow()}
        >
          {syncing ? "Synchronisation…" : "Synchroniser"}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Catégories disponibles</dt>
            <dd className="font-medium">{categories.length}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Auteurs accessibles</dt>
            <dd className="font-medium">{authors.length}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Dernière synchronisation</dt>
            <dd className="font-medium">
              {syncedAt
                ? new Intl.DateTimeFormat("fr-FR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(syncedAt))
                : "Jamais"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Permissions auteur</dt>
            <dd className="font-medium">{authorCapability ?? "unknown"}</dd>
          </div>
        </dl>
      )}

      {authorMessage ? (
        <p className="text-xs text-slate-500">{authorMessage}</p>
      ) : null}

      <div className="space-y-2">
        <Label>Mode de catégorisation par défaut</Label>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={mode === "automatic"}
              onChange={() => setMode("automatic")}
            />
            Automatique (historique)
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={mode === "manual"}
              onChange={() => setMode("manual")}
            />
            Manuel
          </label>
        </div>
      </div>

      {mode === "manual" ? (
        <div className="space-y-2">
          <Label>Catégories par défaut (nouveaux sujets)</Label>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-[#E2E8F0] p-2 text-sm dark:border-slate-600">
            {categories.map((cat) => (
              <li key={cat.id}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={defaultCategoryIds.includes(cat.id)}
                    onChange={() => toggleDefaultCategory(cat.id)}
                  />
                  <span>{cat.label || cat.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>Auteur par défaut</Label>
        <select
          className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
          disabled={!canAssign}
          value={defaultAuthorId ?? apiUserId ?? 0}
          onChange={(e) => {
            const id = Number(e.target.value);
            setDefaultAuthorId(
              !id || (apiUserId != null && id === apiUserId) ? null : id
            );
          }}
        >
          <option value={apiUserId ?? 0}>Compte API (historique)</option>
          {canAssign
            ? authors
                .filter((a) => a.id !== apiUserId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))
            : null}
        </select>
      </div>

      {error ? (
        <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
      ) : null}
      {notice ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>
      ) : null}

      <Button type="button" disabled={saving} onClick={() => void saveDefaults()}>
        {saving ? "Enregistrement…" : "Enregistrer les défauts"}
      </Button>
    </div>
  );
}
