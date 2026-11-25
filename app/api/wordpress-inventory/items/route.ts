import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { resolveWordPressConfig } from "@/lib/settings/app-settings";
import { parseSyncedCategoriesJson } from "@/lib/wordpress-categories";
import {
  assertWordPressOnlyModule,
  resolveActiveWorkspace,
  WorkspaceContextError,
  workspaceWhere,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PAGE_SIZES = [10, 20, 50] as const;
const ALLOWED_SORT = [
  "title_asc",
  "title_desc",
  "published_desc",
  "published_asc",
  "modified_desc",
  "modified_asc",
] as const;

type SortKey = (typeof ALLOWED_SORT)[number];

const ITEM_SELECT = {
  id: true,
  wpPostId: true,
  title: true,
  slug: true,
  url: true,
  status: true,
  contentType: true,
  excerpt: true,
  categories: true,
  publishedAt: true,
  modifiedAt: true,
  syncedAt: true,
} as const;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function buildAdminEditUrl(
  wpOrigin: string | null,
  wpPostId: number
): string | null {
  if (!wpOrigin?.trim()) {
    return null;
  }
  try {
    const base = new URL(wpOrigin.trim());
    return `${base.origin}/wp-admin/post.php?post=${wpPostId}&action=edit`;
  } catch {
    return null;
  }
}

function orderByFor(
  sort: SortKey
): Prisma.WordPressPostOrderByWithRelationInput[] {
  switch (sort) {
    case "title_asc":
      return [{ title: "asc" }, { id: "asc" }];
    case "title_desc":
      return [{ title: "desc" }, { id: "asc" }];
    case "published_asc":
      return [{ publishedAt: "asc" }, { title: "asc" }];
    case "published_desc":
      return [{ publishedAt: "desc" }, { title: "asc" }];
    case "modified_asc":
      return [{ modifiedAt: "asc" }, { title: "asc" }];
    case "modified_desc":
    default:
      return [{ modifiedAt: "desc" }, { title: "asc" }];
  }
}

function parseCategoryIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((value) => (typeof value === "number" ? value : Number(value)))
    .filter((value) => Number.isInteger(value) && value > 0);
}

export async function GET(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  let workspace;
  try {
    workspace = await resolveActiveWorkspace();
    assertWordPressOnlyModule(workspace.cmsProvider);
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
  const contentType = searchParams.get("contentType")?.trim() || "";
  const categoryRaw = searchParams.get("category")?.trim() || "";
  const categoryId = categoryRaw ? Number(categoryRaw) : NaN;
  const sortRaw = searchParams.get("sort")?.trim() || "modified_desc";
  const sort: SortKey = ALLOWED_SORT.includes(sortRaw as SortKey)
    ? (sortRaw as SortKey)
    : "modified_desc";
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

  const where: Prisma.WordPressPostWhereInput = {
    ...workspaceWhere(workspace.id),
  };
  if (
    status === "publish" ||
    status === "draft" ||
    status === "future" ||
    status === "private" ||
    status === "pending"
  ) {
    where.status = status;
  }
  if (contentType === "post" || contentType === "page") {
    where.contentType = contentType;
  }
  if (Number.isInteger(categoryId) && categoryId > 0) {
    // categories Json = number[] — Prisma JsonFilter.array_contains (élément)
    where.categories = { array_contains: categoryId };
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
    ];
  }

  const [total, settingsRow, wpConfig] = await Promise.all([
    db.wordPressPost.count({ where }),
    db.appSettings.findUnique({
      where: { id: "default" },
      select: { wpCategoriesJson: true, wpUrl: true },
    }),
    resolveWordPressConfig(),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  if (page > pageCount) {
    page = pageCount;
  }

  const items = await db.wordPressPost.findMany({
    where,
    orderBy: orderByFor(sort),
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: ITEM_SELECT,
  });

  const categoryCatalog = parseSyncedCategoriesJson(
    settingsRow?.wpCategoriesJson
  );
  const categoryNameById = new Map(
    categoryCatalog.map((item) => [item.id, item.name] as const)
  );
  const categoryOptions = categoryCatalog
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .map((item) => ({ id: item.id, name: item.name }));

  const wpOrigin = wpConfig?.url ?? settingsRow?.wpUrl ?? null;

  return NextResponse.json({
    items: items.map((item) => {
      const categoryIds = parseCategoryIds(item.categories);
      return {
        id: item.id,
        wpPostId: item.wpPostId,
        title: item.title,
        slug: item.slug,
        url: item.url || null,
        status: item.status,
        contentType: item.contentType,
        excerpt: item.excerpt,
        // SEO non stocké sur WordPressPost — null volontaire.
        metaTitle: null as string | null,
        metaDescription: null as string | null,
        categoryIds,
        categoryLabels: categoryIds.map(
          (id) => categoryNameById.get(id) ?? `#${id}`
        ),
        publishedAt: item.publishedAt,
        modifiedAt: item.modifiedAt,
        syncedAt: item.syncedAt,
        adminUrl: buildAdminEditUrl(wpOrigin, item.wpPostId),
      };
    }),
    total,
    page,
    pageSize,
    pageCount,
    categoryOptions,
    sort,
  });
}
