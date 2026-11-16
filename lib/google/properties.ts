import { getValidAccessToken } from "@/lib/google/connection";

export type GscSiteProperty = {
  siteUrl: string;
  permissionLevel: string | null;
  propertyType: "domain" | "url_prefix";
};

export type Ga4PropertyOption = {
  accountId: string;
  accountName: string;
  propertyId: string;
  propertyName: string;
};

export async function listSearchConsoleSites(): Promise<GscSiteProperty[]> {
  const token = await getValidAccessToken();
  const response = await fetch(
    "https://www.googleapis.com/webmasters/v3/sites",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const payload = (await response.json()) as {
    siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? "Impossible de lister les propriétés Search Console."
    );
  }
  return (payload.siteEntry ?? [])
    .filter((s) => typeof s.siteUrl === "string" && s.siteUrl.length > 0)
    .map((s) => ({
      siteUrl: s.siteUrl as string,
      permissionLevel: s.permissionLevel ?? null,
      propertyType: (s.siteUrl as string).startsWith("sc-domain:")
        ? ("domain" as const)
        : ("url_prefix" as const),
    }));
}

export async function listGa4Properties(): Promise<Ga4PropertyOption[]> {
  const token = await getValidAccessToken();
  const response = await fetch(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const payload = (await response.json()) as {
    accountSummaries?: Array<{
      account?: string;
      displayName?: string;
      propertySummaries?: Array<{
        property?: string;
        displayName?: string;
      }>;
    }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? "Impossible de lister les propriétés GA4."
    );
  }
  const out: Ga4PropertyOption[] = [];
  for (const account of payload.accountSummaries ?? []) {
    const accountId = (account.account ?? "").replace(/^accounts\//, "");
    for (const prop of account.propertySummaries ?? []) {
      const propertyId = (prop.property ?? "").replace(/^properties\//, "");
      if (!propertyId) {
        continue;
      }
      out.push({
        accountId,
        accountName: account.displayName ?? accountId,
        propertyId,
        propertyName: prop.displayName ?? propertyId,
      });
    }
  }
  return out;
}
