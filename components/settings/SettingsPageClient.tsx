"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { EditorialAgentSettings } from "@/components/EditorialAgentSettings";
import { GoogleIntegrationsSettings } from "@/components/GoogleIntegrationsSettings";
import { EditorialSettingsSection } from "@/components/settings/EditorialSettingsSection";
import { GeneralSettingsSection } from "@/components/settings/GeneralSettingsSection";
import { OpenAiSettingsSection } from "@/components/settings/OpenAiSettingsSection";
import { SeoPluginSettingsSection } from "@/components/settings/SeoPluginSettingsSection";
import {
  ServiceStatusSection,
  type ServiceStatusView,
} from "@/components/settings/ServiceStatusSection";
import type { PublicSettingsView } from "@/components/settings/types";
import { WordPressSettingsSection } from "@/components/settings/WordPressSettingsSection";
import { WorkspaceLanguageSettingsSection } from "@/components/settings/WorkspaceLanguageSettingsSection";

type Props = {
  initialSettings: PublicSettingsView;
  initialServices: ServiceStatusView[];
};

export function SettingsPageClient({
  initialSettings,
  initialServices,
}: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [services] = useState(initialServices);
  const [reloadToken, setReloadToken] = useState(0);
  const [instructionsDirty, setInstructionsDirty] = useState(false);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setInstructionsDirty(dirty);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Paramètres</h1>
        <p className="mt-1 text-sm text-slate-600">
          Configuration de l’installation, des connexions OpenAI / WordPress et
          de Google. Aucun secret n’est affiché.
        </p>
        <p className="mt-2 text-sm">
          <Link
            href="/settings/integrations"
            className="font-medium text-naxialis hover:underline"
          >
            Intégrations CMS →
          </Link>
          <span className="text-slate-500">
            {" "}
            destinations WordPress / Webflow
          </span>
        </p>
      </div>

      {settings.secretsDecryptError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {settings.secretsDecryptError}
        </p>
      ) : null}

      <GeneralSettingsSection settings={settings} onUpdated={setSettings} />

      <WorkspaceLanguageSettingsSection />

      <OpenAiSettingsSection
        settings={settings}
        onUpdated={setSettings}
        onAgentChanged={() => setReloadToken((value) => value + 1)}
        instructionsDirty={instructionsDirty}
      />

      <EditorialAgentSettings
        reloadToken={reloadToken}
        onDirtyChange={handleDirtyChange}
      />

      <EditorialSettingsSection settings={settings} onUpdated={setSettings} />

      <WordPressSettingsSection settings={settings} onUpdated={setSettings} />

      <SeoPluginSettingsSection settings={settings} onUpdated={setSettings} />

      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Google</h2>
          <p className="mt-1 text-sm text-slate-600">
            Search Console par espace éditorial (V7.14.0). GA4 reste WordPress
            uniquement.
          </p>
        </div>
        <GoogleIntegrationsSettings />
      </div>

      <ServiceStatusSection services={services} />
    </div>
  );
}
