import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { createWebflowClient } from "@/lib/webflow/client";
import { WebflowApiError } from "@/lib/webflow/errors";
import {
  patchWebflowDraftItemReferences,
  readReferenceIdsFromItem,
} from "@/lib/webflow/references-update";
import {
  resolveWebflowReferenceLabels,
  validateWebflowReferenceSelection,
} from "@/lib/webflow/references-validate";
import { resolveWebflowInventoryConfig } from "@/lib/webflow/inventory-config";
import { fetchWebflowCollectionItem } from "@/lib/webflow/featured-image-attach";
import type { WebflowFieldMapping } from "@/lib/webflow/types";
import {
  assertModuleAllowedForWorkspace,
  assertRequestWorkspaceMatchesActive,
  assertWebflowOnlyModule,
  loadGenerationInActiveWorkspace,
  resolveActiveWorkspace,
  WorkspaceContextError,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  try {
    const { id } = await context.params;
    const workspace = await resolveActiveWorkspace();
    assertRequestWorkspaceMatchesActive(request, workspace);
    assertWebflowOnlyModule(workspace.cmsProvider);
    assertModuleAllowedForWorkspace(workspace, "history");
    const { generation } = await loadGenerationInActiveWorkspace(id);
    if (!generation) {
      return NextResponse.json({ error: "Génération introuvable." }, { status: 404 });
    }

    if ((generation.cmsDestination ?? "wordpress") !== "webflow") {
      return NextResponse.json(
        { error: "Cette génération n’est pas destinée à Webflow." },
        { status: 400 }
      );
    }

    const externalId = generation.cmsExternalId?.trim();
    if (!externalId) {
      return NextResponse.json(
        { error: "Aucun item CMS Webflow associé." },
        { status: 404 }
      );
    }

    const config = await resolveWebflowInventoryConfig(workspace);
    const mapping = (config.fieldMapping ?? {}) as WebflowFieldMapping;
    const client = createWebflowClient({ apiToken: config.apiToken });
    const item = await fetchWebflowCollectionItem(
      client,
      config.collectionId,
      externalId
    );
    const remote = readReferenceIdsFromItem(item, mapping);
    const labels = await resolveWebflowReferenceLabels({
      workspaceId: workspace.id,
      categoryItemId: remote.categoryItemId,
      authorItemId: remote.authorItemId,
    });

    return NextResponse.json({
      itemId: externalId,
      isDraft: item.isDraft === true,
      isArchived: item.isArchived === true,
      categoryItemId: remote.categoryItemId,
      authorItemId: remote.authorItemId,
      category: labels.category,
      author: labels.author,
      siteId: config.siteId,
      collectionId: config.collectionId,
    });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    if (error instanceof WebflowApiError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status ?? 400 }
      );
    }
    const message =
      error instanceof Error ? error.message : "Lecture des références impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  try {
    const { id } = await context.params;
    const workspace = await resolveActiveWorkspace();
    assertRequestWorkspaceMatchesActive(request, workspace);
    assertWebflowOnlyModule(workspace.cmsProvider);
    assertModuleAllowedForWorkspace(workspace, "history");
    const { generation } = await loadGenerationInActiveWorkspace(id);
    if (!generation) {
      return NextResponse.json({ error: "Génération introuvable." }, { status: 404 });
    }

    if ((generation.cmsDestination ?? "wordpress") !== "webflow") {
      return NextResponse.json(
        { error: "Cette génération n’est pas destinée à Webflow." },
        { status: 400 }
      );
    }
    if (generation.status !== "completed") {
      return NextResponse.json(
        { error: "Seule une génération terminée peut être mise à jour." },
        { status: 409 }
      );
    }

    const externalId = generation.cmsExternalId?.trim();
    if (!externalId) {
      return NextResponse.json(
        { error: "Aucun item CMS Webflow associé." },
        { status: 404 }
      );
    }

    const body = (await request.json()) as {
      categoryItemId?: string | null;
      authorItemId?: string | null;
    };

    if (body.categoryItemId === undefined && body.authorItemId === undefined) {
      return NextResponse.json(
        { error: "Aucune référence fournie." },
        { status: 400 }
      );
    }

    const config = await resolveWebflowInventoryConfig(workspace);
    const mapping = (config.fieldMapping ?? {}) as WebflowFieldMapping;

    const categoryItemId =
      body.categoryItemId === undefined
        ? undefined
        : body.categoryItemId === null || body.categoryItemId === ""
          ? null
          : String(body.categoryItemId).trim();
    const authorItemId =
      body.authorItemId === undefined
        ? undefined
        : body.authorItemId === null || body.authorItemId === ""
          ? null
          : String(body.authorItemId).trim();

    await validateWebflowReferenceSelection({
      workspaceId: workspace.id,
      mapping,
      categoryItemId: categoryItemId ?? null,
      authorItemId: authorItemId ?? null,
    });

    const client = createWebflowClient({ apiToken: config.apiToken });
    const updated = await patchWebflowDraftItemReferences({
      client,
      collectionId: config.collectionId,
      itemId: externalId,
      mapping,
      categoryItemId,
      authorItemId,
    });

    const remote = readReferenceIdsFromItem(updated, mapping);

    // Réconciliation inventaire local (categoryRef / authorRef).
    await db.webflowCmsItem.updateMany({
      where: {
        workspaceId: workspace.id,
        webflowItemId: externalId,
      },
      data: {
        ...(remote.categoryItemId !== undefined
          ? { categoryRef: remote.categoryItemId }
          : {}),
        ...(remote.authorItemId !== undefined
          ? { authorRef: remote.authorItemId }
          : {}),
        syncedAt: new Date(),
      },
    });

    const labels = await resolveWebflowReferenceLabels({
      workspaceId: workspace.id,
      categoryItemId: remote.categoryItemId,
      authorItemId: remote.authorItemId,
    });

    return NextResponse.json({
      ok: true,
      itemId: externalId,
      categoryItemId: remote.categoryItemId,
      authorItemId: remote.authorItemId,
      category: labels.category,
      author: labels.author,
    });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    if (error instanceof WebflowApiError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status ?? 400 }
      );
    }
    const message =
      error instanceof Error
        ? error.message
        : "Mise à jour des références impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
