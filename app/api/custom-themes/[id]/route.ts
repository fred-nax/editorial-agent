import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import {
  getThemeDependencies,
  normalizeThemeDescription,
  normalizeThemeName,
  syncOpportunityThemeLabel,
  validateThemeAngles,
  validateThemeQuota,
} from "@/lib/seo/theme-catalog";
import {
  resolveActiveWorkspace,
  WorkspaceContextError,
  workspaceWhere,
  type EditorialWorkspaceRecord,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function workspaceErrorResponse(error: WorkspaceContextError) {
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status }
  );
}

type WorkspaceResolution =
  | { ok: true; workspace: EditorialWorkspaceRecord }
  | { ok: false; response: NextResponse };

async function getWorkspaceOrResponse(): Promise<WorkspaceResolution> {
  try {
    return { ok: true, workspace: await resolveActiveWorkspace() };
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return { ok: false, response: workspaceErrorResponse(error) };
    }
    throw error;
  }
}

export async function GET(_request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const resolved = await getWorkspaceOrResponse();
  if (!resolved.ok) {
    return resolved.response;
  }
  const { workspace } = resolved;

  const { id } = await context.params;
  const theme = await db.customTheme.findFirst({
    where: { id, ...workspaceWhere(workspace.id) },
  });
  if (!theme) {
    return NextResponse.json({ error: "Thématique introuvable." }, { status: 404 });
  }
  const dependencies = await getThemeDependencies(id, workspace.id);
  return NextResponse.json({ theme, dependencies });
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const resolved = await getWorkspaceOrResponse();
  if (!resolved.ok) {
    return resolved.response;
  }
  const { workspace } = resolved;

  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const existing = await db.customTheme.findFirst({
    where: { id, ...workspaceWhere(workspace.id) },
  });
  if (!existing) {
    return NextResponse.json({ error: "Thématique introuvable." }, { status: 404 });
  }

  const data: {
    name?: string;
    description?: string | null;
    active?: boolean;
    explorationAngles?: string[];
    defaultQuota?: number;
    sortOrder?: number;
    naxialisServices?: string[];
  } = {};

  if (body.name !== undefined) {
    const name = normalizeThemeName(body.name);
    if (!name) {
      return NextResponse.json({ error: "Nom invalide." }, { status: 400 });
    }
    const conflict = await db.customTheme.findFirst({
      where: {
        ...workspaceWhere(workspace.id),
        id: { not: id },
        name: { equals: name, mode: "insensitive" },
      },
    });
    if (conflict) {
      return NextResponse.json(
        { error: "Une autre thématique porte déjà ce nom." },
        { status: 409 }
      );
    }
    data.name = name;
  }

  if (body.description !== undefined) {
    data.description = normalizeThemeDescription(body.description);
  }

  if (typeof body.active === "boolean") {
    data.active = body.active;
  }

  if (body.explorationAngles !== undefined || body.angles !== undefined) {
    const angles = validateThemeAngles(
      body.explorationAngles ?? body.angles
    );
    if (!angles.ok) {
      return NextResponse.json({ error: angles.error }, { status: 400 });
    }
    data.explorationAngles = angles.value;
  }

  if (body.defaultQuota !== undefined) {
    const quota = validateThemeQuota(body.defaultQuota);
    if (!quota.ok) {
      return NextResponse.json({ error: quota.error }, { status: 400 });
    }
    data.defaultQuota = quota.value;
  }

  if (body.sortOrder !== undefined) {
    const order = Number(body.sortOrder);
    if (!Number.isFinite(order) || order < 0) {
      return NextResponse.json({ error: "Ordre invalide." }, { status: 400 });
    }
    data.sortOrder = Math.round(order);
  }

  if (body.naxialisServices !== undefined) {
    if (!Array.isArray(body.naxialisServices)) {
      return NextResponse.json(
        { error: "Services invalides." },
        { status: 400 }
      );
    }
    data.naxialisServices = body.naxialisServices.filter(
      (item): item is string => typeof item === "string"
    );
  }

  // Ne jamais permettre de modifier legacyKey via l’API publique.
  // DB-004 — where composé workspace (défense en profondeur).
  const updated = await db.customTheme.updateMany({
    where: { id, ...workspaceWhere(workspace.id) },
    data,
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Thématique introuvable." }, { status: 404 });
  }
  const theme = await db.customTheme.findFirst({
    where: { id, ...workspaceWhere(workspace.id) },
  });

  if (data.name && data.name !== existing.name) {
    await syncOpportunityThemeLabel(id, data.name, workspace.id);
  }

  return NextResponse.json({ theme });
}

/**
 * Suppression physique si aucune dépendance ; sinon désactivation.
 * Query `?force=deactivate` force la désactivation.
 */
export async function DELETE(request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const resolved = await getWorkspaceOrResponse();
  if (!resolved.ok) {
    return resolved.response;
  }
  const { workspace } = resolved;

  const { id } = await context.params;
  const existing = await db.customTheme.findFirst({
    where: { id, ...workspaceWhere(workspace.id) },
  });
  if (!existing) {
    return NextResponse.json({ error: "Thématique introuvable." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const forceDeactivate = searchParams.get("force") === "deactivate";
  const dependencies = await getThemeDependencies(id, workspace.id);

  if (!dependencies.canDelete || forceDeactivate) {
    await db.customTheme.updateMany({
      where: { id, ...workspaceWhere(workspace.id) },
      data: { active: false },
    });
    const theme = await db.customTheme.findFirst({
      where: { id, ...workspaceWhere(workspace.id) },
    });
    return NextResponse.json({
      theme,
      deactivated: true,
      deleted: false,
      dependencies,
      reason: dependencies.canDelete
        ? null
        : "Thématique liée à des données historiques — désactivation uniquement.",
    });
  }

  await db.customTheme.deleteMany({
    where: { id, ...workspaceWhere(workspace.id) },
  });
  return NextResponse.json({
    deleted: true,
    deactivated: false,
    id,
    dependencies,
  });
}
