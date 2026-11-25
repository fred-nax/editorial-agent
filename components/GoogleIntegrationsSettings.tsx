"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type StatusPayload = {
  oauthConfigured: boolean;
  connected: boolean;
  status: string;
  accountEmail: string | null;
  lastError: string | null;
  cmsProvider?: string;
  workspaceId?: string;
  publicSiteUrl?: string | null;
  ga4Supported?: boolean;
  selection: {
    gscPropertyUrl: string | null;
    gscPropertyType: string | null;
    gscPermissionLevel: string | null;
    ga4AccountId: string | null;
    ga4PropertyId: string | null;
    ga4PropertyName: string | null;
    gscCompatibleWithSite?: boolean;
    gscCompatibleWithWp: boolean;
  } | null;
  states?: {
    gscConfigured: boolean;
    gscCompatible: boolean;
    syncRunning: boolean;
    hasPreviousData: boolean;
  };
  sync: {
    running: boolean;
    lastStatus: string | null;
    lastFinishedAt: string | null;
    lastError: string | null;
    lastMode: string | null;
  };
};

type PropertiesPayload = {
  gsc: Array<{
    siteUrl: string;
    permissionLevel: string | null;
    propertyType: string;
  }>;
  ga4: Array<{
    accountId: string;
    accountName: string;
    propertyId: string;
    propertyName: string;
  }>;
};

