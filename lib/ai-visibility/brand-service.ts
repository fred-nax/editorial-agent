import { db } from "@/lib/db";
import { validateBrandInput } from "@/lib/ai-visibility/brands";
import { logError } from "@/lib/logger";

export type VisibilityBrandListItem = {
  id: string;
  name: string;
  primaryDomain: string;
  description: string | null;
  sector: string | null;
  products: string | null;
  country: string;
  language: string;
  aliases: unknown;
  domainAliases: unknown;
  knownCompetitors: unknown;
  createdAt: Date;
  updatedAt: Date;
  lastCampaign: {
    id: string;
    subject: string;
    status: string;
    mentionRate: number | null;
    createdAt: Date;
    finishedAt: Date | null;
  } | null;
  campaignCount: number;
};

export async function listVisibilityBrands(): Promise<VisibilityBrandListItem[]> {
  const brands = await db.visibilityBrand.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      campaigns: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: { select: { campaigns: true } },
    },
  });

  return brands.map((brand) => {
    const { campaigns, _count, ...rest } = brand;
    return {
      ...rest,
      lastCampaign: campaigns[0]
        ? {
            id: campaigns[0].id,
            subject: campaigns[0].subject,
            status: campaigns[0].status,
            mentionRate: campaigns[0].mentionRate,
            createdAt: campaigns[0].createdAt,
            finishedAt: campaigns[0].finishedAt,
          }
        : null,
      campaignCount: _count.campaigns,
    };
  });
}

export async function createVisibilityBrand(input: unknown) {
  const validated = validateBrandInput(input);
  if (!validated.ok) {
    return { ok: false as const, error: validated.error, status: 400 as const };
  }

  try {
    const brand = await db.visibilityBrand.create({
      data: {
        name: validated.value.name,
        primaryDomain: validated.value.primaryDomain,
        description: validated.value.description,
        sector: validated.value.sector,
        products: validated.value.products,
        country: validated.value.country,
        language: validated.value.language,
        aliases: validated.value.aliases,
        domainAliases: validated.value.domainAliases,
        knownCompetitors: validated.value.knownCompetitors,
      },
    });
    return { ok: true as const, brand };
  } catch (error) {
    logError("ai-visibility", "create brand failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false as const,
      error: "Impossible d’enregistrer la marque.",
      status: 500 as const,
    };
  }
}
