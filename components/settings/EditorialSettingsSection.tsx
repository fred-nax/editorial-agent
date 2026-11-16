"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { PublicSettingsView } from "@/components/settings/types";

type Props = {
  settings: PublicSettingsView;
  onUpdated: (next: PublicSettingsView) => void;
};

function formatSyncedAt(value: string | null): string {
  if (!value) {
    return "Jamais synchronisées";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function EditorialSettingsSection({ settings, onUpdated }: Props) {
  const [allowedIds, setAllowedIds] = useState<number[]>(
    settings.categories.allowedIds
  );
  const [defaultCategoryId, setDefaultCategoryId] = useState<number | null>(
    settings.categories.defaultCategoryId
  );
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setAllowedIds(settings.categories.allowedIds);
    setDefaultCategoryId(settings.categories.defaultCategoryId);
  }, [settings.categories.allowedIds, settings.categories.defaultCategoryId]);

  const brandLabel = useMemo(() => {
    return (
      settings.siteName?.trim() ||
      settings.clientName?.trim() ||
      settings.wordpress.url ||
      "Installation"
    );
  }, [settings.clientName, settings.siteName, settings.wordpress.url]);

  const items = settings.categories.items;

  function toggleAllowed(id: number) {
    setAllowedIds((current) => {
      if (current.includes(id)) {
        const next = current.filter((value) => value !== id);
        if (defaultCategoryId === id) {
          setDefaultCategoryId(null);
        }
        return next;
      }
      return [...current, id].sort((a, b) => a - b);
    });
  }

  async function syncCategories() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/settings/categories/sync", {
        method: "POST",
        credentials: "same-origin",
      });
      const payload = (await response.json()) as PublicSettingsView & {
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Synchronisation impossible.");
        return;
      }
      onUpdated(payload);
      setNotice(
        `${payload.categories.items.length} catégorie(s) synchronisée(s).`
      );
    } catch {
      setError("Synchronisation impossible.");
    } finally {
      setSyncing(false);
    }
  }

  async function saveSelection() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/settings/categories", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowedIds,
          defaultCategoryId,
        }),
      });
      const payload = (await response.json()) as PublicSettingsView & {
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Enregistrement impossible.");
        return;
      }
      onUpdated(payload);
      setNotice("Sélection des catégories enregistrée.");
    } catch {
      setError("Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Éditorial</h2>
        <p className="mt-1 text-sm text-slate-600">
          Identité de l’installation, catégories WordPress utilisables pour les
          générations, et accès aux instructions de l’agent OpenAI (section
          ci-dessus). Les thématiques SEO se gèrent depuis Opportunités SEO.
        </p>
      </div>

      <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3 text-sm text-slate-700">
        <p>
          <span className="font-medium text-slate-900">Identité affichée :</span>{" "}
          {brandLabel}
        </p>
        <p className="mt-1 text-slate-600">
          Le ton, le public et le style restent définis dans l’agent OpenAI
          sélectionné. Les prompts dynamiques utilisent le nom du site / client
          (sauf installation Naxialis historique).
        </p>
        {settings.wordpress.url ? (
          <p className="mt-1 text-xs text-slate-500">
            WordPress : {settings.wordpress.url}
          </p>
        ) : (
          <p className="mt-1 text-xs text-amber-700">
            Configurez WordPress avant de synchroniser les catégories.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Catégories WordPress
            </h3>
            <p className="text-xs text-slate-500">
              Dernière sync : {formatSyncedAt(settings.categories.syncedAt)}
              {settings.categories.origin
                ? ` · origin ${settings.categories.origin}`
                : ""}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void syncCategories()}
            disabled={syncing || !settings.wordpress.url}
          >
            {syncing ? "Synchronisation…" : "Synchroniser"}
          </Button>
        </div>

        {settings.categories.siteMismatch ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Les catégories synchronisées appartiennent à un autre WordPress.
            Relancez la synchronisation.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {notice}
          </p>
        ) : null}

        {items.length === 0 ? (
          <p className="text-sm text-slate-600">
            Aucune catégorie synchronisée. Synchronisez le site connecté pour
            sélectionner les catégories autorisées.
          </p>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
            {items.map((category) => {
              const checked = allowedIds.includes(category.id);
              return (
                <label
                  key={category.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={() => toggleAllowed(category.id)}
                    disabled={saving || syncing}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900">
                      {category.name}
                    </span>
                    <span className="block text-xs text-slate-500">
                      ID {category.id}
                      {category.count != null
                        ? ` · ${category.count} article(s)`
                        : ""}
                      {category.slug ? ` · ${category.slug}` : ""}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="default-category">Catégorie par défaut</Label>
          <select
            id="default-category"
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
            value={defaultCategoryId ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              setDefaultCategoryId(value ? Number(value) : null);
            }}
            disabled={saving || syncing || items.length === 0}
          >
            <option value="">Aucune</option>
            {(allowedIds.length > 0
              ? items.filter((item) => allowedIds.includes(item.id))
              : items
            ).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} ({category.id})
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            Utilisée lorsqu’aucune correspondance n’est trouvée (installations
            clientes). Sur Naxialis, le mapping historique reste actif tant
            qu’aucune sélection dynamique n’est enregistrée.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => void saveSelection()}
          disabled={saving || syncing || !settings.categories.usable}
        >
          {saving ? "Enregistrement…" : "Enregistrer la sélection"}
        </Button>
      </div>
    </section>
  );
}
