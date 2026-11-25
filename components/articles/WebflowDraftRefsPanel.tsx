"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useWorkspaceOptional } from "@/components/workspace";

type Props = {
  generationId: string;
};

type RefOption = {
  webflowItemId: string;
  name: string;
  isDraft: boolean;
};

const NONE = "__none__";

export function WebflowDraftRefsPanel({ generationId }: Props) {
  const workspaceCtx = useWorkspaceOptional();
  const workspaceFetch = workspaceCtx?.workspaceFetch ?? fetch;
  const [categoryItemId, setCategoryItemId] = useState("");
  const [authorItemId, setAuthorItemId] = useState("");
  const [categories, setCategories] = useState<RefOption[]>([]);
  const [authors, setAuthors] = useState<RefOption[]>([]);
  const [remoteLabel, setRemoteLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editable, setEditable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [refsRes, catalogRes] = await Promise.all([
        workspaceFetch(`/api/articles/${generationId}/webflow-references`),
        workspaceFetch("/api/webflow-references"),
      ]);
      const refs = (await refsRes.json()) as {
        categoryItemId?: string | null;
        authorItemId?: string | null;
        isDraft?: boolean;
        isArchived?: boolean;
        category?: { name: string; unavailable: boolean } | null;
        author?: { name: string; unavailable: boolean } | null;
        error?: string;
      };
      const catalog = (await catalogRes.json()) as {
        categories?: RefOption[];
        authors?: RefOption[];
        error?: string;
      };
      if (!refsRes.ok) {
        throw new Error(refs.error ?? "Lecture distante impossible.");
      }
      if (!catalogRes.ok) {
        throw new Error(catalog.error ?? "Catalogue indisponible.");
      }
      setCategoryItemId(refs.categoryItemId ?? "");
      setAuthorItemId(refs.authorItemId ?? "");
      setCategories(catalog.categories ?? []);
      setAuthors(catalog.authors ?? []);
      setEditable(refs.isDraft === true && refs.isArchived !== true);
      const parts = [
        refs.category
          ? `Catégorie : ${refs.category.name}${refs.category.unavailable ? " (indisponible)" : ""}`
          : null,
        refs.author
          ? `Auteur : ${refs.author.name}${refs.author.unavailable ? " (indisponible)" : ""}`
          : null,
      ].filter(Boolean);
      setRemoteLabel(parts.join(" · ") || "Aucune référence distante.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
      setEditable(false);
    } finally {
      setLoading(false);
    }
  }, [generationId, workspaceFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await workspaceFetch(
        `/api/articles/${generationId}/webflow-references`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryItemId: categoryItemId || null,
            authorItemId: authorItemId || null,
          }),
        }
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Enregistrement distant refusé.");
      }
      setSuccess("Références mises à jour sur le brouillon Webflow (staged).");
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Enregistrement impossible."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-[#E2E8F0] bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-[#0F172A]">
          Catégorie et auteur Webflow
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Mise à jour ciblée du brouillon staged — sans republier ni toucher au
          contenu, SEO ou image à la une.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : null}
      {success ? (
        <p className="text-sm text-emerald-800">{success}</p>
      ) : null}
      {remoteLabel && !loading ? (
        <p className="text-xs text-slate-600">{remoteLabel}</p>
      ) : null}

      {!loading && editable ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="draft-wf-category">Catégorie</Label>
              <select
                id="draft-wf-category"
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={categoryItemId || NONE}
                onChange={(e) =>
                  setCategoryItemId(
                    e.target.value === NONE ? "" : e.target.value
                  )
                }
              >
                <option value={NONE}>Sans catégorie</option>
                {categories.map((c) => (
                  <option key={c.webflowItemId} value={c.webflowItemId}>
                    {c.name}
                    {c.isDraft ? " (brouillon)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-wf-author">Auteur</Label>
              <select
                id="draft-wf-author"
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={authorItemId || NONE}
                onChange={(e) =>
                  setAuthorItemId(e.target.value === NONE ? "" : e.target.value)
                }
              >
                <option value={NONE}>Sans auteur</option>
                {authors.map((a) => (
                  <option key={a.webflowItemId} value={a.webflowItemId}>
                    {a.name}
                    {a.isDraft ? " (brouillon)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </>
      ) : null}

      {!loading && !editable && !error ? (
        <p className="text-sm text-amber-800">
          Modification refusée : l’item n’est plus un brouillon staged modifiable
          (publié, archivé ou statut incertain).
        </p>
      ) : null}
    </div>
  );
}
