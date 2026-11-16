"use client";

import { useCallback, useState } from "react";
import { EditorialAgentSettings } from "@/components/EditorialAgentSettings";
import { GoogleIntegrationsSettings } from "@/components/GoogleIntegrationsSettings";
import { GeneralSettingsSection } from "@/components/settings/GeneralSettingsSection";
import { OpenAiSettingsSection } from "@/components/settings/OpenAiSettingsSection";
import {
  ServiceStatusSection,
  type ServiceStatusView,
} from "@/components/settings/ServiceStatusSection";
import type { PublicSettingsView } from "@/components/settings/types";
import { WordPressSettingsSection } from "@/components/settings/WordPressSettingsSection";

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
      </div>

      {settings.secretsDecryptError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {settings.secretsDecryptError}
        </p>
      ) : null}

      <GeneralSettingsSection settings={settings} onUpdated={setSettings} />

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

      <WordPressSettingsSection settings={settings} onUpdated={setSettings} />

      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Google</h2>
          <p className="mt-1 text-sm text-slate-600">
            Search Console et GA4 — configuration inchangée (V7.6.1).
          </p>
        </div>
        <GoogleIntegrationsSettings />
      </div>

      <ServiceStatusSection services={services} />
    </div>
  );
}
