import type { Metadata } from "next";
import { CmsIntegrationsPanel } from "@/components/cms/CmsIntegrationsPanel";
import { listCmsDestinations } from "@/lib/cms";
import { getPublicAppSettings } from "@/lib/settings/app-settings";

export const metadata: Metadata = {
  title: "Intégrations CMS",
};

export const dynamic = "force-dynamic";

export default async function CmsIntegrationsPage() {
  const settings = await getPublicAppSettings();
  const destinations = listCmsDestinations();

  const wordpressConfigured = Boolean(
    settings.wordpress.url &&
      settings.wordpress.username &&
      settings.wordpress.appPasswordConfigured
  );

  return (
    <CmsIntegrationsPanel
      destinations={destinations}
      wordpressConfigured={wordpressConfigured}
      wordpressUrl={settings.wordpress.url}
    />
  );
}
