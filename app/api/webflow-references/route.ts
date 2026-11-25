import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import {
  listSelectableWebflowReferences,
  syncWebflowCmsReferences,
} from "@/lib/webflow/references-sync";
import { loadWebflowReferenceDefaults } from "@/lib/webflow/references-validate";
import { resolveWebflowInventoryConfig } from "@/lib/webflow/inventory-config";
import { createWebflowClient } from "@/lib/webflow/client";
import { discoverWebflowReferenceTargets } from "@/lib/webflow/references-discover";
import type { WebflowFieldMapping } from "@/lib/webflow/types";
import {
  assertModuleAllowedForWorkspace,
  assertRequestWorkspaceMatchesActive,
  assertWebflowOnlyModule,
  resolveActiveWorkspace,
  WorkspaceContextError,
} from "@/lib/workspace";

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

async function resolveWebflowWorkspace(request: Request) {
  const workspace = await resolveActiveWorkspace();
  assertRequestWorkspaceMatchesActive(request, workspace);
  assertWebflowOnlyModule(workspace.cmsProvider);
  assertModuleAllowedForWorkspace(workspace, "inventory");
  return workspace;
}

export async function GET(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  let workspace: Awaited<ReturnType<typeof resolveWebflowWorkspace>>;
  try {
    workspace = await resolveWebflowWorkspace(request);
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    throw error;
  }

  const defaults = await loadWebflowReferenceDefaults(workspace.id);
  const categories = await listSelectableWebflowReferences({
    workspaceId: workspace.id,
    kind: "category",
  });
  const authors = await listSelectableWebflowReferences({
    workspaceId: workspace.id,
    kind: "author",
  });

  let targets: Array<{
    kind: string;
    collectionId: string;
    collectionName: string | null;
    isRequired: boolean;
    fieldSlug: string;
  }> = [];
  let discoveryIssues: string[] = [];

  try {
    const config = await resolveWebflowInventoryConfig(workspace);
    const client = createWebflowClient({ apiToken: config.apiToken });
    const discovery = await discoverWebflowReferenceTargets({
      client,
      siteId: config.siteId,
      blogCollectionId: config.collectionId,
      mapping: (config.fieldMapping ?? {}) as WebflowFieldMapping,
    });
    discoveryIssues = discovery.issues;
    targets = discovery.targets.map((t) => ({
      kind: t.kind,
      collectionId: t.referencedCollectionId,
      collectionName: t.referencedCollectionName,
      isRequired: t.isRequired,
      fieldSlug: t.fieldSlug,
    }));
  } catch (error) {
    discoveryIssues = [
      error instanceof Error
        ? error.message
        : "Impossible de découvrir les collections de référence.",
    ];
  }

  const defaultCategoryLive = defaults.categoryItemId
    ? categories.find((c) => c.webflowItemId === defaults.categoryItemId)
    : null;
  const defaultAuthorLive = defaults.authorItemId
    ? authors.find((a) => a.webflowItemId === defaults.authorItemId)
    : null;

  return NextResponse.json({
    workspaceId: workspace.id,
    syncedAt: defaults.syncedAt,
    categories,
    authors,
    targets,
    issues: discoveryIssues,
    defaults: {
      categoryItemId: defaults.categoryItemId,
      authorItemId: defaults.authorItemId,
      categoryUnavailable: Boolean(
        defaults.categoryItemId && !defaultCategoryLive
      ),
      authorUnavailable: Boolean(defaults.authorItemId && !defaultAuthorLive),
      categoryName: defaultCategoryLive?.name ?? null,
      authorName: defaultAuthorLive?.name ?? null,
    },
    counts: {
      categories: categories.length,
      authors: authors.length,
    },
  });
}

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  let workspace: Awaited<ReturnType<typeof resolveWebflowWorkspace>>;
  try {
    workspace = await resolveWebflowWorkspace(request);
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    throw error;
  }

  const result = await syncWebflowCmsReferences({ workspaceId: workspace.id });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
