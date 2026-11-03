"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ALLOWED_QUESTION_COUNTS,
  ALLOWED_REPETITIONS,
  DEFAULT_MODEL,
  estimateCampaignCalls,
} from "@/lib/ai-visibility/constants";
import { readApiJson } from "@/lib/ai-visibility/http";
import { areCampaignsComparable } from "@/lib/ai-visibility/metrics";

type Campaign = {
  id: string;
  subject: string;
  status: string;
  country: string;
  language: string;
  questionCount: number;
  repetitions: number;
  model: string;
  analysisVersion: string;
  mentionRate: number | null;
  recommendationRate: number | null;
  domainCitationRate: number | null;
  validResponses: number;
  failedResponses: number;
  estimatedCostUsd: number | null;
  createdAt: string;
  finishedAt: string | null;
  editorialHints: unknown;
};

type Brand = {
  id: string;
  name: string;
  primaryDomain: string;
  description: string | null;
  sector: string | null;
  products: string | null;
  country: string;
  language: string;
  aliases: unknown;
  domainAliases: unknown;
  knownCompetitors: unknown;
  campaigns: Campaign[];
  entities: Array<{ id: string; name: string; domain: string | null }>;
};

function formatRate(value: number | null | undefined): string {
  if (value == null) {
    return "—";
  }
  return `${Math.round(value * 100)} %`;
}

function asStringList(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string").join(", ");
  }
  return "";
}

