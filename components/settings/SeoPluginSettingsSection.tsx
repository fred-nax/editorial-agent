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

type DiagnoseStatus = "compatible" | "incomplete" | "connection_error";

type DiagnosePayload = {
  status: DiagnoseStatus;
  message: string;
  plugin?: string;
  restConnected?: boolean;
  metaFieldsAccessible?: boolean;
  editCapabilityDetected?: boolean | null;
  writeValidated?: boolean;
  error?: string;
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

function diagnoseBannerClass(status: DiagnoseStatus): string {
  if (status === "compatible") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (status === "incomplete") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-red-200 bg-red-50 text-red-900";
}

export function SeoPluginSettingsSection({ settings, onUpdated }: Props) {
  const [plugin, setPlugin] = useState<WpSeoPluginView>(settings.wpSeoPlugin);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [diagnose, setDiagnose] = useState<DiagnosePayload | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    setDiagnose(null);
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

  async function checkSeoConnection() {
    setChecking(true);
    setError(null);
    setNotice(null);
    setDiagnose(null);
    try {
      const response = await fetch(
        `/api/settings/seo-plugin/check?plugin=${encodeURIComponent(plugin)}`,
        {
          method: "GET",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }
      );
      const payload = (await response.json()) as DiagnosePayload;
      if (!payload.status) {
        setError(payload.error ?? "Diagnostic SEO impossible.");
        return;
      }
      setDiagnose(payload);
    } catch {
      setError(
        "Impossible de vérifier la configuration SEO WordPress. Vérifiez la connexion et les identifiants configurés."
      );
    } finally {
      setChecking(false);
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
                setDiagnose(null);
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

      {plugin === "yoast_seo" && !diagnose && !checking ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          Cliquez sur « Vérifier la connexion SEO » pour contrôler si les champs
          Yoast (`_yoast_wpseo_title`, `_yoast_wpseo_metadesc`) sont exposés via
          l’API REST WordPress. Aucun brouillon n’est créé ni modifié.
        </p>
      ) : null}

      {checking ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Vérification de la connexion SEO en cours…
        </p>
      ) : null}

      {diagnose ? (
        <div
          className={`space-y-1 rounded-md border px-3 py-2 text-sm ${diagnoseBannerClass(diagnose.status)}`}
        >
          <p>{diagnose.message}</p>
          {diagnose.status === "compatible" && !diagnose.writeValidated ? (
            <p className="text-xs opacity-90">
              Niveau 1 — compatibilité détectée. L’écriture réelle sur un
              brouillon n’a pas encore été validée.
            </p>
          ) : null}
        </div>
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

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => void save()}
          disabled={saving || checking || plugin === settings.wpSeoPlugin}
        >
          {saving ? "Enregistrement…" : "Enregistrer le plugin SEO"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void checkSeoConnection()}
          disabled={checking || saving}
        >
          {checking ? "Vérification…" : "Vérifier la connexion SEO"}
        </Button>
        <Label className="text-xs text-slate-500">
          Valeur technique : {plugin}
        </Label>
      </div>
    </section>
  );
}
