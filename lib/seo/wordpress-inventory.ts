import { Prisma } from "@prisma/client";
import { db } from "../db";
import { logError, logInfo } from "../logger";
import {
  assertInventorySyncAllowed,
  markInventorySyncedForSite,
  resolveWordPressConfig,
  type WordPressConfig,
} from "../settings/app-settings";
import { stripHtml } from "./normalize";
import {
  buildWordPressInventoryUrl,
  resolveInventoryModifiedAfter,
  resolveInventoryPagePlan,
  type WordPressInventoryResource,
} from "./wordpress-url";

export {
  buildWordPressInventoryUrl,
  resolveInventoryModifiedAfter,
  resolveInventoryPagePlan,
} from "./wordpress-url";

export type WordPressContentType = "post" | "page";

/** Détecte un refus REST WP sur le paramètre status (pages draft, etc.). */
export function isWordPressStatusForbiddenError(
  statusCode: number,
  body: string
): boolean {
  if (statusCode !== 400 && statusCode !== 403) {
    return false;
  }
  return /rest_forbidden_status|rest_invalid_param|état est interdit|status is forbidden/i.test(
    body
  );
}

type WpRestPost = {
  id: number;
  slug?: string;
  link?: string;
  status?: string;
  date_gmt?: string;
  modified_gmt?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
  categories?: number[];
};

type StatusFetchResult = {
  status: string;
  context: "view" | "edit";
  announcedTotal: number | null;
  fetchedCount: number;
  pagesFetched: number;
  headerInconsistent: boolean;
  statusForbidden: boolean;
  posts: WpRestPost[];
};

type SyncRunPersistInput = {
  status: "completed" | "failed";
  fetchedCount: number;
  upsertedCount: number;
  expectedTotal: number | null;
  storedCount: number;
  pagesFetched: number;
  totalPages: number | null;
  statusBreakdown: Record<string, number>;
  diagnosticNote: string | null;
  error: string | null;
};

const PUBLIC_STATUSES = ["publish"] as const;
const PRIVATE_STATUSES = ["draft", "future", "private", "pending"] as const;

/** Credentials figés pour la durée d’une sync (évite un changement mid-flight). */
let syncWpCredentials: WordPressConfig | null = null;

async function getInventoryWp(): Promise<WordPressConfig> {
  if (syncWpCredentials) {
    return syncWpCredentials;
  }
  const config = await resolveWordPressConfig();
  if (!config) {
    throw new Error("WordPress non configuré.");
  }
  return config;
}

function getWpAuthHeader(wp: WordPressConfig): string {
  const token = Buffer.from(`${wp.username}:${wp.appPassword}`).toString(
    "base64"
  );
  return `Basic ${token}`;
}

function parseWpDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function fetchWithRetry(
  url: string,
  wp: WordPressConfig,
  attempts = 3
): Promise<Response> {
  const { fetchWordPressNoRedirect } = await import("../settings/wp-url");
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchWordPressNoRedirect(url, {
        method: "GET",
        headers: {
          Authorization: getWpAuthHeader(wp),
          Accept: "application/json",
        },
      });
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("Erreur réseau WordPress.");
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
  }
  throw lastError ?? new Error("Erreur réseau WordPress.");
}

