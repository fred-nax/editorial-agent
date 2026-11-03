"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readApiJson } from "@/lib/ai-visibility/http";

type BrandRow = {
  id: string;
  name: string;
  primaryDomain: string;
  sector: string | null;
  country: string;
  language: string;
  campaignCount: number;
  lastCampaign: {
    id: string;
    subject: string;
    status: string;
    mentionRate: number | null;
    createdAt: string;
    finishedAt: string | null;
  } | null;
  updatedAt: string;
};

function formatRate(value: number | null | undefined): string {
  if (value == null) {
    return "—";
  }
  return `${Math.round(value * 100)} %`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString("fr-FR");
}

export function AiVisibilityBoard() {
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: "",
    primaryDomain: "",
    description: "",
    sector: "",
    products: "",
    country: "FR",
    language: "fr",
    aliases: "",
    domainAliases: "",
    knownCompetitors: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-visibility/brands", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const parsed = await readApiJson<{ brands?: BrandRow[] }>(res);
      if (!parsed.ok) {
        setBrands([]);
        throw new Error(parsed.error);
      }
      if (!Array.isArray(parsed.data.brands)) {
        setBrands([]);
        throw new Error("Réponse API invalide : liste de marques absente.");
      }
      setBrands(parsed.data.brands);
      setSelectedIds((prev) =>
        prev.filter((id) => parsed.data.brands!.some((brand) => brand.id === id))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedBrands = useMemo(
    () => brands.filter((brand) => selectedIds.includes(brand.id)),
    [brands, selectedIds]
  );
  const selectedCampaignCount = useMemo(
    () => selectedBrands.reduce((sum, brand) => sum + brand.campaignCount, 0),
    [selectedBrands]
  );
  const allVisibleSelected =
    brands.length > 0 && selectedIds.length === brands.length;

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(brands.map((brand) => brand.id));
  }

  async function createBrand(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/ai-visibility/brands", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          ...form,
          aliases: form.aliases,
          domainAliases: form.domainAliases,
          knownCompetitors: form.knownCompetitors,
        }),
      });
      const parsed = await readApiJson<{ brand?: { id: string } }>(res);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      if (!parsed.data.brand?.id) {
        throw new Error("Création refusée : marque absente de la réponse.");
      }
      const brandId = parsed.data.brand.id;
      setShowForm(false);
      setForm({
        name: "",
        primaryDomain: "",
        description: "",
        sector: "",
        products: "",
        country: "FR",
        language: "fr",
        aliases: "",
        domainAliases: "",
        knownCompetitors: "",
      });
      await load();
      window.location.href = `/ai-visibility/${brandId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOneBrand(brand: BrandRow) {
    const confirmed = window.confirm(
      `Supprimer définitivement la marque « ${brand.name} » (${brand.primaryDomain}) ?\n\n` +
        `${brand.campaignCount} campagne(s) associée(s) seront également effacées.\n` +
        `Cette action est irréversible.`
    );
    if (!confirmed) {
      return;
    }

    setBusy(`delete:${brand.id}`);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/ai-visibility/brands/${brand.id}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const parsed = await readApiJson<{ success?: boolean }>(res);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      setSuccess(`Marque « ${brand.name} » supprimée.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSelectedBrands() {
    if (selectedBrands.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Supprimer définitivement ${selectedBrands.length} marque(s) sélectionnée(s) ?\n\n` +
        `${selectedCampaignCount} campagne(s) associée(s) seront également effacées.\n` +
        `Seules les marques cochées sur cet écran seront concernées.\n` +
        `Cette action est irréversible.`
    );
    if (!confirmed) {
      return;
    }

    const ids = selectedBrands.map((brand) => brand.id);
    setBusy("delete-bulk");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/ai-visibility/brands/delete", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ ids }),
      });
      const parsed = await readApiJson<{
        success?: boolean;
        partial?: boolean;
        deleted?: Array<{ name: string }>;
        failed?: Array<{ id: string; error: string }>;
        error?: string;
      }>(res);

      if (!parsed.ok) {
        throw new Error(parsed.error);
      }

      const deletedCount = parsed.data.deleted?.length ?? 0;
      const failed = parsed.data.failed ?? [];

      if (failed.length > 0) {
        const details = failed
          .map((item) => item.error)
          .filter(Boolean)
          .slice(0, 3)
          .join(" · ");
        setError(
          parsed.data.error ||
            `${failed.length} échec(s)${details ? ` : ${details}` : ""}.`
        );
        if (deletedCount > 0) {
          setSuccess(
            `${deletedCount} marque(s) supprimée(s) ; ${failed.length} non supprimée(s).`
          );
        }
      } else if (deletedCount > 0) {
        setSuccess(
          deletedCount === 1
            ? "Marque supprimée."
            : `${deletedCount} marques supprimées.`
        );
      } else {
        setError("Aucune marque n’a été supprimée.");
      }

      setSelectedIds([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            AI Visibility Monitor
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Mesurez la présence d’une marque dans les réponses IA (échantillon
            limité, méthode geo-1.0 — pas une mesure exhaustive ChatGPT).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((value) => !value)}
          className="rounded-md bg-naxialis-dark px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Nouvelle marque
        </button>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}

      {showForm ? (
        <form
          onSubmit={createBrand}
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Nom</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Domaine principal</span>
              <input
                required
                placeholder="exemple.com"
                value={form.primaryDomain}
                onChange={(e) =>
                  setForm({ ...form, primaryDomain: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-slate-700">Description</span>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={2}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Secteur</span>
              <input
                value={form.sector}
                onChange={(e) => setForm({ ...form, sector: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Produits</span>
              <input
                value={form.products}
                onChange={(e) => setForm({ ...form, products: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Pays</span>
              <input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Langue</span>
              <input
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Alias (virgules)</span>
              <input
                value={form.aliases}
                onChange={(e) => setForm({ ...form, aliases: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">
                Alias de domaines (virgules)
              </span>
              <input
                value={form.domainAliases}
                onChange={(e) =>
                  setForm({ ...form, domainAliases: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-slate-700">
                Concurrents connus (virgules)
              </span>
              <input
                value={form.knownCompetitors}
                onChange={(e) =>
                  setForm({ ...form, knownCompetitors: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-naxialis-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : "Créer la marque"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700"
            >
              Annuler
            </button>
          </div>
        </form>
      ) : null}

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <p className="text-slate-700">
            {selectedIds.length} marque
            {selectedIds.length > 1 ? "s" : ""} sélectionnée
            {selectedIds.length > 1 ? "s" : ""}
            {selectedCampaignCount > 0
              ? ` · ${selectedCampaignCount} campagne${selectedCampaignCount > 1 ? "s" : ""}`
              : ""}
          </p>
          <button
            type="button"
            disabled={busy != null}
            onClick={() => void deleteSelectedBrands()}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {busy === "delete-bulk"
              ? "Suppression…"
              : "Supprimer la sélection"}
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Chargement…</p>
        ) : brands.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">
            Aucune marque. Ajoutez Naxialis ou une marque cliente pour commencer.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3 sm:px-4">
                    <label className="inline-flex items-center gap-2 font-normal normal-case tracking-normal text-slate-600">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        aria-label="Tout sélectionner (marques visibles)"
                      />
                      <span className="hidden sm:inline">Tout</span>
                    </label>
                  </th>
                  <th className="px-3 py-3 sm:px-4">Marque</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Campagnes</th>
                  <th className="hidden px-4 py-3 md:table-cell">
                    Dernière analyse
                  </th>
                  <th className="hidden px-4 py-3 lg:table-cell">Mention</th>
                  <th className="px-3 py-3 text-right sm:px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {brands.map((brand) => {
                  const deleting = busy === `delete:${brand.id}`;
                  return (
                    <tr key={brand.id}>
                      <td className="px-3 py-3 sm:px-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(brand.id)}
                          onChange={() => toggleSelect(brand.id)}
                          aria-label={`Sélectionner ${brand.name}`}
                        />
                      </td>
                      <td className="px-3 py-3 sm:px-4">
                        <p className="font-medium text-slate-900">{brand.name}</p>
                        <p className="text-xs text-slate-500">
                          {brand.primaryDomain}
                          {brand.sector ? ` · ${brand.sector}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 sm:hidden">
                          {brand.campaignCount} campagne
                          {brand.campaignCount === 1 ? "" : "s"}
                        </p>
                      </td>
                      <td className="hidden px-4 py-3 text-slate-700 sm:table-cell">
                        {brand.campaignCount}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                        {brand.lastCampaign ? (
                          <>
                            <p className="line-clamp-1">
                              {brand.lastCampaign.subject}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatDate(
                                brand.lastCampaign.finishedAt ??
                                  brand.lastCampaign.createdAt
                              )}{" "}
                              · {brand.lastCampaign.status}
                            </p>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        {formatRate(brand.lastCampaign?.mentionRate)}
                      </td>
                      <td className="px-3 py-3 text-right sm:px-4">
                        <div className="inline-flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
                          <Link
                            href={`/ai-visibility/${brand.id}`}
                            className="font-medium text-naxialis-dark hover:underline"
                          >
                            Ouvrir
                          </Link>
                          <button
                            type="button"
                            disabled={busy != null}
                            onClick={() => void deleteOneBrand(brand)}
                            className="text-sm text-red-700 hover:underline disabled:opacity-60"
                          >
                            {deleting ? "Suppression…" : "Supprimer"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
