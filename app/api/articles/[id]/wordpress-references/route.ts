import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { resolveWordPressConfig } from "@/lib/settings/app-settings";
import { normalizeWpOrigin } from "@/lib/settings/wp-url";
import {
  fetchWordPressPostForRefs,
  patchWordPressDraftReferences,
  WordPressDraftUpdateError,
} from "@/lib/wordpress/references-update";
import {
  loadWordPressReferenceDefaults,
  resolveWordPressReferenceLabels,
  validateWordPressReferenceSelection,
} from "@/lib/wordpress/references-validate";
import {
  assertModuleAllowedForWorkspace,
  assertRequestWorkspaceMatchesActive,
  assertWordPressOnlyModule,
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
    assertWordPressOnlyModule(workspace.cmsProvider);
    assertModuleAllowedForWorkspace(workspace, "history");
    const { generation } = await loadGenerationInActiveWorkspace(id);
    if (!generation) {
      return NextResponse.json({ error: "Génération introuvable." }, { status: 404 });
    }

    if ((generation.cmsDestination ?? "wordpress") !== "wordpress") {
      return NextResponse.json(
        { error: "Cette génération n’est pas destinée à WordPress." },
        { status: 400 }
      );
    }

    const postId = generation.wpPostId;
    if (!postId) {
      return NextResponse.json(
        { error: "Aucun brouillon WordPress associé." },
        { status: 404 }
      );
    }

    const credentials = await resolveWordPressConfig();
    if (!credentials) {
      return NextResponse.json(
        { error: "WordPress non configuré." },
        { status: 400 }
      );
    }

    const remote = await fetchWordPressPostForRefs(credentials, postId);
    const labels = await resolveWordPressReferenceLabels({
      workspaceId: workspace.id,
      categoryIds: remote.categories,
      authorId: remote.author,
    });

    const editable =
      remote.status === "draft" ||
      remote.status === "auto-draft" ||
      remote.status === "pending";

    return NextResponse.json({
      wpPostId: postId,
      status: remote.status,
      editable,
      categoryIds: remote.categories,
      authorId: remote.author,
      categories: labels.categories,
      author: labels.author,
      link: remote.link,
    });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    if (error instanceof WordPressDraftUpdateError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
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
    assertWordPressOnlyModule(workspace.cmsProvider);
    assertModuleAllowedForWorkspace(workspace, "history");
    const { generation } = await loadGenerationInActiveWorkspace(id);
    if (!generation) {
      return NextResponse.json({ error: "Génération introuvable." }, { status: 404 });
    }

    if (generation.status !== "completed") {
      return NextResponse.json(
        { error: "La génération doit être terminée." },
        { status: 409 }
      );
    }

    if ((generation.cmsDestination ?? "wordpress") !== "wordpress") {
      return NextResponse.json(
        { error: "Cette génération n’est pas destinée à WordPress." },
        { status: 400 }
      );
    }

    const postId = generation.wpPostId;
    if (!postId) {
      return NextResponse.json(
        { error: "Aucun brouillon WordPress associé." },
        { status: 404 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const hasCategories = body.categoryIds !== undefined;
    const hasAuthor = body.authorId !== undefined;
    if (!hasCategories && !hasAuthor) {
      return NextResponse.json(
        { error: "Aucune référence à modifier." },
        { status: 400 }
      );
    }

    const credentials = await resolveWordPressConfig();
    if (!credentials) {
      return NextResponse.json(
        { error: "WordPress non configuré." },
        { status: 400 }
      );
    }
    const siteOrigin = normalizeWpOrigin(credentials.url);
    const defaults = await loadWordPressReferenceDefaults(workspace.id);

    let categoryIds: number[] | undefined;
    if (hasCategories) {
      if (body.categoryIds === null) {
        categoryIds = [];
      } else if (!Array.isArray(body.categoryIds)) {
        return NextResponse.json(
          { error: "Liste de catégories invalide." },
          { status: 400 }
        );
      } else {
        categoryIds = body.categoryIds.map((v) => Number(v));
      }
    }

    let authorId: number | null | undefined;
    if (hasAuthor) {
      if (body.authorId === null || body.authorId === "") {
        authorId = defaults.apiUserId;
      } else {
        const parsed = Number(body.authorId);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          return NextResponse.json(
            { error: "Identifiant auteur invalide." },
            { status: 400 }
          );
        }
        authorId = parsed;
      }
    }

    const validated = await validateWordPressReferenceSelection({
      workspaceId: workspace.id,
      siteOrigin,
      mode: "manual",
      categoryIds: categoryIds ?? [],
      authorId: authorId ?? null,
      authorCapability: defaults.authorCapability,
      apiUserId: defaults.apiUserId,
      allowEmptyManualCategories: true,
    });

    const patched = await patchWordPressDraftReferences({
      credentials,
      postId,
      categoryIds: hasCategories ? validated.categoryIds : undefined,
      authorId:
        hasAuthor && validated.injectAuthor && validated.authorId != null
          ? validated.authorId
          : hasAuthor && defaults.apiUserId
            ? defaults.apiUserId
            : undefined,
    });

    // Réconciliation locale (historique) — ne pas échouer si distant OK.
    try {
      const labels = await resolveWordPressReferenceLabels({
        workspaceId: workspace.id,
        categoryIds: patched.categories,
        authorId: patched.author,
      });
      await db.articleGeneration.updateMany({
        where: { id: generation.id, workspaceId: workspace.id },
        data: {
          categories: labels.categories.map((c) => ({
            categoryId: c.id,
            name: c.name,
          })),
          wpStatus: patched.status,
        },
      });

      // Inventaire si présent
      await db.wordPressPost.updateMany({
        where: {
          workspaceId: workspace.id,
          wpPostId: postId,
        },
        data: {
          categories: labels.categories.map((c) => ({
            id: c.id,
            name: c.name,
          })),
        },
      });
    } catch {
      // Distant OK — réconciliation locale différée.
    }

    const labels = await resolveWordPressReferenceLabels({
      workspaceId: workspace.id,
      categoryIds: patched.categories,
      authorId: patched.author,
    });

    return NextResponse.json({
      ok: true,
      wpPostId: postId,
      status: patched.status,
      categoryIds: patched.categories,
      authorId: patched.author,
      categories: labels.categories,
      author: labels.author,
    });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    if (error instanceof WordPressDraftUpdateError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    const message =
      error instanceof Error ? error.message : "Modification impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
