"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceOptional } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGE_OPTIONS } from "@/lib/editorial-context";
import { resolveFormLanguage } from "@/lib/workspace/language";

export function WorkspaceLanguageSettingsSection() {
  const router = useRouter();
  const workspaceCtx = useWorkspaceOptional();
  const active = workspaceCtx?.active;
  const workspaceFetch = workspaceCtx?.workspaceFetch ?? fetch;

  const [language, setLanguage] = useState(() =>
    resolveFormLanguage(active?.defaultLanguage, "fr")
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }
    setLanguage(resolveFormLanguage(active.defaultLanguage, "fr"));
    setError(null);
    setNotice(null);
  }, [active?.id, active?.defaultLanguage]);

  if (!active || !workspaceCtx) {
    return null;
  }

  const cmsLabel =
    active.cmsProvider === "webflow" ? "Webflow" : "WordPress";

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await workspaceFetch("/api/workspace/language", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultLanguage: language }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        defaultLanguage?: string;
        active?: typeof active;
        error?: string;
      };
      if (!response.ok || !payload.defaultLanguage) {
        setError(payload.error ?? "Enregistrement impossible.");
        return;
      }
      setLanguage(payload.defaultLanguage);
      setNotice("Langue éditoriale enregistrée pour cet espace.");
      // Resync RSC → WorkspaceProvider (defaultLanguage).
      router.refresh();
    } catch {
      setError("Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          Langue éditoriale de l’espace
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Préremplit la langue sur « Nouvel article » pour l’espace actif (
          {cmsLabel}
          {active.siteLabel ? ` · ${active.siteLabel}` : ""}). N’affecte pas
          les autres espaces ni les instructions des agents OpenAI. Les
          générations déjà lancées conservent leur contexte.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="workspace-default-language">Langue par défaut</Label>
        <Select
          value={language}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setLanguage(value);
              setNotice(null);
            }
          }}
          disabled={saving}
        >
          <SelectTrigger
            id="workspace-default-language"
            className="h-9 w-full max-w-md border-slate-200 bg-white"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" className="w-(--anchor-width)">
            {LANGUAGE_OPTIONS.map((option) => (
              <SelectItem key={option.code} value={option.code}>
                {option.label}
                {option.code === "fr" ? " (fr-FR)" : ` (${option.code})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => void save()}
          disabled={saving || language === active.defaultLanguage}
        >
          {saving ? "Enregistrement…" : "Enregistrer la langue"}
        </Button>
      </div>

      {notice ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </section>
  );
}
