import type { Metadata } from "next";
import { CmsIntegrationsPanel } from "@/components/cms/CmsIntegrationsPanel";
import { listPublicEditorialAgentStatuses } from "@/lib/agent/registry";
import { listCmsDestinations } from "@/lib/cms";
import { getPublicAppSettings } from "@/lib/settings/app-settings";
import {
  listEnabledWorkspaces,
  loadWorkspaceCmsSettings,
} from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Intégrations CMS",
};

export const dynamic = "force-dynamic";

export default async function CmsIntegrationsPage() {
  const [settings, destinations, agents, workspaces] = await Promise.all([
    getPublicAppSettings(),
    Promise.resolve(listCmsDestinations()),
    listPublicEditorialAgentStatuses(),
    listEnabledWorkspaces(),
  ]);

  const workspaceSummaries = await Promise.all(
    workspaces.map(async (workspace) => {
      const cms = await loadWorkspaceCmsSettings(workspace);
      return {
        id: workspace.id,
        name: workspace.name,
        cmsProvider: workspace.cmsProvider,
        siteLabel: workspace.siteLabel,
        siteUrl: workspace.siteUrl,
        defaultLanguage:
          cms.defaultLanguage?.trim() || workspace.defaultLanguage,
        openaiAgentConfigured: Boolean(cms.openaiAgentId?.trim()),
        wpConfigured: Boolean(
          cms.wpUrl?.trim() &&
            cms.wpUsername?.trim() &&
            cms.wpAppPasswordEncrypted
        ),
        webflowConfigured: Boolean(
          cms.webflowApiTokenEncrypted &&
            cms.webflowSiteId?.trim() &&
            cms.webflowCollectionId?.trim()
        ),
      };
    })
  );

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
      webflow={settings.webflow}
      encryptionConfigured={settings.encryptionConfigured}
      workspaceSummaries={workspaceSummaries}
    />
  );
}
