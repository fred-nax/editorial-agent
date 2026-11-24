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
import { parseCmsDestinationInput } from "@/lib/cms";
import { requireAuth } from "@/lib/require-auth";

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
    const body = parseJsonBody(await request.json());
    const topicId =
      typeof body.topicId === "string" && body.topicId.trim()
        ? body.topicId.trim()
        : undefined;
    const featuredImageRequest = parseFeaturedImageRequest(body);
    const destinationParsed = parseCmsDestinationInput(body.cmsDestination);
    if (!destinationParsed.ok) {
      return NextResponse.json(
        { error: destinationParsed.error },
        { status: 400 }
      );
    }

    let subject: string;
    let resolvedTopicId: string | undefined;
    let editorialContext = parseEditorialContext(body);

    if (topicId) {
      const claimed = await db.topic.updateMany({
        where: { id: topicId, status: "pending" },
        data: { status: "generating" },
      });

      if (claimed.count !== 1) {
        return NextResponse.json(
          { error: "Ce sujet ne peut pas être généré pour le moment." },
          { status: 409 }
        );
      }

      const topic = await db.topic.findUnique({ where: { id: topicId } });
      if (!topic) {
        return NextResponse.json({ error: "Sujet introuvable." }, { status: 404 });
      }

      subject = topic.subject;
      resolvedTopicId = topic.id;
      // Depuis la file : réutiliser angle/notes du sujet si le client n'envoie rien.
      if (!editorialContext) {
        editorialContext = editorialContextFromTopic(topic);
      }
    } else {
      subject = parseSubject(body.subject);
    }

    const generation = await createQueuedGeneration({
      subject,
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
      message.includes("instructions")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