export async function fetchWordPressPage(params: {
  page: number;
  perPage: number;
  status: string;
  context: "view" | "edit";
  modifiedAfter?: Date | null;
  resource?: WordPressInventoryResource;
}): Promise<{
  posts: WpRestPost[];
  totalPages: number | null;
  totalItems: number | null;
  headerInconsistent: boolean;
  statusForbidden?: boolean;
}> {
  const wp = await getInventoryWp();
  const url = buildWordPressInventoryUrl({
    baseUrl: wp.url,
    page: params.page,
    perPage: params.perPage,
    status: params.status,
    context: params.context,
    modifiedAfter: params.modifiedAfter,
    resource: params.resource ?? "posts",
  });

  const response = await fetchWithRetry(url, wp);

  if (response.status === 400 && params.page > 1) {
    return {
      posts: [],
      totalPages: params.page - 1,
      totalItems: null,
      headerInconsistent: false,
    };
  }

  if (!response.ok) {
    const body = await response.text();
    // Statut non listable pour ce type/compte (ex. pages draft) :
    // ne pas faire échouer toute la sync (publish déjà récupéré).
    if (isWordPressStatusForbiddenError(response.status, body)) {
      return {
        posts: [],
        totalPages: 0,
        totalItems: 0,
        headerInconsistent: false,
        statusForbidden: true,
      };
    }
    throw new Error(
      `WordPress inventory error ${response.status}: ${body.slice(0, 300)}`
    );
  }

  const posts = (await response.json()) as WpRestPost[];
  const list = Array.isArray(posts) ? posts : [];
  const totalPagesHeader = response.headers.get("X-WP-TotalPages");
  const totalItemsHeader = response.headers.get("X-WP-Total");
  const totalPages = totalPagesHeader ? Number(totalPagesHeader) : null;
  const totalItems = totalItemsHeader ? Number(totalItemsHeader) : null;

  const plan = resolveInventoryPagePlan({
    page: params.page,
    perPage: params.perPage,
    postsOnPage: list.length,
    headerTotal: totalItems !== null && Number.isFinite(totalItems) ? totalItems : null,
    headerTotalPages:
      totalPages !== null && Number.isFinite(totalPages) ? totalPages : null,
  });

  return {
    posts: list,
    totalPages: plan.totalPages,
    totalItems:
      totalItems !== null && Number.isFinite(totalItems) ? totalItems : null,
    headerInconsistent: plan.headerInconsistent,
  };
}

async function fetchAllPostsForStatus(params: {
  status: string;
  context: "view" | "edit";
  modifiedAfter?: Date | null;
  perPage?: number;
  resource?: WordPressInventoryResource;
}): Promise<StatusFetchResult> {
  const perPage = params.perPage ?? 100;
  const resource = params.resource ?? "posts";
  const posts: WpRestPost[] = [];
  let page = 1;
  let totalPages = 1;
  let announcedTotal: number | null = null;
  let pagesFetched = 0;
  let headerInconsistent = false;
  let statusForbidden = false;

  while (page <= totalPages && page <= 200) {
    const result = await fetchWordPressPage({
      page,
      perPage,
      status: params.status,
      context: params.context,
      modifiedAfter: params.modifiedAfter,
      resource,
    });

    pagesFetched += 1;
    if (page === 1) {
      announcedTotal = result.totalItems;
      headerInconsistent = result.headerInconsistent;
      statusForbidden = Boolean(result.statusForbidden);
      if (statusForbidden) {
        break;
      }
    }
    if (result.totalPages !== null) {
      totalPages = result.totalPages;
    }
    posts.push(...result.posts);

    if (result.posts.length === 0) {
      break;
    }
    // Si une page renvoie moins que per_page et qu’on a déjà tout le contenu
    // accessible (incohérence header), on tente encore la page suivante une fois
    // puis on s’arrête sur page vide.
    page += 1;
  }

  return {
    status: params.status,
    context: params.context,
    announcedTotal,
    fetchedCount: posts.length,
    pagesFetched,
    headerInconsistent,
    statusForbidden,
    posts,
  };
}

