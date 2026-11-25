"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useWorkspaceOptional } from "@/components/workspace";

type Props = {
  generationId: string;
};

type CategoryOption = { id: number; name: string; label?: string };
type AuthorOption = { id: number; name: string };

export function WordPressDraftRefsPanel({ generationId }: Props) {
  const workspaceCtx = useWorkspaceOptional();
  const workspaceFetch = workspaceCtx?.workspaceFetch ?? fetch;
  const [editable, setEditable] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [authorId, setAuthorId] = useState<number | null>(null);
  const [remoteCategories, setRemoteCategories] = useState<
    Array<{ id: number; name: string }>
  >([]);
  const [remoteAuthor, setRemoteAuthor] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [catalogCategories, setCatalogCategories] = useState<CategoryOption[]>(
    []
  );
  const [catalogAuthors, setCatalogAuthors] = useState<AuthorOption[]>([]);
  const [apiUserId, setApiUserId] = useState<number | null>(null);
  const [canAssign, setCanAssign] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [refsRes, catalogRes] = await Promise.all([
        workspaceFetch(`/api/articles/${generationId}/wordpress-references`),
        workspaceFetch("/api/wordpress-references"),
      ]);
      const refs = (await refsRes.json()) as {
        editable?: boolean;
        status?: string;
        categoryIds?: number[];
        authorId?: number | null;
        categories?: Array<{ id: number; name: string }>;
        author?: { id: number; name: string } | null;
        error?: string;
      };
      const catalog = (await catalogRes.json()) as {
        categories?: CategoryOption[];
        authors?: AuthorOption[];
        defaults?: { apiUserId?: number | null };
        authorCapability?: string | null;
        error?: string;
      };
      if (!refsRes.ok) {
        throw new Error(refs.error ?? "Lecture impossible.");
      }
      if (!catalogRes.ok) {
        throw new Error(catalog.error ?? "Catalogue indisponible.");
      }
      setEditable(Boolean(refs.editable));
      setStatus(refs.status ?? "");
      setCategoryIds(refs.categoryIds ?? []);
      setAuthorId(refs.authorId ?? null);
      setRemoteCategories(refs.categories ?? []);
      setRemoteAuthor(refs.author ?? null);
      setCatalogCategories(catalog.categories ?? []);
      setCatalogAuthors(catalog.authors ?? []);
      setApiUserId(catalog.defaults?.apiUserId ?? null);
      setCanAssign(catalog.authorCapability === "can_assign");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, [generationId, workspaceFetch]);

  useEffect(() => {
    void load();
  }, [load, workspaceCtx?.epoch]);

  function toggleCategory(id: number) {
    setCategoryIds((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id]
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await workspaceFetch(
        `/api/articles/${generationId}/wordpress-references`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryIds,
            authorId,
          }),
        }
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Modification refusée.");
      }
      setNotice("Références WordPress mises à jour.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Modification impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-[#E2E8F0] p-4 dark:border-slate-700">
      <div>
        <h3 className="text-sm font-semibold text-[#0F172A] dark:text-slate-100">
          Catégories et auteur WordPress
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Modification ciblée du brouillon distant — jamais de publication.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Statut distant : <strong>{status || "inconnu"}</strong>
            {remoteCategories.length > 0
              ? ` — ${remoteCategories.map((c) => c.name).join(", ")}`
              : ""}
            {remoteAuthor ? ` — ${remoteAuthor.name}` : ""}
          </p>

          {!editable ? (
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Modification refusée : seuls les brouillons autorisés peuvent être
              mis à jour.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Catégories</Label>
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-[#E2E8F0] p-2 text-sm dark:border-slate-600">
                  {catalogCategories.map((cat) => (
                    <li key={cat.id}>
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={categoryIds.includes(cat.id)}
                          onChange={() => toggleCategory(cat.id)}
                        />
                        <span>{cat.label || cat.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <Label>Auteur</Label>
                <select
                  className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                  disabled={!canAssign}
                  value={authorId ?? apiUserId ?? 0}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setAuthorId(id || null);
                  }}
                >
                  <option value={apiUserId ?? 0}>Compte API</option>
                  {canAssign
                    ? catalogAuthors
                        .filter((a) => a.id !== apiUserId)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))
                    : null}
                </select>
              </div>

              <Button
                type="button"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "Enregistrement…" : "Mettre à jour le brouillon"}
              </Button>
            </>
          )}
        </>
      )}

      {error ? (
        <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
      ) : null}
      {notice ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>
      ) : null}
    </div>
  );
}
