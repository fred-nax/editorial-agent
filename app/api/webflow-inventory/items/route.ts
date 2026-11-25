import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import {
  assertModuleAllowedForWorkspace,
  assertWebflowOnlyModule,
  resolveActiveWorkspace,
  WorkspaceContextError,
  workspaceWhere,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PAGE_SIZES = [10, 20, 50] as const;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  let workspace;
  try {
    workspace = await resolveActiveWorkspace();
    assertWebflowOnlyModule(workspace.cmsProvider);
    assertModuleAllowedForWorkspace(workspace, "inventory");
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("q")?.trim() || "";
  const status = searchParams.get("status")?.trim() || "";
  const includeMissing = searchParams.get("includeMissing") === "1";
  const rawSize = Number(searchParams.get("pageSize") ?? "20");
  const pageSize = ALLOWED_PAGE_SIZES.includes(
    rawSize as (typeof ALLOWED_PAGE_SIZES)[number]
  )
    ? rawSize
    : 20;
  let page = Number(searchParams.get("page") ?? "1");
  if (!Number.isFinite(page) || page < 1) {
    page = 1;
  }

  const where = {
    ...workspaceWhere(workspace.id),
    ...(includeMissing ? {} : { missingAt: null }),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { slug: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const total = await db.webflowCmsItem.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  if (page > pageCount) {
    page = pageCount;
  }

  const items = await db.webflowCmsItem.findMany({
    where,
    orderBy: [{ lastUpdatedAt: "desc" }, { title: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      webflowItemId: true,
      title: true,
      slug: true,
      url: true,
      status: true,
      isDraft: true,
      isArchived: true,
      isLive: true,
      excerpt: true,
      metaTitle: true,
      metaDescription: true,
      featuredImageUrl: true,
      featuredImageAlt: true,
      categoryRef: true,
      authorRef: true,
      lastUpdatedAt: true,
      lastPublishedAt: true,
      syncedAt: true,
      missingAt: true,
    },
  });

  const refIds = Array.from(
    new Set(
      items
        .flatMap((item) => [item.categoryRef, item.authorRef])
        .filter((id): id is string => Boolean(id?.trim()))
    )
  );
  const refRows =
    refIds.length === 0
      ? []
      : await db.webflowCmsReference.findMany({
          where: {
            workspaceId: workspace.id,
            webflowItemId: { in: refIds },
          },
          select: {
            webflowItemId: true,
            kind: true,
            name: true,
            missingAt: true,
            isArchived: true,
          },
        });
  const categoryById = new Map(
    refRows
      .filter((r) => r.kind === "category")
      .map((r) => [r.webflowItemId, r] as const)
  );
  const authorById = new Map(
    refRows
      .filter((r) => r.kind === "author")
      .map((r) => [r.webflowItemId, r] as const)
  );

  return NextResponse.json({
    items: items.map((item) => {
      const category = item.categoryRef
        ? categoryById.get(item.categoryRef)
        : null;
      const author = item.authorRef ? authorById.get(item.authorRef) : null;
      return {
        ...item,
        categoryName: category?.name ?? null,
        authorName: author?.name ?? null,
        categoryUnavailable: Boolean(
          item.categoryRef &&
            (!category || category.missingAt || category.isArchived)
        ),
        authorUnavailable: Boolean(
          item.authorRef && (!author || author.missingAt || author.isArchived)
        ),
      };
    }),
    total,
    page,
    pageSize,
    pageCount,
  });
}
