import type { WebflowClient } from "@/lib/webflow/client";
import type { WebflowSiteSummary } from "@/lib/webflow/types";

type SitesApiResponse = {
  sites?: Array<{
    id?: string;
    displayName?: string;
    shortName?: string | null;
  }>;
};

export async function listWebflowSites(
  client: WebflowClient
): Promise<WebflowSiteSummary[]> {
  const payload = await client.request<SitesApiResponse>({
    path: "/sites",
  });
  const sites = Array.isArray(payload.sites) ? payload.sites : [];
  return sites
    .filter((site): site is { id: string; displayName?: string; shortName?: string | null } =>
      typeof site?.id === "string" && site.id.trim().length > 0
    )
    .map((site) => ({
      id: site.id.trim(),
      displayName:
        typeof site.displayName === "string" && site.displayName.trim()
          ? site.displayName.trim()
          : site.id.trim(),
      shortName:
        typeof site.shortName === "string" && site.shortName.trim()
          ? site.shortName.trim()
          : null,
    }));
}