async function upsertPosts(
  posts: WpRestPost[],
  contentType: WordPressContentType
): Promise<{
  upsertedCount: number;
  statusBreakdown: Record<string, number>;
}> {
  let upsertedCount = 0;
  const statusBreakdown: Record<string, number> = {};
  const wp = await getInventoryWp();

  for (const post of posts) {
    if (!post.id) {
      continue;
    }
    const fallbackLabel = contentType === "page" ? "Page" : "Post";
    const title =
      stripHtml(post.title?.rendered ?? "").slice(0, 500) ||
      `${fallbackLabel} #${post.id}`;
    const excerpt =
      stripHtml(post.excerpt?.rendered ?? "").slice(0, 2000) || null;
    const contentText =
      stripHtml(post.content?.rendered ?? "").slice(0, 20000) || null;
    const status = post.status ?? "unknown";
    statusBreakdown[status] = (statusBreakdown[status] ?? 0) + 1;

    await db.wordPressPost.upsert({
      where: { wpPostId: post.id },
      create: {
        wpPostId: post.id,
        title,
        slug: post.slug ?? String(post.id),
        url: post.link ?? `${wp.url}/?p=${post.id}`,
        status,
        contentType,
        excerpt,
        contentText,
        categories: post.categories ?? [],
        publishedAt: parseWpDate(post.date_gmt),
        modifiedAt: parseWpDate(post.modified_gmt),
        syncedAt: new Date(),
      },
      update: {
        title,
        slug: post.slug ?? String(post.id),
        url: post.link ?? `${wp.url}/?p=${post.id}`,
        status,
        contentType,
        excerpt,
        contentText,
        categories: post.categories ?? [],
        publishedAt: parseWpDate(post.date_gmt),
        modifiedAt: parseWpDate(post.modified_gmt),
        syncedAt: new Date(),
      },
    });
    upsertedCount += 1;
  }

  return { upsertedCount, statusBreakdown };
}

function mergeBreakdown(
  target: Record<string, number>,
  source: Record<string, number>
): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

/**
 * Persiste le diagnostic de sync.
 * Fallback sans champs Phase 1.1 si le client Prisma est périmé
 * (Unknown arg expectedTotal, etc.) — sans masquer l’erreur d’origine.
 */
export async function persistWordPressSyncRun(
  runId: string,
  input: SyncRunPersistInput
): Promise<{ usedFallback: boolean; persistError: string | null }> {
  const finishedAt = new Date();
  const fullData = {
    status: input.status,
    fetchedCount: input.fetchedCount,
    upsertedCount: input.upsertedCount,
    expectedTotal: input.expectedTotal,
    storedCount: input.storedCount,
    pagesFetched: input.pagesFetched,
    totalPages: input.totalPages,
    statusBreakdown: input.statusBreakdown as Prisma.InputJsonValue,
    diagnosticNote: input.diagnosticNote,
    error: input.error,
    finishedAt,
  };

  try {
    await db.wordPressSyncRun.update({
      where: { id: runId },
      data: fullData,
    });
    return { usedFallback: false, persistError: null };
  } catch (error) {
    const persistError =
      error instanceof Error ? error.message.slice(0, 800) : "Erreur Prisma.";
    logError("seo", "wordpress sync run full persist failed", {
      runId,
      persistError,
    });

    // Fallback : champs historiques uniquement (toujours présents).
    await db.wordPressSyncRun.update({
      where: { id: runId },
      data: {
        status: input.status,
        fetchedCount: input.fetchedCount,
        upsertedCount: input.upsertedCount,
        error:
          input.error ??
          `Diagnostic partiel : client Prisma/migration incomplet. ${persistError.slice(0, 300)}`,
        finishedAt,
      },
    });
    return { usedFallback: true, persistError };
  }
}

/**
 * Synchronisation lecture seule de l'inventaire WordPress.
 * - posts + pages (publish via context=view)
 * - draft/private/pending/future via context=edit (selon capacités du compte)
 * Upsert uniquement — aucune suppression locale destructive.
 */
