"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { useWorkspaceOptional } from "@/components/workspace";
import Link from "next/link";

export type WordPressRefsSelection = {
  mode: "automatic" | "manual";
  categoryIds: number[];
  authorId: number | null;
};

type CategoryOption = {
  id: number;
  name: string;
  label?: string;
  parent?: number | null;
};

type AuthorOption = {
  id: number;
  name: string;
};

type Props = {
  value: WordPressRefsSelection;
  onChange: (next: WordPressRefsSelection) => void;
  initialMode?: "automatic" | "manual" | null;
  initialCategoryIds?: number[] | null;
  initialAuthorId?: number | null;
  disabled?: boolean;
};

const NONE_AUTHOR = 0;

export function WordPressRefsFields({
  value,
  onChange,
  initialMode,
  initialCategoryIds,
  initialAuthorId,
  disabled,
}: Props) {
  const workspaceCtx = useWorkspaceOptional();
  const workspaceFetch = workspaceCtx?.workspaceFetch ?? fetch;
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [authors, setAuthors] = useState<AuthorOption[]>([]);
  const [apiUserId, setApiUserId] = useState<number | null>(null);
  const [apiUserName, setApiUserName] = useState<string | null>(null);
  const [authorCapability, setAuthorCapability] = useState<string | null>(null);
  const [authorMessage, setAuthorMessage] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [filterCategory, setFilterCategory] = useState("");
  const [appliedInitial, setAppliedInitial] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
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
          apiUserName?: string | null;
        };
        authorCapability?: string | null;
        authorMessage?: string | null;
        syncedAt?: string | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Impossible de charger les références.");
      }
      setCategories(payload.categories ?? []);
      setAuthors(payload.authors ?? []);
      setApiUserId(payload.defaults?.apiUserId ?? null);
      setApiUserName(payload.defaults?.apiUserName ?? null);
      setAuthorCapability(payload.authorCapability ?? null);
      setAuthorMessage(payload.authorMessage ?? null);
      setSyncedAt(payload.syncedAt ?? null);
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
      const mode =
        initialMode === "manual" || initialMode === "automatic"
          ? initialMode
          : payload.defaults?.mode === "manual"
            ? "manual"
            : "automatic";
      const categoryIds =
        initialCategoryIds && initialCategoryIds.length > 0
          ? initialCategoryIds
          : mode === "manual"
            ? payload.defaults?.categoryIds ?? []
            : [];
      const authorId =
        initialAuthorId != null
          ? initialAuthorId
          : payload.defaults?.authorId ?? null;
      onChange({ mode, categoryIds, authorId });
      setAppliedInitial(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply defaults once
  }, [load]);

  const filteredCategories = useMemo(() => {
    const q = filterCategory.trim().toLowerCase();
    if (!q) {
      return categories;
    }
    return categories.filter((c) =>
      (c.label || c.name).toLowerCase().includes(q)
    );
  }, [categories, filterCategory]);

  const canAssign = authorCapability === "can_assign";

  function toggleCategory(id: number) {
    const next = value.categoryIds.includes(id)
      ? value.categoryIds.filter((x) => x !== id)
      : [...value.categoryIds, id];
    onChange({ ...value, categoryIds: next });
  }

  return (
    <div className="space-y-4 rounded-lg border border-[#E2E8F0] bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <div>
        <h3 className="text-sm font-semibold text-[#0F172A] dark:text-slate-100">
          Métadonnées éditoriales WordPress
        </h3>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Mode automatique : détection historique inchangée. Mode manuel : vos
          catégories remplacent entièrement la détection automatique.
        </p>
      </div>

      {loadError ? (
        <p className="text-sm text-red-700 dark:text-red-400">{loadError}</p>
      ) : null}

      {!ready ? (
        <p className="text-sm text-slate-500">Chargement des références…</p>
      ) : (
        <>
          <div className="space-y-2">
            <Label className="text-[#0F172A] dark:text-slate-100">
              Mode de catégorisation
            </Label>
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="wp-cat-mode"
                  checked={value.mode === "automatic"}
                  disabled={disabled}
                  onChange={() =>
                    onChange({ ...value, mode: "automatic", categoryIds: [] })
                  }
                />
                Automatique
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="wp-cat-mode"
                  checked={value.mode === "manual"}
                  disabled={disabled}
                  onChange={() => onChange({ ...value, mode: "manual" })}
                />
                Manuel
              </label>
            </div>
          </div>

          {value.mode === "manual" ? (
            <div className="space-y-2">
              <Label className="text-[#0F172A] dark:text-slate-100">
                Catégories WordPress
              </Label>
              {categories.length > 8 ? (
                <input
                  type="search"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  placeholder="Rechercher une catégorie…"
                  className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                  disabled={disabled}
                />
              ) : null}
              {categories.length === 0 ? (
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Aucune catégorie synchronisée.{" "}
                  <Link
                    href="/settings"
                    className="underline underline-offset-2"
                  >
                    Synchroniser dans les paramètres
                  </Link>
                  .
                </p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-[#E2E8F0] bg-white p-2 dark:border-slate-600 dark:bg-slate-950">
                  {filteredCategories.map((cat) => (
                    <li key={cat.id}>
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={value.categoryIds.includes(cat.id)}
                          disabled={disabled}
                          onChange={() => toggleCategory(cat.id)}
                        />
                        <span>{cat.label || cat.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {value.categoryIds.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Aucune catégorie sélectionnée : WordPress appliquera sa
                  catégorie par défaut (souvent Uncategorized).
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  {value.categoryIds.length} catégorie(s) sélectionnée(s).
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Les catégories seront calculées automatiquement à la génération
              (comportement historique).
            </p>
          )}

          <div className="space-y-2">
            <Label className="text-[#0F172A] dark:text-slate-100">
              Auteur WordPress
            </Label>
            <select
              className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
              disabled={disabled || !canAssign}
              value={value.authorId ?? apiUserId ?? NONE_AUTHOR}
              onChange={(e) => {
                const id = Number(e.target.value);
                onChange({
                  ...value,
                  authorId:
                    !id || (apiUserId != null && id === apiUserId) ? null : id,
                });
              }}
            >
              <option value={apiUserId ?? NONE_AUTHOR}>
                Compte API
                {apiUserName ? ` (${apiUserName})` : ""} — comportement historique
              </option>
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
            {authorMessage ? (
              <p className="text-xs text-slate-500">{authorMessage}</p>
            ) : null}
          </div>

          {syncedAt ? (
            <p className="text-[11px] text-slate-400">
              Dernière sync :{" "}
              {new Intl.DateTimeFormat("fr-FR", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(syncedAt))}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
