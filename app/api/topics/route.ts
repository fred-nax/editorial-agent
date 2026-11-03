import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const MAX_SUBJECT_LENGTH = 500;

function parseJsonBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Corps JSON invalide.");
  }
  return value as Record<string, unknown>;
}

function parseSubject(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Le sujet est obligatoire.");
  }

  const subject = value.trim();

  if (!subject) {
    throw new Error("Le sujet est obligatoire.");
  }

  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw new Error(`Le sujet ne peut pas dépasser ${MAX_SUBJECT_LENGTH} caractères.`);
  }

  return subject;
}

export async function GET() {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const topics = await db.topic.findMany({
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json({ topics });
}

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  try {
    const body = parseJsonBody(await request.json());
    const subject = parseSubject(body.subject);

    const topic = await db.topic.create({
      data: {
        subject,
        status: "pending",
      },
    });

    return NextResponse.json({ topic }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Impossible de créer le sujet.";
    const status = message === "Corps JSON invalide." || message.includes("sujet") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
