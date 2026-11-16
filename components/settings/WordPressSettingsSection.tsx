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

export function WordPressSettingsSection({ settings, onUpdated }: Props) {
  const [url, setUrl] = useState(settings.wordpress.url ?? "");
  const [username, setUsername] = useState(settings.wordpress.username ?? "");
  const [appPassword, setAppPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    setTestMessage(null);
    try {
      const body: {
        url?: string;
        username?: string;
        appPassword?: string;
      } = {};
      if (url.trim()) body.url = url.trim();
      if (username.trim()) body.username = username.trim();
      if (appPassword.trim()) body.appPassword = appPassword.trim();

      const response = await fetch("/api/settings/wordpress", {
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
      setUrl(payload.wordpress.url ?? "");
      setUsername(payload.wordpress.username ?? "");
      setAppPassword("");
      setNotice("Configuration WordPress enregistrée.");
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
      const response = await fetch("/api/settings/wordpress/test", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim() || undefined,
          username: username.trim() || undefined,
          appPassword: appPassword.trim() || undefined,
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

  async function acknowledgeInventory() {
    setAcknowledging(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/settings/wordpress/acknowledge-inventory",
        {
          method: "POST",
          credentials: "same-origin",
        }
      );
      const payload = (await response.json()) as PublicSettingsView & {
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Confirmation impossible.");
        return;
      }
      onUpdated(payload);
      setNotice(
        "Inventaire invalidé. Lancez une synchronisation complète du nouveau site. Les données historiques locales sont conservées mais inutilisables tant que la sync n’a pas réussi."
      );
    } catch {
      setError("Confirmation impossible.");
    } finally {
      setAcknowledging(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-900">WordPress</h2>
        <p className="mt-1 text-sm text-slate-600">
          Site cible et Application Password. Le mot de passe n’est jamais
          réaffiché. Création exclusivement en brouillon.
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

      {!settings.inventory.usable ? (
        <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p>
            {settings.inventory.reason ??
              "Inventaire WordPress inutilisable pour le site configuré."}
            {settings.inventory.postCount > 0
              ? ` (${settings.inventory.postCount} contenu${settings.inventory.postCount > 1 ? "s" : ""} historique conservé, non utilisé).`
              : null}
          </p>
          <p className="text-xs">
            Une confirmation n’active pas l’ancien inventaire : elle autorise
            uniquement une synchronisation complète du nouveau site.
          </p>
          {settings.inventory.siteMismatch || !settings.inventory.inventoryValid ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void acknowledgeInventory()}
              disabled={acknowledging}
            >
              {acknowledging
                ? "Confirmation…"
                : "Confirmer et imposer une sync complète"}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="wp-url">URL du site</Label>
          <Input
            id="wp-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://exemple.com"
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wp-username">Utilisateur REST API</Label>
          <Input
            id="wp-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wp-app-password">Mot de passe d’application</Label>
          <Input
            id="wp-app-password"
            type="password"
            autoComplete="new-password"
            value={appPassword}
            onChange={(event) => setAppPassword(event.target.value)}
            placeholder={
              settings.wordpress.appPasswordConfigured
                ? "•••••••• (laisser vide pour conserver)"
                : "xxxx xxxx xxxx xxxx"
            }
            disabled={saving}
          />
          <p className="text-xs text-slate-500">
            {settings.wordpress.appPasswordConfigured
              ? `Mot de passe présent (${
                  settings.wordpress.appPasswordSource === "database"
                    ? "base de données"
                    : "environnement"
                })`
              : "Aucun mot de passe configuré"}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer WordPress"}
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
