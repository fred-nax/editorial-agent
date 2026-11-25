import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { validateWebflowReferenceSelection } from "@/lib/webflow/references-validate";
import { resolveWebflowInventoryConfig } from "@/lib/webflow/inventory-config";
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

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function PATCH(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  try {
    const workspace = await resolveActiveWorkspace();
    assertRequestWorkspaceMatchesActive(request, workspace);
    assertWebflowOnlyModule(workspace.cmsProvider);
    assertModuleAllowedForWorkspace(workspace, "inventory");

    const body = (await request.json()) as {
      categoryItemId?: string | null;
      authorItemId?: string | null;
    };

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

    // Valide les IDs non nuls (null = effacer le défaut sans validation catalogue).
    if (categoryItemId || authorItemId) {
      await validateWebflowReferenceSelection({
        workspaceId: workspace.id,
        mapping,
        categoryItemId: categoryItemId ?? null,
        authorItemId: authorItemId ?? null,
      });
    }

    const data: {
      webflowDefaultCategoryItemId?: string | null;
      webflowDefaultAuthorItemId?: string | null;
    } = {};
    if (categoryItemId !== undefined) {
      data.webflowDefaultCategoryItemId = categoryItemId;
    }
    if (authorItemId !== undefined) {
      data.webflowDefaultAuthorItemId = authorItemId;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Aucune valeur par défaut fournie." },
        { status: 400 }
      );
    }

    await db.workspaceCmsSettings.update({
      where: { workspaceId: workspace.id },
      data,
    });

    return NextResponse.json({
      ok: true,
      defaults: {
        categoryItemId:
          categoryItemId !== undefined
            ? categoryItemId
            : (
                await db.workspaceCmsSettings.findUnique({
                  where: { workspaceId: workspace.id },
                  select: { webflowDefaultCategoryItemId: true },
                })
              )?.webflowDefaultCategoryItemId ?? null,
        authorItemId:
          authorItemId !== undefined
            ? authorItemId
            : (
                await db.workspaceCmsSettings.findUnique({
                  where: { workspaceId: workspace.id },
                  select: { webflowDefaultAuthorItemId: true },
                })
              )?.webflowDefaultAuthorItemId ?? null,
      },
    });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    const message =
      error instanceof Error
        ? error.message
        : "Impossible d’enregistrer les valeurs par défaut.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
