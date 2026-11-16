import type { Metadata } from "next";
import { SettingsPageClient } from "@/components/settings/SettingsPageClient";
import { getServiceStatuses } from "@/lib/config-status";
import { getPublicAppSettings } from "@/lib/settings/app-settings";

export const metadata: Metadata = {
  title: "Paramètres",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, services] = await Promise.all([
    getPublicAppSettings(),
    getServiceStatuses(),
  ]);

  return (
    <SettingsPageClient
      initialSettings={settings}
      initialServices={services}
    />
  );
}
