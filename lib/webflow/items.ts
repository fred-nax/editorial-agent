/**
 * Liste paginée des items CMS Webflow (Data API V2) — lecture seule.
 */

import type { WebflowClient } from "@/lib/webflow/client";
import { WebflowApiError } from "@/lib/webflow/errors";

const MAX_LIMIT = 100;
const MAX_PAGES = 200;

export type WebflowCmsItemRemote = {
  id: string;
  isDraft: boolean;
  isArchived: boolean;
  fieldData: Record<string, unknown>;
  createdOn: string | null;
  lastUpdated: string | null;
  lastPublished: string | null;
};

export type WebflowListItemsPage = {
  items: WebflowCmsItemRemote[];
  offset: number;
  limit: number;
  total: number | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseItem(raw: unknown): WebflowCmsItemRemote | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!id) {
    return null;
  }
  const fieldData =
    row.fieldData &&
    typeof row.fieldData === "object" &&
    !Array.isArray(row.fieldData)
      ? (row.fieldData as Record<string, unknown>)
      : {};
  return {
    id,
    isDraft: row.isDraft === true,
    isArchived: row.isArchived === true,
    fieldData,
    createdOn: typeof row.createdOn === "string" ? row.createdOn : null,
    lastUpdated: typeof row.lastUpdated === "string" ? row.lastUpdated : null,
    lastPublished:
      typeof row.lastPublished === "string" ? row.lastPublished : null,
  };
}

async function fetchItemsPage(
  client: WebflowClient,
  path: string,
  offset: number,
  limit: number
): Promise<WebflowListItemsPage> {
  const maxAttempts = 4;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await client.request<{
        items?: unknown[];
        pagination?: { total?: number; limit?: number; offset?: number };
      }>({
        method: "GET",
        path,
        query: {
          offset: String(offset),
          limit: String(limit),
        },
      });

      const items = (response.items ?? [])
        .map(parseItem)
        .filter((item): item is WebflowCmsItemRemote => item !== null);

      const total =
        typeof response.pagination?.total === "number"
          ? response.pagination.total
          : null;

      return { items, offset, limit, total };
    } catch (error) {
      lastError = error;
      if (
        error instanceof WebflowApiError &&
        error.code === "rate_limited" &&
        attempt < maxAttempts
      ) {
        const waitMs = Math.max(
          1000,
          (error.retryAfterSeconds ?? attempt) * 1000
        );
        await sleep(waitMs);
        continue;
      }
      if (
        error instanceof WebflowApiError &&
        (error.code === "server_error" || error.code === "network") &&
        attempt < maxAttempts
      ) {
        await sleep(400 * attempt);
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new WebflowApiError("network", "Échec pagination Webflow.");
}

/**
 * Parcourt tous les items d’une collection (staged ou live).
 * path = `/collections/{id}/items` ou `/collections/{id}/items/live`
 */
export async function listAllWebflowCollectionItems(
  client: WebflowClient,
  collectionId: string,
  options?: {
    live?: boolean;
    onPage?: (page: WebflowListItemsPage, pageIndex: number) => void;
  }
): Promise<{
  items: WebflowCmsItemRemote[];
  pagesFetched: number;
  expectedTotal: number | null;
}> {
  const trimmed = collectionId.trim();
  if (!trimmed) {
    throw new WebflowApiError("bad_request", "collectionId Webflow manquant.");
  }

  const path = options?.live
    ? `/collections/${trimmed}/items/live`
    : `/collections/${trimmed}/items`;

  const all: WebflowCmsItemRemote[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let pagesFetched = 0;
  let expectedTotal: number | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await fetchItemsPage(client, path, offset, MAX_LIMIT);
    pagesFetched += 1;
    if (result.total !== null) {
      expectedTotal = result.total;
    }
    options?.onPage?.(result, page);

    if (result.items.length === 0) {
      break;
    }

    for (const item of result.items) {
      if (seen.has(item.id)) {
        continue;
      }
      seen.add(item.id);
      all.push(item);
    }

    offset += result.items.length;
    if (result.items.length < MAX_LIMIT) {
      break;
    }
    if (expectedTotal !== null && offset >= expectedTotal) {
      break;
    }
  }

  return { items: all, pagesFetched, expectedTotal };
}