const selectClassName =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function GoogleIntegrationsSettings() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [properties, setProperties] = useState<PropertiesPayload | null>(null);
  const [gscUrl, setGscUrl] = useState("");
  const [ga4Id, setGa4Id] = useState("");
  const [publicSiteUrl, setPublicSiteUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const isWebflow = status?.cmsProvider === "webflow";
  const ga4Supported = status?.ga4Supported !== false && !isWebflow;

  const refresh = useCallback(async () => {
    const response = await fetch("/api/google/status", { credentials: "same-origin" });
    const payload = (await response.json()) as StatusPayload & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Statut Google indisponible.");
    }
    setStatus(payload);
    setGscUrl(payload.selection?.gscPropertyUrl ?? "");
    setGa4Id(payload.selection?.ga4PropertyId ?? "");
    setPublicSiteUrl(payload.publicSiteUrl ?? "");
    return payload;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erreur statut Google.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!status?.sync.running) {
      return;
    }
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [status?.sync.running, refresh]);

  async function loadProperties() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/google/properties", {
        credentials: "same-origin",
      });
      const payload = (await response.json()) as PropertiesPayload & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Chargement des propriétés impossible.");
      }
      setProperties(payload);
      setEditing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur propriétés.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSelection() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const gsc = properties?.gsc.find((item) => item.siteUrl === gscUrl);
      const ga4 = properties?.ga4.find((item) => item.propertyId === ga4Id);
      const response = await fetch("/api/google/properties/select", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gscPropertyUrl: gscUrl || null,
          gscPropertyType: gsc?.propertyType ?? null,
          gscPermissionLevel: gsc?.permissionLevel ?? null,
          ga4AccountId: ga4Supported ? (ga4?.accountId ?? null) : null,
          ga4PropertyId: ga4Supported ? (ga4Id || null) : null,
          ga4PropertyName: ga4Supported ? (ga4?.propertyName ?? null) : null,
          publicSiteUrl: publicSiteUrl.trim() || null,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Enregistrement impossible.");
      }
      setMessage("Propriétés enregistrées pour cet espace.");
      setEditing(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  async function syncNow(mode: "initial" | "manual") {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/google/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Synchronisation impossible.");
      }
      setMessage(
        mode === "initial"
          ? "Import initial (90 jours) démarré…"
          : "Synchronisation démarrée…"
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur sync.");
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/google/properties", {
        credentials: "same-origin",
      });
      const payload = (await response.json()) as PropertiesPayload & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Test de connexion impossible.");
      }
      const count = payload.gsc?.length ?? 0;
      setMessage(
        count > 0
          ? `Connexion OK — ${count} propriété(s) Search Console accessible(s).`
          : "Connexion OK — aucune propriété Search Console visible pour ce compte."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec du test.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Déconnecter Google et supprimer les jetons locaux ?")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/google/disconnect", {
        method: "POST",
        credentials: "same-origin",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Déconnexion impossible.");
      }
      setProperties(null);
      setEditing(false);
      setMessage("Google déconnecté.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur déconnexion.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card className="border border-[#E2E8F0] bg-white shadow-none ring-0 dark:border-slate-700 dark:bg-slate-950">
        <CardContent className="p-5 text-sm text-slate-600">
          Chargement de l’intégration Google…
        </CardContent>
      </Card>
    );
  }

  const gscCompatible =
    status?.selection?.gscCompatibleWithSite ??
    status?.selection?.gscCompatibleWithWp ??
    true;

  return (
    <Card className="border border-[#E2E8F0] bg-white shadow-none ring-0 dark:border-slate-700 dark:bg-slate-950">
      <CardHeader className="gap-1 border-b border-[#E2E8F0] p-5 dark:border-slate-700">
        <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {isWebflow
            ? "Google Search Console"
            : "Google Search Console & Analytics"}
        </CardTitle>
        <CardDescription className="text-sm text-slate-600 dark:text-slate-400">
          {isWebflow
            ? "Search Console par espace Webflow — identité Google mutualisable, propriété dédiée obligatoire. GA4 hors périmètre de cette version."
            : "Connexion OAuth en lecture seule. Les jetons restent côté serveur et sont chiffrés."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

        {!status?.oauthConfigured ? (
          <p className="text-sm text-amber-800">
            Configurez GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
            GOOGLE_TOKEN_ENCRYPTION_KEY et AUTH_URL pour activer la connexion.
          </p>
        ) : null}

        <div className="grid gap-2 text-sm">
          <p>
            <span className="font-medium text-slate-700 dark:text-slate-300">
              État :{" "}
            </span>
            {status?.connected ? (
              <span className="text-emerald-700">Connecté</span>
            ) : (
              <span className="text-amber-700">Non connecté</span>
            )}
            {status?.accountEmail ? ` · ${status.accountEmail}` : null}
          </p>
          {!status?.selection?.gscPropertyUrl ? (
            <p className="text-slate-600 dark:text-slate-400">
              Search Console non configurée pour cet espace
              {isWebflow
                ? " — aucune propriété WordPress n’est réutilisée automatiquement."
                : "."}
            </p>
          ) : (
            <p className="break-all text-slate-700 dark:text-slate-300">
              <span className="font-medium">Search Console : </span>
              {status.selection.gscPropertyUrl}
              {status.selection.gscPropertyType
                ? ` (${status.selection.gscPropertyType})`
                : ""}
            </p>
          )}
          {status?.publicSiteUrl ? (
            <p className="break-all text-slate-700 dark:text-slate-300">
              <span className="font-medium">Domaine public : </span>
              {status.publicSiteUrl}
            </p>
          ) : null}
          {ga4Supported &&
          (status?.selection?.ga4PropertyName ||
            status?.selection?.ga4PropertyId) ? (
            <p className="text-slate-700 dark:text-slate-300">
              <span className="font-medium">GA4 : </span>
              {status.selection.ga4PropertyName ??
                status.selection.ga4PropertyId}
            </p>
          ) : null}
          {status?.selection?.gscPropertyUrl && !gscCompatible ? (
            <p className="text-sm text-amber-800">
              La propriété Search Console semble incompatible avec le domaine
              public de cet espace. Vérifiez la sélection.
            </p>
          ) : null}
          <p className="text-slate-600 dark:text-slate-400">
            Dernière sync :{" "}
            {status?.sync.lastFinishedAt
              ? new Date(status.sync.lastFinishedAt).toLocaleString("fr-FR")
              : "jamais"}
            {status?.sync.running ? " · en cours…" : null}
            {status?.sync.lastError ? ` · ${status.sync.lastError}` : null}
          </p>
          {status?.sync.lastStatus === "failed" &&
          status.states?.hasPreviousData ? (
            <p className="text-sm text-amber-800">
              Dernière synchronisation en erreur — les données précédemment
              synchronisées restent disponibles.
            </p>
          ) : null}
          <p className="text-[11px] leading-relaxed text-slate-500">
            {isWebflow
              ? "Les statistiques Search Console sont isolées par espace et par propriété. Aucune donnée WordPress n’est affichée ici."
              : "Les impressions AI Overviews / AI Mode de Search Console ne sont pas disponibles via l’API publique. Le trafic assistants IA repose sur les sources GA4 identifiables."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!status?.connected ? (
            <Button
              type="button"
              size="sm"
              disabled={!status?.oauthConfigured || busy}
              onClick={() => {
                window.location.href = "/api/google/oauth/start";
              }}
            >
              Connecter Google
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || status.sync.running}
                onClick={() => void loadProperties()}
              >
                {status.selection?.gscPropertyUrl
                  ? "Changer les propriétés"
                  : "Configurer Search Console"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void testConnection()}
              >
                Tester la connexion
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={
                  busy ||
                  status.sync.running ||
                  !status.selection?.gscPropertyUrl
                }
                onClick={() => void syncNow("manual")}
              >
                Synchroniser
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  busy ||
                  status.sync.running ||
                  !status.selection?.gscPropertyUrl
                }
                onClick={() => void syncNow("initial")}
              >
                Import 90 jours
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void disconnect()}
              >
                Déconnecter Google
              </Button>
            </>
          )}
        </div>

        {editing && properties ? (
          <div className="space-y-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 dark:border-slate-700 dark:bg-slate-900/50">
            <div className="space-y-1.5">
              <Label htmlFor="gsc-public-url">URL publique du site</Label>
              <input
                id="gsc-public-url"
                type="url"
                className={selectClassName}
                value={publicSiteUrl}
                onChange={(e) => setPublicSiteUrl(e.target.value)}
                placeholder="https://www.example.com"
              />
              <p className="text-[11px] text-slate-500">
                Utilisée pour valider la propriété Domain ou URL-prefix.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gsc-property">Propriété Search Console</Label>
              <select
                id="gsc-property"
                className={selectClassName}
                value={gscUrl}
                onChange={(e) => setGscUrl(e.target.value)}
              >
                <option value="">— Aucune —</option>
                {properties.gsc.map((item) => (
                  <option key={item.siteUrl} value={item.siteUrl}>
                    {item.siteUrl} ({item.propertyType}
                    {item.permissionLevel ? ` · ${item.permissionLevel}` : ""})
                  </option>
                ))}
              </select>
            </div>
            {ga4Supported ? (
              <div className="space-y-1.5">
                <Label htmlFor="ga4-property">Propriété GA4</Label>
                <select
                  id="ga4-property"
                  className={selectClassName}
                  value={ga4Id}
                  onChange={(e) => setGa4Id(e.target.value)}
                >
                  <option value="">— Aucune —</option>
                  {properties.ga4.map((item) => (
                    <option key={item.propertyId} value={item.propertyId}>
                      {item.propertyName} ({item.accountName} ·{" "}
                      {item.propertyId})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Google Analytics 4 n’est pas proposé pour Webflow dans cette
                version.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void saveSelection()}
              >
                Enregistrer
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Annuler
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
