import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import {
  listThemeCatalog,
  normalizeThemeDescription,
  normalizeThemeName,
  validateThemeAngles,
  validateThemeQuota,
} from "@/lib/seo/theme-catalog";
import {
  resolveActiveWorkspace,
  WorkspaceContextError,
  workspaceWhere,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function workspaceErrorResponse(error: WorkspaceContextError) {
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status }
  );
}

export async function GET(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "1";
  try {
    const workspace = await resolveActiveWorkspace();
    const themes = await listThemeCatalog({
      activeOnly,
      workspaceId: workspace.id,
    });
    return NextResponse.json({ themes });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    throw error;
  }
}

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const name = normalizeThemeName(body.name);
  if (!name) {
    return NextResponse.json(
      { error: "Le nom de la thématique est obligatoire." },
      { status: 400 }
    );
  }

  const description = normalizeThemeDescription(body.description);
  const angles = validateThemeAngles(body.explorationAngles ?? body.angles);
  if (!angles.ok) {
    return NextResponse.json({ error: angles.error }, { status: 400 });
  }

  const quotaInput =
    body.defaultQuota !== undefined ? body.defaultQuota : 5;
  const quota = validateThemeQuota(quotaInput);
  if (!quota.ok) {
    return NextResponse.json({ error: quota.error }, { status: 400 });
  }

  let workspaceId: string;
  try {
    workspaceId = (await resolveActiveWorkspace()).id;
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    throw error;
  }

  const existing = await db.customTheme.findFirst({
    where: {
      ...workspaceWhere(workspaceId),
      name: { equals: name, mode: "insensitive" },
    },
  });
  if (existing) {
    if (body.reactivate === false) {
      return NextResponse.json(
        { error: "Une thématique portant ce nom existe déjà." },
        { status: 409 }
      );
    }
    const reactivated = await db.customTheme.update({
      where: { id: existing.id },
      data: {
        active: true,
        description: description ?? existing.description,
        explorationAngles:
          angles.value.length > 0
            ? angles.value
            : existing.explorationAngles ?? undefined,
        defaultQuota: quota.value,
      },
    });
    return NextResponse.json({ theme: reactivated, reused: true });
  }

  const maxOrder = await db.customTheme.aggregate({
    where: workspaceWhere(workspaceId),
    _max: { sortOrder: true },
  });
  const sortOrder =
    typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
      ? Math.max(0, Math.round(body.sortOrder))
      : (maxOrder._max.sortOrder ?? -1) + 1;

  const theme = await db.customTheme.create({
    data: {
      workspaceId,
      name,
      description,
      active: body.active === false ? false : true,
      explorationAngles: angles.value,
      defaultQuota: quota.value,
      sortOrder,
      naxialisServices: Array.isArray(body.naxialisServices)
        ? body.naxialisServices.filter(
            (item): item is string => typeof item === "string"
          )
        : [],
    },
  });
  return NextResponse.json({ theme }, { status: 201 });
}
