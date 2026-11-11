import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { decideTopicDeletion } from "@/lib/topics/delete";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const MAX_SUBJECT_LENGTH = 500;
const MAX_TEXT_LENGTH = 2000;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseJsonBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Corps JSON invalide.");
  }
  return value as Record<string, unknown>;
}

function parseOptionalText(
  value: unknown,
  field: string,
  maxLength = MAX_TEXT_LENGTH
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`Le champ ${field} est invalide.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`Le champ ${field} est trop long.`);
  }
  return trimmed.length > 0 ? trimmed : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  try {
    const { id } = await context.params;
    const existing = await db.topic.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: "Sujet introuvable." }, { status: 404 });
    }

    const body = parseJsonBody(await request.json());
    const data: {
      subject?: string;
      priority?: number;
      notes?: string | null;
      category?: string | null;
      angle?: string | null;
      status?: "archived";
    } = {};

    if (body.status !== undefined) {
      if (body.status !== "archived") {
        return NextResponse.json(
          { error: "Seul le statut archived est autorisé pour le moment." },
          { status: 400 }
        );
      }
      if (existing.status === "generating") {
        return NextResponse.json(
          { error: "Impossible d’archiver un sujet en cours de génération." },
          { status: 409 }
        );
      }
      data.status = "archived";
    }

    const wantsFieldUpdate =
      body.subject !== undefined ||
      body.priority !== undefined ||
      body.notes !== undefined ||
      body.category !== undefined ||
      body.angle !== undefined;

    if (wantsFieldUpdate && existing.status !== "pending") {
      return NextResponse.json(
        { error: "Seul un sujet en attente peut être modifié." },
        { status: 409 }
      );
    }

    if (body.subject !== undefined) {
      if (typeof body.subject !== "string" || !body.subject.trim()) {
        return NextResponse.json(
          { error: "Le sujet est obligatoire." },
          { status: 400 }
        );
      }
      const subject = body.subject.trim();
      if (subject.length > MAX_SUBJECT_LENGTH) {
        return NextResponse.json(
          { error: `Le sujet ne peut pas dépasser ${MAX_SUBJECT_LENGTH} caractères.` },
          { status: 400 }
        );
      }
      data.subject = subject;
    }

    if (body.priority !== undefined) {
      if (
        typeof body.priority !== "number" ||
        !Number.isInteger(body.priority) ||
        body.priority < 0 ||
        body.priority > 3
      ) {
        return NextResponse.json(
          { error: "La priorité doit être un entier entre 0 et 3." },
          { status: 400 }
        );
      }
      data.priority = body.priority;
    }

    const notes = parseOptionalText(body.notes, "notes");
    if (notes !== undefined) {
      data.notes = notes;
    }

    const category = parseOptionalText(body.category, "category", 120);
    if (category !== undefined) {
      data.category = category;
    }

    const angle = parseOptionalText(body.angle, "angle", 240);
    if (angle !== undefined) {
      data.angle = angle;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Aucune modification fournie." },
        { status: 400 }
      );
    }

    const topic = await db.topic.update({
      where: { id },
      data,
    });

    return NextResponse.json({ topic });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Impossible de mettre à jour le sujet.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const { id } = await context.params;
  const existing = await db.topic.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json({ error: "Sujet introuvable." }, { status: 404 });
  }

  const linkedGenerationCount = await db.articleGeneration.count({
    where: { topicId: id },
  });

  const decision = decideTopicDeletion({
    status: existing.status,
    linkedGenerationCount,
  });

  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.error },
      { status: decision.status }
    );
  }

  // Suppression du sujet uniquement — aucune cascade vers ArticleGeneration / WordPress.
  await db.topic.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
