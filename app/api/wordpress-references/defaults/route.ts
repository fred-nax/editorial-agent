import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { APP_SETTINGS_ID } from "@/lib/settings/app-settings-id";
import { normalizeWpOrigin } from "@/lib/settings/wp-url";
import { resolveWordPressConfig } from "@/lib/settings/app-settings";
import {
  normalizeWpCategorizationMode,
  parseWpCategoryIdsJson,
  serializeWpCategoryIds,
} from "@/lib/wordpress/references-types";
import { validateWordPressReferenceSelection } from "@/lib/wordpress/references-validate";
import {
  assertModuleAllowedForWorkspace,
  assertRequestWorkspaceMatchesActive,
  assertWordPressOnlyModule,
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
    assertWordPressOnlyModule(workspace.cmsProvider);
    assertModuleAllowedForWorkspace(workspace, "inventory");

    const body = (await request.json()) as Record<string, unknown>;
    const wp = await resolveWordPressConfig();
    if (!wp) {
      return NextResponse.json(
        { error: "WordPress non configuré." },
        { status: 400 }
      );
    }
    const siteOrigin = normalizeWpOrigin(wp.url);

    const mode =
      body.mode !== undefined
        ? normalizeWpCategorizationMode(
            typeof body.mode === "string" ? body.mode : null
          )
        : undefined;

    let manualDefaultCategoryIds: number[] | undefined;
    if (body.categoryIds !== undefined) {
      if (body.categoryIds === null) {
        manualDefaultCategoryIds = [];
      } else if (!Array.isArray(body.categoryIds)) {
        return NextResponse.json(
          { error: "Liste de catégories invalide." },
          { status: 400 }
        );
      } else {
        manualDefaultCategoryIds = body.categoryIds.map((v) => Number(v));
      }
    }

    let defaultAuthorId: number | null | undefined;
    if (body.authorId !== undefined) {
      if (body.authorId === null || body.authorId === "") {
        defaultAuthorId = null;
      } else {
        const id = Number(body.authorId);
        if (!Number.isInteger(id) || id <= 0) {
          return NextResponse.json(
            { error: "Identifiant auteur invalide." },
            { status: 400 }
          );
        }
        defaultAuthorId = id;
      }
    }

    const settingsRow = await db.workspaceCmsSettings.findUnique({
      where: { workspaceId: workspace.id },
      select: {
        wpAuthorCapability: true,
        wpApiUserId: true,
        wpCategorizationMode: true,
        wpManualDefaultCategoryIds: true,
        wpDefaultAuthorId: true,
      },
    });

    const effectiveMode =
      mode ??
      normalizeWpCategorizationMode(settingsRow?.wpCategorizationMode);
    const effectiveCats =
      manualDefaultCategoryIds ??
      parseWpCategoryIdsJson(settingsRow?.wpManualDefaultCategoryIds);
    const effectiveAuthor =
      defaultAuthorId !== undefined
        ? defaultAuthorId
        : settingsRow?.wpDefaultAuthorId ?? null;

    // Valide les IDs non nuls contre le catalogue synchronisé.
    if (effectiveCats.length > 0 || effectiveAuthor != null) {
      await validateWordPressReferenceSelection({
        workspaceId: workspace.id,
        siteOrigin,
        mode: effectiveMode === "manual" ? "manual" : "automatic",
        categoryIds: effectiveMode === "manual" ? effectiveCats : [],
        authorId: effectiveAuthor,
        authorCapability:
          settingsRow?.wpAuthorCapability === "can_assign" ||
          settingsRow?.wpAuthorCapability === "self_only" ||
          settingsRow?.wpAuthorCapability === "can_list_authors" ||
          settingsRow?.wpAuthorCapability === "unknown"
            ? settingsRow.wpAuthorCapability
            : "unknown",
        apiUserId: settingsRow?.wpApiUserId ?? null,
        allowEmptyManualCategories: true,
      });
    }

    const updateData = {
      ...(mode !== undefined ? { wpCategorizationMode: mode } : {}),
      ...(manualDefaultCategoryIds !== undefined
        ? {
            wpManualDefaultCategoryIds: serializeWpCategoryIds(
              manualDefaultCategoryIds
            ),
          }
        : {}),
      ...(defaultAuthorId !== undefined
        ? { wpDefaultAuthorId: defaultAuthorId }
        : {}),
    };

    await db.workspaceCmsSettings.upsert({
      where: { workspaceId: workspace.id },
      create: {
        workspaceId: workspace.id,
        wpCategorizationMode: mode ?? "automatic",
        wpManualDefaultCategoryIds:
          manualDefaultCategoryIds !== undefined
            ? serializeWpCategoryIds(manualDefaultCategoryIds)
            : null,
        wpDefaultAuthorId:
          defaultAuthorId !== undefined ? defaultAuthorId : null,
      },
      update: updateData,
    });

    await db.appSettings.update({
      where: { id: APP_SETTINGS_ID },
      data: updateData,
    });

    return NextResponse.json({
      ok: true,
      mode: effectiveMode,
      categoryIds: effectiveCats,
      authorId: effectiveAuthor,
    });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    const message =
      error instanceof Error ? error.message : "Enregistrement impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
