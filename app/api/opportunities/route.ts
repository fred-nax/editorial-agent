import { NextResponse } from "next/server";
import {
  Prisma,
  type EditorialUrgency,
  type OpportunityContentType,
  type OpportunityStatus,
  type TrendType,
} from "@prisma/client";
import {
  assertPaidRouteAllowed,
  paidRouteTooManyRequestsResponse,
} from "@/lib/auth/paid-route-rate-limit";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { defaultDomainQuotas } from "@/lib/seo/domains";
import { countWorkspaceInventoryForOpportunities } from "@/lib/seo/duplicates";
import { enqueueOpportunitySearch } from "@/lib/seo/opportunity-search";
import {
  snapshotFromValidated,
  validateResearchConfiguration,
} from "@/lib/seo/research-config";
import {
  customThemeToDomain,
  listThemeCatalog,
  loadEditorialCatalogForSearch,
} from "@/lib/seo/theme-catalog";
import { requireActiveThemesForDomainsSearch } from "@/lib/seo/theme-catalog-shared";
import {
  assertModuleAllowedForWorkspace,
  resolveActiveWorkspace,
  WorkspaceContextError,
  workspaceWhere,
} from "@/lib/workspace";
import {
  isEditorialUrgency,
  isTrendType,
} from "@/lib/seo/trend-signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function workspaceErrorResponse(error: WorkspaceContextError) {
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status }
  );
}

/** Tailles de page autorisées pour GET /api/opportunities. */
const ALLOWED_PAGE_SIZES = [10, 20, 50] as const;
const DEFAULT_PAGE_SIZE = 20;

function parsePageSize(raw: string | null): number {
  const value = Number(raw);
  if (
    ALLOWED_PAGE_SIZES.includes(value as (typeof ALLOWED_PAGE_SIZES)[number])
  ) {
    return value;
  }
  return DEFAULT_PAGE_SIZE;
}

function parsePage(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.floor(value);
}

