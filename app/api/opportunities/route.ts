import { NextResponse } from "next/server";
import {
  Prisma,
  type EditorialUrgency,
  type OpportunityContentType,
  type OpportunityStatus,
  type TrendType,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { defaultDomainQuotas } from "@/lib/seo/domains";
import { enqueueOpportunitySearch } from "@/lib/seo/opportunity-search";
import {
  snapshotFromValidated,
  validateResearchConfiguration,
} from "@/lib/seo/research-config";
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

export async function GET(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const { searchParams } = new URL(request.url);
  const theme = searchParams.get("theme")?.trim() || undefined;
  const status = searchParams.get("status")?.trim() || undefined;
  const contentType = searchParams.get("contentType")?.trim() || undefined;
  const runId = searchParams.get("runId")?.trim() || undefined;
  const trendTypeParam = searchParams.get("trendType")?.trim() || undefined;
  const urgencyParam = searchParams.get("urgency")?.trim() || undefined;

  const where: {
    theme?: string;
    status?: OpportunityStatus;
    contentType?: OpportunityContentType;
    searchRunId?: string;
    trendType?: TrendType;
    editorialUrgency?: EditorialUrgency;
  } = {};

  if (theme) {
    where.theme = theme;
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

  const [
    opportunities,
    lastSearch,
    runningSearch,
    inventoryCount,
    recentRuns,
    customThemes,
    savedConfigs,
  ] = await Promise.all([
    db.seoOpportunity.findMany({
      where,
      orderBy: [{ scoreTotal: "desc" }, { createdAt: "desc" }],
      take: 150,
    }),
    db.opportunitySearchRun.findFirst({
      orderBy: { startedAt: "desc" },
    }),
    db.opportunitySearchRun.findFirst({
      where: { status: "running" },
      orderBy: { startedAt: "desc" },
    }),
    db.wordPressPost.count(),
    db.opportunitySearchRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
    db.customTheme.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
    db.researchConfig.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ]);

  return NextResponse.json({
    opportunities,
    lastSearch,
    runningSearch,
    inventoryCount,
    recentRuns,
    customThemes,
    savedConfigs,
    defaultQuotas: defaultDomainQuotas(),
  });
}

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const existing = await db.opportunitySearchRun.findFirst({
    where: { status: "running" },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Une recherche est déjà en cours.", run: existing },
      { status: 409 }
    );
  }

  const inventoryCount = await db.wordPressPost.count();
  if (inventoryCount === 0) {
    return NextResponse.json(
      {
        error:
          "Inventaire WordPress vide. Synchronisez WordPress avant de rechercher.",
      },
      { status: 400 }
    );
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

  if (!body.mode) {
    body = {
      mode: "domains",
      researchGoal: "seo",
      domains: Object.entries(defaultDomainQuotas()).map(([domainId, quota]) => ({
        domainId,
        enabled: true,
        quota,
      })),
    };
  }

  const validated = validateResearchConfiguration(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const config = validated.value;
  const snapshot = JSON.parse(
    JSON.stringify(snapshotFromValidated(config))
  ) as Prisma.InputJsonValue;

  const run = await db.opportunitySearchRun.create({
    data: {
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
