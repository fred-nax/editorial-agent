"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PublicSettingsView } from "@/components/settings/types";

type Props = {
  settings: PublicSettingsView;
  onUpdated: (next: PublicSettingsView) => void;
  onAgentChanged: () => void;
  instructionsDirty: boolean;
};

export function OpenAiSettingsSection({
  settings,
  onUpdated,
  onAgentChanged,
  instructionsDirty,
}: Props) {
  const [agentId, setAgentId] = useState(settings.openai.agentId ?? "");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  async function save() {
    if (instructionsDirty) {
      const proceed = window.confirm(
        "Des instructions non enregistrées seront perdues si l’agent change. Continuer ?"
      );
      if (!proceed) {
        return;
      }
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    setTestMessage(null);
    try {
      const previousAgentId = settings.openai.agentId;
      const body: { agentId?: string; apiKey?: string } = {};
      if (agentId.trim()) {
        body.agentId = agentId.trim();
      }
      if (apiKey.trim()) {
        body.apiKey = apiKey.trim();
      }
      const response = await fetch("/api/settings/openai", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as PublicSettingsView & {
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Enregistrement impossible.");
        return;
      }
      onUpdated(payload);
      setAgentId(payload.openai.agentId ?? "");
      setApiKey("");
      setNotice("Configuration OpenAI enregistrée.");
      if (
        payload.openai.agentId &&
        payload.openai.agentId !== previousAgentId
      ) {
        onAgentChanged();
      }
    } catch {
      setError("Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestMessage(null);
    setTestOk(null);
    try {
      const response = await fetch("/api/settings/openai/test", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agentId.trim() || undefined,
          apiKey: apiKey.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };
      setTestOk(Boolean(payload.ok));
      setTestMessage(payload.message ?? "Résultat du test indisponible.");
    } catch {
      setTestOk(false);
      setTestMessage("Test de connexion impossible.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-900">OpenAI</h2>
        <p className="mt-1 text-sm text-slate-600">
          Identifiant d’agent et clé API. La clé n’est jamais réaffichée. Un
          champ secret vide conserve la valeur actuelle.
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
      {testMessage ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            testOk
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {testMessage}
        </p>
      ) : null}

      {!settings.encryptionConfigured ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Définissez <code className="font-mono text-xs">APP_SETTINGS_ENCRYPTION_KEY</code>{" "}
          pour enregistrer une clé API en base. Les variables d’environnement
          restent utilisables en secours.
        </p>
      ) : null}

      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="openai-agent-id">Identifiant de l’agent</Label>
          <Input
            id="openai-agent-id"
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
            placeholder="agt_…"
            className="font-mono text-sm"
            disabled={saving}
          />
          <p className="text-xs text-slate-500">
            Source actuelle :{" "}
            {settings.openai.agentIdSource === "database"
              ? "base de données"
              : settings.openai.agentIdSource === "env"
                ? "variable d’environnement"
                : "non configuré"}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="openai-api-key">Clé API OpenAI</Label>
          <Input
            id="openai-api-key"
            type="password"
            autoComplete="new-password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              settings.openai.apiKeyConfigured
                ? "•••••••• (laisser vide pour conserver)"
                : "sk-…"
            }
            disabled={saving}
          />
          <p className="text-xs text-slate-500">
            {settings.openai.apiKeyConfigured
              ? `Clé présente (${
                  settings.openai.apiKeySource === "database"
                    ? "base de données"
                    : "environnement"
                })`
              : "Aucune clé configurée"}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer OpenAI"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void testConnection()}
          disabled={testing || saving}
        >
          {testing ? "Test…" : "Tester la connexion"}
        </Button>
      </div>
    </section>
  );
}