export function AiVisibilityBrandDetail({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    country: "FR",
    language: "fr",
    questionCount: 10,
    repetitions: 1,
    model: DEFAULT_MODEL,
    instructions: "",
  });
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai-visibility/brands/${brandId}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const parsed = await readApiJson<{ brand?: Brand }>(res);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      if (!parsed.data.brand) {
        throw new Error("Marque introuvable.");
      }
      setBrand(parsed.data.brand);
      setForm((prev) => ({
        ...prev,
        country: parsed.data.brand!.country,
        language: parsed.data.brand!.language,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    void load();
  }, [load]);

  const estimatedCalls = estimateCampaignCalls(
    form.questionCount,
    form.repetitions
  );

  const comparison = useMemo(() => {
    if (!brand || !compareA || !compareB || compareA === compareB) {
      return null;
    }
    const left = brand.campaigns.find((item) => item.id === compareA);
    const right = brand.campaigns.find((item) => item.id === compareB);
    if (!left || !right) {
      return null;
    }
    const compat = areCampaignsComparable(left, right);
    return { left, right, compat };
  }, [brand, compareA, compareB]);

  async function createCampaign(event: React.FormEvent) {
    event.preventDefault();
    if (!brand) {
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai-visibility/brands/${brand.id}/campaigns`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(form),
      });
      const parsed = await readApiJson<{ campaign?: { id: string } }>(res);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      if (!parsed.data.campaign?.id) {
        throw new Error("Création impossible.");
      }
      window.location.href = `/ai-visibility/${brand.id}/campaigns/${parsed.data.campaign.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
      setCreating(false);
    }
  }

  async function deleteBrand() {
    if (!brand) {
      return;
    }
    const campaignCount = brand.campaigns.length;
    const hasRunning = brand.campaigns.some((item) => item.status === "running");
    if (hasRunning) {
      setError(
        "Impossible de supprimer une marque dont une campagne est encore en cours d’analyse."
      );
      return;
    }

    const confirmed = window.confirm(
      `Supprimer définitivement la marque « ${brand.name} » (${brand.primaryDomain}) ?\n\n` +
        `${campaignCount} campagne(s) associée(s) seront également effacées.\n` +
        `Cette action est irréversible.`
    );
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError(null);
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
      router.push("/ai-visibility");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Chargement…</p>;
  }
  if (!brand) {
    return (
      <p className="text-sm text-red-600">{error ?? "Marque introuvable."}</p>
    );
  }

  const completed = brand.campaigns.filter(
    (item) =>
      item.status === "completed" ||
      item.status === "partial" ||
      item.mentionRate != null
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/ai-visibility"
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            ← Marques
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">
            {brand.name}
          </h1>
          <p className="text-sm text-slate-600">
            {brand.primaryDomain}
            {brand.sector ? ` · ${brand.sector}` : ""} · {brand.country}/
            {brand.language}
          </p>
        </div>
        <button
          type="button"
          disabled={deleting || creating}
          onClick={() => void deleteBrand()}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          {deleting ? "Suppression…" : "Supprimer la marque"}
        </button>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Informations</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
            {brand.description || "Aucune description."}
          </p>
          {brand.products ? (
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium">Produits :</span> {brand.products}
            </p>
          ) : null}
        </div>
        <div className="text-sm text-slate-600">
          <p>
            <span className="font-medium text-slate-800">Alias :</span>{" "}
            {asStringList(brand.aliases) || "—"}
          </p>
          <p className="mt-1">
            <span className="font-medium text-slate-800">Domaines :</span>{" "}
            {asStringList(brand.domainAliases) || "—"}
          </p>
          <p className="mt-1">
            <span className="font-medium text-slate-800">Concurrents connus :</span>{" "}
            {asStringList(brand.knownCompetitors) ||
              (Array.isArray(brand.knownCompetitors)
                ? brand.knownCompetitors
                    .map((item) =>
                      typeof item === "object" && item && "name" in item
                        ? String((item as { name: string }).name)
                        : ""
                    )
                    .filter(Boolean)
                    .join(", ")
                : "—")}
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Les données de cette marque sont isolées des autres marques.
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Nouvelle analyse GEO
        </h2>
        <form onSubmit={createCampaign} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">Sujet principal</span>
            <input
              required
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              placeholder="Développement d'agents IA pour les PME"
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
            <span className="font-medium text-slate-700">Questions</span>
            <select
              value={form.questionCount}
              onChange={(e) =>
                setForm({ ...form, questionCount: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            >
              {ALLOWED_QUESTION_COUNTS.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Répétitions</span>
            <select
              value={form.repetitions}
              onChange={(e) =>
                setForm({ ...form, repetitions: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            >
              {ALLOWED_REPETITIONS.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">Modèle OpenAI</span>
            <input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">
              Consignes facultatives
            </span>
            <textarea
              value={form.instructions}
              onChange={(e) =>
                setForm({ ...form, instructions: e.target.value })
              }
              rows={2}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <p className="sm:col-span-2 text-sm text-slate-600">
            Estimation : <strong>{estimatedCalls}</strong> appel(s) IA (plafond
            serveur actif). Le pays est un paramètre de prompt, pas une
            géolocalisation garantie.
          </p>
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-naxialis-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-60 sm:col-span-2 sm:w-fit"
          >
            {creating ? "Création…" : "Créer la campagne"}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Campagnes ({brand.campaigns.length})
        </h2>
        {brand.campaigns.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Aucune campagne.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Sujet</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Mention</th>
                  <th className="px-3 py-2">Reco</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {brand.campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td className="px-3 py-2">{campaign.subject}</td>
                    <td className="px-3 py-2">{campaign.status}</td>
                    <td className="px-3 py-2">
                      {formatRate(campaign.mentionRate)}
                    </td>
                    <td className="px-3 py-2">
                      {formatRate(campaign.recommendationRate)}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {new Date(
                        campaign.finishedAt ?? campaign.createdAt
                      ).toLocaleString("fr-FR")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/ai-visibility/${brand.id}/campaigns/${campaign.id}`}
                        className="font-medium text-naxialis-dark hover:underline"
                      >
                        Détail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {completed.length >= 2 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Comparaison de campagnes
          </h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <select
              value={compareA}
              onChange={(e) => setCompareA(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Campagne A</option>
              {completed.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.subject} ({item.status})
                </option>
              ))}
            </select>
            <select
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Campagne B</option>
              {completed.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.subject} ({item.status})
                </option>
              ))}
            </select>
          </div>
          {comparison ? (
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              {!comparison.compat.comparable ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                  Attention : {comparison.compat.warnings.join(" ")} La
                  comparaison reste indicative.
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  Paramètres compatibles (même méthode / modèle / volume).
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {[comparison.left, comparison.right].map((item) => (
                  <div
                    key={item.id}
                    className="rounded-md border border-slate-100 bg-slate-50 p-3"
                  >
                    <p className="font-medium">{item.subject}</p>
                    <p>Mention : {formatRate(item.mentionRate)}</p>
                    <p>Recommandation : {formatRate(item.recommendationRate)}</p>
                    <p>Citation domaine : {formatRate(item.domainCitationRate)}</p>
                    <p className="text-xs text-slate-500">
                      n={item.validResponses} valides / {item.failedResponses}{" "}
                      échecs
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {brand.entities.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Concurrents détectés (agrégat)
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {brand.entities.slice(0, 20).map((entity) => (
              <li key={entity.id}>
                {entity.name}
                {entity.domain ? ` (${entity.domain})` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