export async function GET(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  try {
    const workspace = await resolveActiveWorkspace();
    assertModuleAllowedForWorkspace(workspace, "opportunities");
    const workspaceId = workspace.id;

    const { searchParams } = new URL(request.url);
    const theme = searchParams.get("theme")?.trim() || undefined;
    const status = searchParams.get("status")?.trim() || undefined;
    const contentType = searchParams.get("contentType")?.trim() || undefined;
    const runId = searchParams.get("runId")?.trim() || undefined;
    const trendTypeParam = searchParams.get("trendType")?.trim() || undefined;
    const urgencyParam = searchParams.get("urgency")?.trim() || undefined;
    const pageSize = parsePageSize(searchParams.get("pageSize"));
    let page = parsePage(searchParams.get("page"));

    const where: Prisma.SeoOpportunityWhereInput = {
      ...workspaceWhere(workspaceId),
    };

    if (theme) {
      const catalogTheme = await db.customTheme.findFirst({
        where: {
          ...workspaceWhere(workspaceId),
          OR: [{ id: theme }, { name: theme }, { legacyKey: theme }],
        },
      });
      if (catalogTheme) {
        where.OR = [
          { themeId: catalogTheme.id },
          { theme: catalogTheme.name },
        ];
      } else {
        where.theme = theme;
      }
    }
    if (
      status === "new" ||
      status === "reviewed" ||
      status === "added_to_queue" ||
      status === "dismissed"
    ) {
      where.status = status;
    }
    if (
      contentType === "news" ||
      contentType === "evergreen" ||
      contentType === "commercial"
    ) {
      where.contentType = contentType;
    }
    if (runId) {
      where.searchRunId = runId;
    }
    if (isTrendType(trendTypeParam)) {
      where.trendType = trendTypeParam;
    }
    if (isEditorialUrgency(urgencyParam)) {
      where.editorialUrgency = urgencyParam;
    }

    // Tri stable entre pages (score → titre → id).
    const orderBy: Prisma.SeoOpportunityOrderByWithRelationInput[] = [
      { scoreTotal: "desc" },
      { title: "asc" },
      { id: "asc" },
    ];

    const [
      total,
      lastSearch,
      runningSearch,
      inventory,
      recentRuns,
      customThemes,
      savedConfigs,
      detectedCount,
      highPriorityCount,
      toHandleCount,
    ] = await Promise.all([
      db.seoOpportunity.count({ where }),
      db.opportunitySearchRun.findFirst({
        where: workspaceWhere(workspaceId),
        orderBy: { startedAt: "desc" },
      }),
      db.opportunitySearchRun.findFirst({
        where: { ...workspaceWhere(workspaceId), status: "running" },
        orderBy: { startedAt: "desc" },
      }),
      countWorkspaceInventoryForOpportunities(workspaceId),
      db.opportunitySearchRun.findMany({
        where: workspaceWhere(workspaceId),
        orderBy: { startedAt: "desc" },
        take: 20,
      }),
      listThemeCatalog({ workspaceId }),
      db.researchConfig.findMany({
        where: workspaceWhere(workspaceId),
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
      // Cards globales : hors filtres table (scopées à l’espace actif).
      db.seoOpportunity.count({ where: workspaceWhere(workspaceId) }),
      db.seoOpportunity.count({
        where: { ...workspaceWhere(workspaceId), editorialUrgency: "high" },
      }),
      db.seoOpportunity.count({
        where: { ...workspaceWhere(workspaceId), status: "new" },
      }),
    ]);
    const inventoryCount = inventory.count;

    const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
    if (page > pageCount) {
      page = pageCount;
    }
    const skip = (page - 1) * pageSize;

    const opportunities = await db.seoOpportunity.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
    });

    const activeDomains = customThemes
      .filter((themeRow) => themeRow.active)
      .map(customThemeToDomain);

    // Sérialisation explicite : garantit un corps JSON même si un champ Date/JSON est atypique.
    const payload = {
      opportunities,
      lastSearch,
      runningSearch,
      inventoryCount,
      cmsProvider: workspace.cmsProvider,
      defaultLanguage: workspace.defaultLanguage,
      googleDataAvailable: await (
        await import("@/lib/seo/gsc-signals")
      ).workspaceHasGscData(workspace.id),
      inventorySourceNote:
        workspace.cmsProvider === "webflow"
          ? "Inventaire Webflow local (brouillons et publiés). Search Console optionnelle si une propriété dédiée est configurée — jamais l’inventaire WordPress."
          : "Inventaire WordPress local. Search Console peut enrichir les signaux lorsque des données sont synchronisées.",
      recentRuns,
      customThemes,
      savedConfigs,
      defaultQuotas: defaultDomainQuotas(activeDomains),
      // Pagination (rétrocompat : champs additionnels, liste toujours présente).
      total,
      page,
      pageSize,
      pageCount,
      summaryCounts: {
        detected: detectedCount,
        highPriority: highPriorityCount,
        toHandle: toHandleCount,
      },
    };

    return new NextResponse(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    const message =
      error instanceof Error
        ? error.message.slice(0, 300)
        : "Impossible de charger les opportunités.";
    return NextResponse.json(
      {
        error: `Chargement des opportunités impossible : ${message}`,
        opportunities: [],
        customThemes: [],
        total: 0,
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        pageCount: 1,
        summaryCounts: { detected: 0, highPriority: 0, toHandle: 0 },
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  let workspaceId: string;
  try {
    const workspace = await resolveActiveWorkspace();
    assertModuleAllowedForWorkspace(workspace, "opportunities");
    workspaceId = workspace.id;
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    throw error;
  }

  const paidLimit = assertPaidRouteAllowed({
    workspaceId,
    routeKey: "opportunities-search",
  });
  if (!paidLimit.allowed) {
    const denied = paidRouteTooManyRequestsResponse(paidLimit);
    return NextResponse.json(denied.body, {
      status: denied.status,
      headers: denied.headers,
    });
  }

  const existing = await db.opportunitySearchRun.findFirst({
    where: { ...workspaceWhere(workspaceId), status: "running" },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Une recherche est déjà en cours.", run: existing },
      { status: 409 }
    );
  }

  const inventory = await countWorkspaceInventoryForOpportunities(workspaceId);
  if (inventory.count === 0) {
    const emptyMessage =
      inventory.cmsProvider === "webflow"
        ? "Inventaire Webflow vide. Synchronisez la collection CMS de cet espace avant de rechercher."
        : "Inventaire WordPress vide. Synchronisez WordPress avant de rechercher.";
    return NextResponse.json({ error: emptyMessage }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  // Compat Phase 1.1 : { quotas } seul
  if (body.quotas && !body.mode) {
    body = {
      mode: "domains",
      researchGoal: "seo",
      domains: Object.entries(body.quotas as Record<string, number>).map(
        ([domainId, quota]) => ({
          domainId,
          enabled: Number(quota) > 0,
          quota: Number(quota),
        })
      ),
    };
  }

  const mode =
    body.mode === "free"
      ? "free"
      : body.mode === "domains" || !body.mode
        ? "domains"
        : null;
  if (!mode) {
    return NextResponse.json(
      { error: "Mode de recherche invalide (domains | free)." },
      { status: 400 }
    );
  }

  let catalogForValidation:
    | Awaited<ReturnType<typeof loadEditorialCatalogForSearch>>["active"]
    | undefined;

  if (mode === "domains") {
    try {
      const loaded = await loadEditorialCatalogForSearch({
        ensureIfEmpty: true,
        workspaceId,
      });
      catalogForValidation = requireActiveThemesForDomainsSearch(
        loaded.active
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Catalogue de thématiques SEO indisponible.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (!body.mode) {
      const defaults = defaultDomainQuotas(catalogForValidation);
      body = {
        mode: "domains",
        researchGoal: "seo",
        domains: Object.entries(defaults).map(([domainId, quota]) => ({
          domainId,
          enabled: true,
          quota,
        })),
      };
    }
  }

  const validated = validateResearchConfiguration(body, {
    catalog: catalogForValidation,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const config = validated.value;

  if (config.configId) {
    const ownedConfig = await db.researchConfig.findFirst({
      where: { id: config.configId, ...workspaceWhere(workspaceId) },
      select: { id: true },
    });
    if (!ownedConfig) {
      return NextResponse.json(
        { error: "Configuration de recherche introuvable." },
        { status: 404 }
      );
    }
  }
  if (config.customThemeId) {
    const ownedTheme = await db.customTheme.findFirst({
      where: { id: config.customThemeId, ...workspaceWhere(workspaceId) },
      select: { id: true },
    });
    if (!ownedTheme) {
      return NextResponse.json(
        { error: "Thématique introuvable." },
        { status: 404 }
      );
    }
  }

  const snapshot = JSON.parse(
    JSON.stringify(snapshotFromValidated(config))
  ) as Prisma.InputJsonValue;

  const run = await db.opportunitySearchRun.create({
    data: {
      workspaceId,
      status: "running",
      themes: snapshot,
      mode: config.mode,
      researchGoal: config.researchGoal,
      customTopic: config.customTopic,
      researchInstructions: config.researchInstructions,
      requestedCount: config.requestedCount,
      configSnapshot: snapshot,
      configId: config.configId,
      customThemeId: config.customThemeId,
    },
  });

  enqueueOpportunitySearch(run.id, config);

  return NextResponse.json({ run }, { status: 202 });
}
