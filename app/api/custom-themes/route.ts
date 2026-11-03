import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const themes = await db.customTheme.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ themes });
}

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  let body: {
    name?: string;
    description?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) {
    return NextResponse.json(
      { error: "Le nom de la thématique est obligatoire." },
      { status: 400 }
    );
  }

  const description =
    typeof body.description === "string"
      ? body.description.trim().slice(0, 500) || null
      : null;

  const existing = await db.customTheme.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    const reactivated = await db.customTheme.update({
      where: { id: existing.id },
      data: {
        active: true,
        description: description ?? existing.description,
      },
    });
    return NextResponse.json({ theme: reactivated, reused: true });
  }

  const theme = await db.customTheme.create({
    data: { name, description, active: true },
  });
  return NextResponse.json({ theme }, { status: 201 });
}
