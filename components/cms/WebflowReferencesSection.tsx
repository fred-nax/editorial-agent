"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useWorkspaceOptional } from "@/components/workspace";

type RefOption = {
  webflowItemId: string;
  name: string;
  slug: string | null;
  isDraft: boolean;
};

type RefsPayload = {
  syncedAt: string | null;
  categories: RefOption[];
  authors: RefOption[];
  targets: Array<{
    kind: string;
    collectionId: string;
    collectionName: string | null;
    isRequired: boolean;
  }>;
  issues: string[];
  defaults: {
    categoryItemId: string | null;
    authorItemId: string | null;
    categoryUnavailable: boolean;
    authorUnavailable: boolean;
    categoryName: string | null;
    authorName: string | null;
  };
  counts: { categories: number; authors: number };
  error?: string;
};

export function WebflowReferencesSection() {
  const workspaceCtx = useWorkspaceOptional();
  const workspaceFetch = workspaceCtx?.workspaceFetch ?? fetch;
  const [data, setData] = useState<RefsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [defaultCategory, setDefaultCategory] = useState("");
  const [defaultAuthor, setDefaultAuthor] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await workspaceFetch("/api/webflow-references");
      const payload = (await response.json()) as RefsPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "Chargement impossible.");
      }
      setData(payload);
      setDefaultCategory(payload.defaults.categoryItemId ?? "");
      setDefaultAuthor(payload.defaults.authorItemId ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceFetch]);

  useEffect(() => {
    void load();
  }, [load, workspaceCtx?.epoch]);

  async function sync() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await workspaceFetch("/api/webflow-references", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        issues?: string[];
        error?: string;
      };
      if (!response.ok && !payload.ok) {
        throw new Error(
          payload.error ??
            payload.issues?.join(" ") ??
            "Synchronisation échouée."
        );
      }
      setNotice("Catalogue catégories / auteurs synchronisé.");
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Synchronisation échouée."
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
      const response = await workspaceFetch("/api/webflow-references/defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryItemId: defaultCategory || null,
          authorItemId: defaultAuthor || null,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Enregistrement impossible.");
      }
      setNotice("Valeurs par défaut enregistrées.");
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Enregistrement impossible."
      );
    } finally {
      setSaving(false);
    }
  }

  const categoryTarget = data?.targets.find((t) => t.kind === "category");
  const authorTarget = data?.targets.find((t) => t.kind === "author");

  return (
    <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50/60 p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          Catégories et auteurs
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Synchronisez les collections Reference détectées depuis le mapping
          Blog, puis choisissez les valeurs par défaut de l’espace.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {notice}
        </p>
      ) : null}

      {data ? (
        <>
          <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Collection catégories</dt>
              <dd>
                {categoryTarget?.collectionName ??
                  categoryTarget?.collectionId ??
                  "— non détectée —"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Collection auteurs</dt>
              <dd>
                {authorTarget?.collectionName ??
                  authorTarget?.collectionId ??
                  "— non détectée —"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Catégories disponibles</dt>
              <dd>{data.counts.categories}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Auteurs disponibles</dt>
              <dd>{data.counts.authors}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Dernière synchronisation</dt>
              <dd>
                {data.syncedAt
                  ? new Date(data.syncedAt).toLocaleString("fr-FR")
                  : "Jamais"}
              </dd>
            </div>
          </dl>

          {data.issues.length > 0 ? (
            <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {data.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}

          {data.defaults.categoryUnavailable ? (
            <p className="text-sm text-amber-800">
              La catégorie par défaut n’est plus disponible. Choisissez-en une
              autre.
            </p>
          ) : null}
          {data.defaults.authorUnavailable ? (
            <p className="text-sm text-amber-800">
              L’auteur par défaut n’est plus disponible. Choisissez-en un autre.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wf-default-category">Catégorie par défaut</Label>
              <select
                id="wf-default-category"
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={defaultCategory}
                onChange={(e) => setDefaultCategory(e.target.value)}
              >
                <option value="">— Aucune —</option>
                {data.categories.map((c) => (
                  <option key={c.webflowItemId} value={c.webflowItemId}>
                    {c.name}
                    {c.isDraft ? " (brouillon)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wf-default-author">Auteur par défaut</Label>
              <select
                id="wf-default-author"
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={defaultAuthor}
                onChange={(e) => setDefaultAuthor(e.target.value)}
              >
                <option value="">— Aucun —</option>
                {data.authors.map((a) => (
                  <option key={a.webflowItemId} value={a.webflowItemId}>
                    {a.name}
                    {a.isDraft ? " (brouillon)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={syncing}
              onClick={() => void sync()}
            >
              {syncing ? "Synchronisation…" : "Synchroniser"}
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void saveDefaults()}
            >
              {saving ? "Enregistrement…" : "Enregistrer les défauts"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
