"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { useWorkspaceOptional } from "@/components/workspace";
import Link from "next/link";

export type WebflowRefsSelection = {
  categoryItemId: string;
  authorItemId: string;
};

type RefOption = {
  webflowItemId: string;
  name: string;
  isDraft: boolean;
};

type Props = {
  value: WebflowRefsSelection;
  onChange: (next: WebflowRefsSelection) => void;
  /** Préremplir depuis initial une seule fois après chargement. */
  initialCategoryItemId?: string | null;
  initialAuthorItemId?: string | null;
  disabled?: boolean;
};

const NONE = "__none__";

export function WebflowRefsFields({
  value,
  onChange,
  initialCategoryItemId,
  initialAuthorItemId,
  disabled,
}: Props) {
  const workspaceCtx = useWorkspaceOptional();
  const workspaceFetch = workspaceCtx?.workspaceFetch ?? fetch;
  const [categories, setCategories] = useState<RefOption[]>([]);
  const [authors, setAuthors] = useState<RefOption[]>([]);
  const [categoryRequired, setCategoryRequired] = useState(false);
  const [authorRequired, setAuthorRequired] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterAuthor, setFilterAuthor] = useState("");
  const [appliedInitial, setAppliedInitial] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await workspaceFetch("/api/webflow-references");
      const payload = (await response.json()) as {
        categories?: RefOption[];
        authors?: RefOption[];
        targets?: Array<{ kind: string; isRequired: boolean }>;
        syncedAt?: string | null;
        issues?: string[];
        defaults?: {
          categoryItemId: string | null;
          authorItemId: string | null;
        };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Impossible de charger les références.");
      }
      setCategories(payload.categories ?? []);
      setAuthors(payload.authors ?? []);
      setSyncedAt(payload.syncedAt ?? null);
      setIssues(payload.issues ?? []);
      setCategoryRequired(
        Boolean(payload.targets?.find((t) => t.kind === "category")?.isRequired)
      );
      setAuthorRequired(
        Boolean(payload.targets?.find((t) => t.kind === "author")?.isRequired)
      );
      setReady(true);
      return payload;
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Chargement des références impossible."
      );
      setReady(true);
      return null;
    }
  }, [workspaceFetch]);

  useEffect(() => {
    void load().then((payload) => {
      if (!payload || appliedInitial) {
        return;
      }
      const nextCategory =
        initialCategoryItemId?.trim() ||
        payload.defaults?.categoryItemId ||
        "";
      const nextAuthor =
        initialAuthorItemId?.trim() || payload.defaults?.authorItemId || "";
      onChange({
        categoryItemId: nextCategory,
        authorItemId: nextAuthor,
      });
      setAppliedInitial(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply defaults once
  }, [load, workspaceCtx?.epoch]);

  const filteredCategories = useMemo(() => {
    const q = filterCategory.trim().toLowerCase();
    if (!q) {
      return categories;
    }
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, filterCategory]);

  const filteredAuthors = useMemo(() => {
    const q = filterAuthor.trim().toLowerCase();
    if (!q) {
      return authors;
    }
    return authors.filter((a) => a.name.toLowerCase().includes(q));
  }, [authors, filterAuthor]);

  if (!ready) {
    return (
      <p className="text-sm text-slate-500">Chargement des métadonnées Webflow…</p>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        <p>{loadError}</p>
        <Link href="/settings" className="underline">
          Ouvrir la configuration Webflow
        </Link>
      </div>
    );
  }

  const empty =
    categories.length === 0 && authors.length === 0 && issues.length === 0;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          Métadonnées éditoriales
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Catégorie et auteur Webflow associés au brouillon (injection serveur).
          {syncedAt
            ? ` Dernière sync : ${new Date(syncedAt).toLocaleString("fr-FR")}.`
            : " Catalogue non synchronisé."}
        </p>
      </div>

      {issues.length > 0 ? (
        <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}

      {empty ? (
        <p className="text-sm text-slate-600">
          Aucune référence disponible.{" "}
          <Link href="/settings" className="underline">
            Synchroniser dans Paramètres → Webflow
          </Link>
          .
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wf-ref-category">
            Catégorie{categoryRequired ? " *" : ""}
          </Label>
          {categories.length > 8 ? (
            <input
              type="search"
              className="mb-1 flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"
              placeholder="Rechercher…"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              disabled={disabled}
            />
          ) : null}
          <select
            id="wf-ref-category"
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={value.categoryItemId || NONE}
            disabled={disabled || categories.length === 0}
            onChange={(e) =>
              onChange({
                ...value,
                categoryItemId:
                  e.target.value === NONE ? "" : e.target.value,
              })
            }
            required={categoryRequired}
          >
            {!categoryRequired ? (
              <option value={NONE}>Sans catégorie</option>
            ) : (
              <option value={NONE}>— Choisir —</option>
            )}
            {filteredCategories.map((c) => (
              <option key={c.webflowItemId} value={c.webflowItemId}>
                {c.name}
                {c.isDraft ? " (brouillon)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wf-ref-author">
            Auteur{authorRequired ? " *" : ""}
          </Label>
          {authors.length > 8 ? (
            <input
              type="search"
              className="mb-1 flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"
              placeholder="Rechercher…"
              value={filterAuthor}
              onChange={(e) => setFilterAuthor(e.target.value)}
              disabled={disabled}
            />
          ) : null}
          <select
            id="wf-ref-author"
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={value.authorItemId || NONE}
            disabled={disabled || authors.length === 0}
            onChange={(e) =>
              onChange({
                ...value,
                authorItemId: e.target.value === NONE ? "" : e.target.value,
              })
            }
            required={authorRequired}
          >
            {!authorRequired ? (
              <option value={NONE}>Sans auteur</option>
            ) : (
              <option value={NONE}>— Choisir —</option>
            )}
            {filteredAuthors.map((a) => (
              <option key={a.webflowItemId} value={a.webflowItemId}>
                {a.name}
                {a.isDraft ? " (brouillon)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
