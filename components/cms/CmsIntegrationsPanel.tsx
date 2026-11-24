"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WebflowConfigPanel } from "@/components/cms/WebflowConfigPanel";
import type { PublicSettingsView } from "@/components/settings/types";
import type { CmsDestinationDescriptor } from "@/lib/cms/types";
import type { PublicEditorialAgentStatus } from "@/lib/agent/registry";

type Props = {
  destinations: CmsDestinationDescriptor[];
  agents: PublicEditorialAgentStatus[];
  wordpressConfigured: boolean;
  wordpressUrl: string | null;
  webflow: PublicSettingsView["webflow"];
  encryptionConfigured: boolean;
};

export function CmsIntegrationsPanel({
  destinations,
  agents,
  wordpressConfigured,
  wordpressUrl,
  webflow: initialWebflow,
  encryptionConfigured,
}: Props) {
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [webflow, setWebflow] = useState(initialWebflow);

  async function testWordPress() {
    setTesting(true);
    setTestOk(null);
    setTestMessage(null);
    try {
      const response = await fetch("/api/cms/wordpress/test", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };
      setTestOk(Boolean(payload.ok));
      setTestMessage(payload.message ?? "Résultat indisponible.");
    } catch {
      setTestOk(false);
      setTestMessage("Test de connexion impossible.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Intégrations CMS
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Destinations de publication et agents éditoriaux OpenAI associés.
          Aucune clé API n’est affichée.
        </p>
      </div>

      <div className="space-y-4">
        {destinations.map((destination) => {
          const agent = agents.find(
            (item) => item.cmsDestination === destination.id
          );
          return (
            <section
              key={destination.id}
              className="space-y-3 rounded-lg border border-slate-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    {destination.label}
                    {destination.status === "coming_soon" ? (
                      <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                        Bientôt
                      </span>
                    ) : (
                      <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                        Actif
                      </span>
                    )}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {destination.description}
                  </p>
                </div>
              </div>

              {agent ? (
                <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <p>
                    <span className="font-medium">Agent éditorial :</span>{" "}
                    {agent.label}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Variable : {agent.agentEnvKey} · État :{" "}
                    {agent.configured ? (
                      <span className="font-medium text-emerald-800">
                        configuré
                        {agent.agentIdSource
                          ? ` (source ${agent.agentIdSource})`
                          : ""}
                      </span>
                    ) : (
                      <span className="font-medium text-amber-800">
                        non configuré
                      </span>
                    )}
                  </p>
                </div>
              ) : null}

              {destination.id === "wordpress" ? (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                  <p className="text-sm text-slate-700">
                    Connexion WordPress :{" "}
                    {wordpressConfigured ? (
                      <span className="font-medium text-emerald-800">
                        présente
                        {wordpressUrl ? ` (${wordpressUrl})` : ""}
                      </span>
                    ) : (
                      <span className="font-medium text-amber-800">
                        incomplète
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => void testWordPress()}
                      disabled={testing || !wordpressConfigured}
                    >
                      {testing
                        ? "Test en cours…"
                        : "Tester la connexion WordPress"}
                    </Button>
                    <Link
                      href="/settings"
                      className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
                    >
                      Ouvrir les paramètres
                    </Link>
                  </div>
                  {testMessage ? (
                    <p
                      className={`rounded-md border px-3 py-2 text-sm ${
                        testOk
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-red-200 bg-red-50 text-red-900"
                      }`}
                    >
                      {testMessage}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {destination.id === "webflow" ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-700">
                    Connexion Webflow :{" "}
                    {webflow.connectionConfigured ? (
                      <span className="font-medium text-emerald-800">
                        configurée (lecture seule)
                      </span>
                    ) : webflow.apiTokenConfigured ? (
                      <span className="font-medium text-amber-800">
                        partielle — site / collection / agent à compléter
                      </span>
                    ) : (
                      <span className="font-medium text-amber-800">
                        non configurée
                      </span>
                    )}
                  </p>
                  <WebflowConfigPanel
                    initial={webflow}
                    encryptionConfigured={encryptionConfigured}
                    onUpdated={setWebflow}
                  />
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
