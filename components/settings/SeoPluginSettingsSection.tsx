"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type {
  PublicSettingsView,
  WpSeoPluginView,
} from "@/components/settings/types";

type Props = {
  settings: PublicSettingsView;
  onUpdated: (next: PublicSettingsView) => void;
};

const OPTIONS: { value: WpSeoPluginView; label: string; hint: string }[] = [
  {
    value: "slim_seo",
    label: "Slim SEO",
    hint: "Métadonnées via meta.slim_seo (comportement historique).",
  },
  {
    value: "yoast_seo",
    label: "Yoast SEO",
    hint: "Titre et meta description via _yoast_wpseo_* (extension WP requise).",
  },
];

function pluginLabel(value: WpSeoPluginView): string {
  return value === "yoast_seo" ? "Yoast SEO" : "Slim SEO";
}

export function SeoPluginSettingsSection({ settings, onUpdated }: Props) {
  const [plugin, setPlugin] = useState<WpSeoPluginView>(settings.wpSeoPlugin);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/settings/seo-plugin", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plugin }),
      });
      const payload = (await response.json()) as PublicSettingsView & {
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Enregistrement impossible.");
        return;
      }
      onUpdated(payload);
      setPlugin(payload.wpSeoPlugin);
      setNotice(
        `Plugin SEO enregistré : ${pluginLabel(payload.wpSeoPlugin)}.`
      );
    } catch {
      setError("Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          Intégration SEO WordPress
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Sélectionnez le plugin SEO utilisé par votre site WordPress. Les
          métadonnées des articles seront adaptées automatiquement lors de la
          création des brouillons.
        </p>
      </div>

      <p className="text-sm text-slate-700">
        Plugin actuel :{" "}
        <span className="font-medium text-slate-900">
          {pluginLabel(settings.wpSeoPlugin)}
        </span>
      </p>

      <fieldset className="space-y-3">
        <legend className="sr-only">Plugin SEO</legend>
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 px-3 py-2.5 hover:bg-slate-50"
          >
            <input
              type="radio"
              name="wp-seo-plugin"
              className="mt-1"
              value={option.value}
              checked={plugin === option.value}
              onChange={() => {
                setPlugin(option.value);
                setNotice(null);
                setError(null);
              }}
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">
                {option.label}
              </span>
              <span className="block text-xs text-slate-500">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {plugin === "yoast_seo" ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Yoast SEO nécessite l’extension WordPress « Naxialis Yoast REST Meta »
          pour exposer les champs en écriture REST. Validez d’abord sur un site
          de test (brouillons uniquement).
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

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={() => void save()}
          disabled={saving || plugin === settings.wpSeoPlugin}
        >
          {saving ? "Enregistrement…" : "Enregistrer le plugin SEO"}
        </Button>
        <Label className="text-xs text-slate-500">
          Valeur technique : {plugin}
        </Label>
      </div>
    </section>
  );
}
