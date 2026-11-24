import type { Metadata } from "next";
import { CmsIntegrationsPanel } from "@/components/cms/CmsIntegrationsPanel";
import { listPublicEditorialAgentStatuses } from "@/lib/agent/registry";
import { listCmsDestinations } from "@/lib/cms";
import { getPublicAppSettings } from "@/lib/settings/app-settings";

export const metadata: Metadata = {
  title: "Intégrations CMS",
};

export const dynamic = "force-dynamic";

export default async function CmsIntegrationsPage() {
  const [settings, destinations, agents] = await Promise.all([
    getPublicAppSettings(),
    Promise.resolve(listCmsDestinations()),
    listPublicEditorialAgentStatuses(),
  ]);

  const wordpressConfigured = Boolean(
    settings.wordpress.url &&
      settings.wordpress.username &&
      settings.wordpress.appPasswordConfigured
  );

  return (
    <CmsIntegrationsPanel
      destinations={destinations}
      agents={agents}
      wordpressConfigured={wordpressConfigured}
      wordpressUrl={settings.wordpress.url}
    />
  );
}