export async function processWordPressInventorySync(options: {
  runId: string;
  mode?: "full" | "incremental";
}): Promise<void> {
  const mode = options.mode ?? "incremental";
  let fetchedCount = 0;
  let upsertedCount = 0;
  let expectedTotal = 0;
  let pagesFetched = 0;
  let maxTotalPages: number | null = null;
  const statusBreakdown: Record<string, number> = {};
  const notes: string[] = [];
  /** Clé `${contentType}:${id}` — IDs WP globaux, mais dédup par type explicite. */
  const seenKeys = new Set<string>();

  try {
    const wp = await resolveWordPressConfig();
    if (!wp) {
      throw new Error("WordPress non configuré.");
    }
    await assertInventorySyncAllowed(wp.url, mode);
    syncWpCredentials = wp;

    const latestModifiedByContentType: Partial<
      Record<WordPressContentType, Date | null>
    > = {};
    if (mode === "incremental") {
      for (const contentType of ["post", "page"] as const) {
        const latest = await db.wordPressPost.findFirst({
          where: { contentType },
          orderBy: { modifiedAt: "desc" },
          select: { modifiedAt: true },
        });
        latestModifiedByContentType[contentType] = latest?.modifiedAt ?? null;
      }
    }

    type TypedFetch = StatusFetchResult & { contentType: WordPressContentType };
    const fetches: TypedFetch[] = [];
    const resources: Array<{
      resource: WordPressInventoryResource;
      contentType: WordPressContentType;
    }> = [
      { resource: "posts", contentType: "post" },
      { resource: "pages", contentType: "page" },
    ];

    for (const { resource, contentType } of resources) {
      const modifiedAfter = resolveInventoryModifiedAfter({
        mode,
        latestModifiedByContentType,
        contentType,
      });
      for (const status of PUBLIC_STATUSES) {
        fetches.push({
          ...(await fetchAllPostsForStatus({
            status,
            context: "view",
            modifiedAfter,
            resource,
          })),
          contentType,
        });
      }

      // Les pages hors publish sont souvent interdites (rest_forbidden_status)
      // pour Application Password — on ne les demande que pour les posts.
      const privateStatuses =
        contentType === "page" ? ([] as const) : PRIVATE_STATUSES;
      for (const status of privateStatuses) {
        fetches.push({
          ...(await fetchAllPostsForStatus({
            status,
            context: "edit",
            modifiedAfter,
            resource,
          })),
          contentType,
        });
      }
    }

    const byType: Record<WordPressContentType, WpRestPost[]> = {
      post: [],
      page: [],
    };
    for (const fetchResult of fetches) {
      pagesFetched += fetchResult.pagesFetched;
      if (fetchResult.announcedTotal !== null) {
        expectedTotal += fetchResult.announcedTotal;
      }
      if (fetchResult.statusForbidden) {
        notes.push(
          `Statut WP « ${fetchResult.status} » interdit pour ${fetchResult.contentType} (context=${fetchResult.context}) — ignoré.`
        );
      }
      if (fetchResult.headerInconsistent) {
        notes.push(
          `Incohérence WP pour « ${fetchResult.status} » (${fetchResult.contentType}, context=${fetchResult.context}) : X-WP-Total=${fetchResult.announcedTotal}, récupérés=${fetchResult.fetchedCount}.`
        );
      }
      for (const post of fetchResult.posts) {
        if (!post.id) {
          continue;
        }
        const key = `${fetchResult.contentType}:${post.id}`;
        if (seenKeys.has(key)) {
          continue;
        }
        seenKeys.add(key);
        byType[fetchResult.contentType].push(post);
      }
    }

    fetchedCount = byType.post.length + byType.page.length;
    const upsertPostsResult = await upsertPosts(byType.post, "post");
    const upsertPagesResult = await upsertPosts(byType.page, "page");
    upsertedCount =
      upsertPostsResult.upsertedCount + upsertPagesResult.upsertedCount;
    mergeBreakdown(statusBreakdown, upsertPostsResult.statusBreakdown);
    mergeBreakdown(statusBreakdown, upsertPagesResult.statusBreakdown);
    notes.push(
      `Inventaire : ${byType.post.length} article(s), ${byType.page.length} page(s).`
    );

    const storedCount = await db.wordPressPost.count();
    maxTotalPages = pagesFetched;

    if (mode === "full" && expectedTotal > fetchedCount) {
      notes.push(
        `Annoncés API (somme des statuts) : ${expectedTotal}. Accessibles et récupérés : ${fetchedCount}. Écart souvent dû à context=edit / capacités Application Password.`
      );
    } else if (mode === "incremental") {
      const postCursor = latestModifiedByContentType.post;
      const pageCursor = latestModifiedByContentType.page;
      notes.push(
        `Sync incrémentale : ${fetchedCount} contenu(s) récupéré(s) (${byType.post.length} article(s), ${byType.page.length} page(s))` +
          `; curseur articles=${postCursor ? postCursor.toISOString() : "aucun"}` +
          `, curseur pages=${pageCursor ? pageCursor.toISOString() : "aucun"}.`
      );
    } else if (expectedTotal === fetchedCount) {
      notes.push(
        "Le nombre récupéré correspond au total annoncé par l’API pour le périmètre accessible."
      );
    }

    const persist = await persistWordPressSyncRun(options.runId, {
      status: "completed",
      fetchedCount,
      upsertedCount,
      expectedTotal: expectedTotal > 0 ? expectedTotal : null,
      storedCount,
      pagesFetched,
      totalPages: maxTotalPages,
      statusBreakdown,
      diagnosticNote: notes.join(" ") || null,
      error: null,
    });

    if (persist.usedFallback) {
      notes.push(
        "Attention : diagnostic Phase 1.1 non persisté (client Prisma périmé). Relancer prisma generate + redémarrer l’app."
      );
    }

    if (mode === "full") {
      try {
        await markInventorySyncedForSite(wp.url);
      } catch {
        notes.push(
          "Marqueur d’origine inventaire non mis à jour (AppSettings indisponible)."
        );
      }
    } else {
      try {
        // Sync incrémentale : rafraîchir l'origine seulement si déjà valide.
        const { getInventoryCompatibility } = await import(
          "../settings/inventory-guard"
        );
        const state = await getInventoryCompatibility();
        if (state.usable) {
          await markInventorySyncedForSite(wp.url);
        }
      } catch {
        /* non bloquant */
      }
    }

    logInfo("seo", "wordpress inventory synced", {
      runId: options.runId,
      mode,
      fetchedCount,
      upsertedCount,
      expectedTotal,
      storedCount,
      usedFallback: persist.usedFallback,
    });
  } catch (error) {
    const storedCount = await db.wordPressPost.count().catch(() => 0);
    const message =
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Erreur synchronisation WordPress.";

    await persistWordPressSyncRun(options.runId, {
      status: "failed",
      fetchedCount,
      upsertedCount,
      expectedTotal: expectedTotal > 0 ? expectedTotal : null,
      storedCount,
      pagesFetched,
      totalPages: maxTotalPages,
      statusBreakdown,
      diagnosticNote: notes.join(" ") || null,
      error: message,
    });

    logError("seo", "wordpress inventory sync failed", {
      runId: options.runId,
      message,
      fetchedCount,
      upsertedCount,
    });
  } finally {
    syncWpCredentials = null;
  }
}

