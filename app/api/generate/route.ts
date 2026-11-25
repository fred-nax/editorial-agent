import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  editorialContextFromTopic,
  parseEditorialContext,
} from "@/lib/editorial-context";
import {
  createQueuedGeneration,
  enqueueArticleGeneration,
  parseSubject,
} from "@/lib/generation";
import { recoverStaleGenerations } from "@/lib/generation-recovery";
import { recoverFeaturedImageJobs } from "@/lib/images/pipeline";
import { parseFeaturedImageRequest } from "@/lib/images/request";
import { resolveEditorialAgentForDestination } from "@/lib/agent/registry";
import { parseCmsDestinationInput } from "@/lib/cms";
import { getWebflowGenerationReadiness } from "@/lib/webflow/readiness";
import { requireAuth } from "@/lib/require-auth";
import {
  assertGenerationWorkspaceConsistency,
  assertModuleAllowedForWorkspace,
  assertRequestWorkspaceMatchesActive,
  resolveActiveWorkspace,
  WorkspaceContextError,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function parseJsonBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Corps JSON invalide.");
  }
  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  await recoverStaleGenerations();
  await recoverFeaturedImageJobs();

  try {
    const workspace = await resolveActiveWorkspace();
    assertRequestWorkspaceMatchesActive(request, workspace);
    assertModuleAllowedForWorkspace(workspace, "generation");

    const body = parseJsonBody(await request.json());
    const topicId =
      typeof body.topicId === "string" && body.topicId.trim()
        ? body.topicId.trim()
        : undefined;
    const featuredImageRequest = parseFeaturedImageRequest(body);

    // Destination imposée par l’espace actif (pas de choix libre croisé).
    const destinationParsed = parseCmsDestinationInput(workspace.cmsProvider);
    if (!destinationParsed.ok) {
      return NextResponse.json(
        { error: destinationParsed.error },
        { status: 400 }
      );
    }

    assertGenerationWorkspaceConsistency({
      workspaceCmsProvider: workspace.cmsProvider,
      cmsDestination: destinationParsed.destination,
    });

    if (destinationParsed.destination === "webflow") {
      const readiness = await getWebflowGenerationReadiness();
      if (!readiness.ok) {
        return NextResponse.json(
          {
            error: `Webflow non prêt : ${readiness.reasons.join(" ")}`,
            reasons: readiness.reasons,
          },
          { status: 400 }
        );
      }
      // V7.13.0 : image à la une autorisée pour Webflow (génération locale ; transfert séparé).
    }

    try {
      await resolveEditorialAgentForDestination(destinationParsed.destination);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Agent éditorial indisponible pour cette destination.",
        },
        { status: 400 }
      );
    }

    let subject: string;
    let resolvedTopicId: string | undefined;
    let editorialContext = parseEditorialContext(body);

    if (topicId) {
      const claimed = await db.topic.updateMany({
        where: {
          id: topicId,
          workspaceId: workspace.id,
          status: "pending",
        },
        data: { status: "generating" },
      });

      if (claimed.count !== 1) {
        return NextResponse.json(
          { error: "Ce sujet ne peut pas être généré pour le moment." },
          { status: 409 }
        );
      }

      const topic = await db.topic.findFirst({
        where: { id: topicId, workspaceId: workspace.id },
      });
      if (!topic) {
        return NextResponse.json({ error: "Sujet introuvable." }, { status: 404 });
      }

      subject = topic.subject;
      resolvedTopicId = topic.id;
      // Depuis la file : réutiliser angle/notes/refs du sujet si le client n'envoie rien.
      if (!editorialContext) {
        editorialContext = editorialContextFromTopic(topic);
      } else {
        const needsWebflowMerge =
          !editorialContext.webflowCategoryItemId &&
          !editorialContext.webflowAuthorItemId;
        const needsWpMerge =
          !editorialContext.wpCategorizationMode &&
          !(editorialContext.wpCategoryIds && editorialContext.wpCategoryIds.length > 0) &&
          editorialContext.wpAuthorId == null;
        if (needsWebflowMerge || needsWpMerge) {
          const fromTopic = editorialContextFromTopic(topic);
          editorialContext = {
            ...editorialContext,
            webflowCategoryItemId:
              editorialContext.webflowCategoryItemId ??
              fromTopic?.webflowCategoryItemId ??
              null,
            webflowAuthorItemId:
              editorialContext.webflowAuthorItemId ??
              fromTopic?.webflowAuthorItemId ??
              null,
            wpCategorizationMode:
              editorialContext.wpCategorizationMode ??
              fromTopic?.wpCategorizationMode ??
              null,
            wpCategoryIds:
              editorialContext.wpCategoryIds ??
              fromTopic?.wpCategoryIds ??
              null,
            wpAuthorId:
              editorialContext.wpAuthorId ?? fromTopic?.wpAuthorId ?? null,
          };
        }
      }
    } else {
      subject = parseSubject(body.subject);
    }

    const generation = await createQueuedGeneration({
      subject,
      workspaceId: workspace.id,
      topicId: resolvedTopicId,
      editorialContext,
      featuredImageRequest,
      cmsDestination: destinationParsed.destination,
    });

    enqueueArticleGeneration(generation.id);

    return NextResponse.json(
      {
        id: generation.id,
        status: generation.status,
        progressStage: generation.progressStage,
        progressMessage: generation.progressMessage,
        progressUpdatedAt: generation.progressUpdatedAt,
        createdAt: generation.createdAt,
        featuredImageRequested: Boolean(featuredImageRequest?.enabled),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    const message =
      error instanceof Error ? error.message : "Impossible de lancer la génération.";
    const status =
      message === "Corps JSON invalide." ||
      message.includes("sujet") ||
      message.includes("caractères") ||
      message.includes("non reconnu") ||
      message.includes("invalide") ||
      message.includes("image") ||
      message.includes("style") ||
      message.includes("format") ||
      message.includes("instructions") ||
      message.includes("espace")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
