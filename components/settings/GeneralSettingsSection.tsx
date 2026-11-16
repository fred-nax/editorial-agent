"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PublicSettingsView } from "@/components/settings/types";

type Props = {
  settings: PublicSettingsView;
  onUpdated: (next: PublicSettingsView) => void;
};

export function GeneralSettingsSection({ settings, onUpdated }: Props) {
  const [clientName, setClientName] = useState(settings.clientName ?? "");
  const [siteName, setSiteName] = useState(settings.siteName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/settings/general", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: clientName.trim() || null,
          siteName: siteName.trim() || null,
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
      setNotice("Informations générales enregistrées.");
    } catch {
      setError("Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Général</h2>
        <p className="mt-1 text-sm text-slate-600">
          Identité de l’installation. Ces champs ne modifient pas les prompts
          éditoriaux.
        </p>
      </div>

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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="client-name">Nom du client / installation</Label>
          <Input
            id="client-name"
            value={clientName}
            onChange={(event) => setClientName(event.target.value)}
            placeholder="Ex. Naxialis"
            maxLength={120}
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="site-name">Nom du site</Label>
          <Input
            id="site-name"
            value={siteName}
            onChange={(event) => setSiteName(event.target.value)}
            placeholder="Ex. naxialis.com"
            maxLength={120}
            disabled={saving}
          />
        </div>
      </div>

      <Button type="button" onClick={() => void save()} disabled={saving}>
        {saving ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </section>
  );
}
