import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import {
  buildCategoryHierarchyLabel,
  listSelectableWordPressReferences,
  syncWordPressCmsReferences,
} from "@/lib/wordpress/references-sync";
import { loadWordPressReferenceDefaults } from "@/lib/wordpress/references-validate";
import { normalizeWpOrigin } from "@/lib/settings/wp-url";
import { resolveWordPressConfig } from "@/lib/settings/app-settings";
import {
  assertModuleAllowedForWorkspace,
  assertRequestWorkspaceMatchesActive,
  assertWordPressOnlyModule,
  loadWorkspaceCmsSettings,
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

async function resolveWpWorkspace(request: Request) {
  const workspace = await resolveActiveWorkspace();
  assertRequestWorkspaceMatchesActive(request, workspace);
  assertWordPressOnlyModule(workspace.cmsProvider);
  assertModuleAllowedForWorkspace(workspace, "inventory");
  return workspace;
}

export async function GET(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  let workspace: Awaited<ReturnType<typeof resolveWpWorkspace>>;
  try {
    workspace = await resolveWpWorkspace(request);
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    throw error;
  }

  const defaults = await loadWordPressReferenceDefaults(workspace.id);
  const settings = await loadWorkspaceCmsSettings(workspace);
  const wp = await resolveWordPressConfig();
  const siteOrigin = wp
    ? normalizeWpOrigin(wp.url)
    : settings.wpCategoriesOrigin;

  const categoryRows = await listSelectableWordPressReferences({
    workspaceId: workspace.id,
    kind: "category",
    siteOrigin,
  });
  const authorRows = await listSelectableWordPressReferences({
    workspaceId: workspace.id,
    kind: "author",
    siteOrigin,
  });

  const hierarchySource = categoryRows.map((row) => ({
    wpId: row.wpId,
    name: row.name,
    parentWpId: row.parentWpId,
  }));

  const categories = categoryRows.map((row) => ({
    id: row.wpId,
    name: row.name,
    slug: row.slug,
    parent: row.parentWpId,
    count: row.count,
    label: buildCategoryHierarchyLabel(hierarchySource, row.wpId),
  }));

  // Auteurs sélectionnables : tous si can_assign, sinon seulement API.
  const authors =
    defaults.authorCapability === "can_assign"
      ? authorRows.map((row) => ({
          id: row.wpId,
          name: row.name,
          slug: row.slug,
        }))
      : authorRows
          .filter(
            (row) =>
              defaults.apiUserId == null || row.wpId === defaults.apiUserId
          )
          .map((row) => ({
            id: row.wpId,
            name: row.name,
            slug: row.slug,
          }));

  return NextResponse.json({
    categories,
    authors,
    defaults: {
      mode: defaults.mode,
      categoryIds: defaults.manualDefaultCategoryIds,
      authorId: defaults.defaultAuthorId,
      apiUserId: defaults.apiUserId,
      apiUserName: defaults.apiUserName,
    },
    authorCapability: defaults.authorCapability,
    authorMessage:
      defaults.authorCapability === "can_assign"
        ? "Sélection d’un autre auteur possible selon les permissions WordPress."
        : defaults.authorCapability === "self_only" ||
            defaults.authorCapability === "can_list_authors"
          ? "Le compte API (rôle Auteur) est conservé : attribution à un autre auteur désactivée."
          : "État des permissions auteur inconnu — compte API conservé.",
    syncedAt: defaults.syncedAt,
    authorsSyncedAt: defaults.authorsSyncedAt,
    siteOrigin,
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

  let workspace: Awaited<ReturnType<typeof resolveWpWorkspace>>;
  try {
    workspace = await resolveWpWorkspace(request);
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    throw error;
  }

  const result = await syncWordPressCmsReferences({
    workspaceId: workspace.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.issues[0] ?? "Synchronisation impossible.", ...result },
      { status: 400 }
    );
  }

  return NextResponse.json(result);
}