export function enqueueWordPressInventorySync(
  runId: string,
  mode: "full" | "incremental"
): void {
  void processWordPressInventorySync({ runId, mode }).catch(async (error) => {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "Erreur inattendue.";
    await persistWordPressSyncRun(runId, {
      status: "failed",
      fetchedCount: 0,
      upsertedCount: 0,
      expectedTotal: null,
      storedCount: await db.wordPressPost.count().catch(() => 0),
      pagesFetched: 0,
      totalPages: null,
      statusBreakdown: {},
      diagnosticNote: null,
      error: message,
    }).catch(() => undefined);
  });
}

/** Diagnostic lecture seule pour l’UI. */
export async function getWordPressInventoryDiagnostic(): Promise<{
  count: number;
  byStatus: Record<string, number>;
  lastSync: Awaited<ReturnType<typeof db.wordPressSyncRun.findFirst>>;
  running: Awaited<ReturnType<typeof db.wordPressSyncRun.findFirst>>;
}> {
  const [count, posts, lastSync, running] = await Promise.all([
    db.wordPressPost.count(),
    db.wordPressPost.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    db.wordPressSyncRun.findFirst({
      orderBy: { startedAt: "desc" },
    }),
    db.wordPressSyncRun.findFirst({
      where: { status: "running" },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of posts) {
    byStatus[row.status] = row._count._all;
  }

  return { count, byStatus, lastSync, running };
}
