/**
 * Mise à jour ciblée category/author d’un brouillon Webflow (staged uniquement).
 * Ne touche jamais title/content/SEO/image/ALT ni endpoints live/publish.
 */

import type { WebflowClient } from "@/lib/webflow/client";
import { WebflowApiError } from "@/lib/webflow/errors";
import {
  assertWebflowDraftItemForFeaturedImage,
  fetchWebflowCollectionItem,
  type WebflowCmsItemSnapshot,
} from "@/lib/webflow/featured-image-attach";
import type { WebflowFieldMapping } from "@/lib/webflow/types";
import { fieldSlugFor } from "@/lib/webflow/drafts";

export async function patchWebflowDraftItemReferences(input: {
  client: WebflowClient;
  collectionId: string;
  itemId: string;
  mapping: WebflowFieldMapping;
  categoryItemId?: string | null;
  authorItemId?: string | null;
}): Promise<WebflowCmsItemSnapshot> {
  const existing = await fetchWebflowCollectionItem(
    input.client,
    input.collectionId,
    input.itemId
  );
  assertWebflowDraftItemForFeaturedImage(existing, input.itemId);

  const fieldData: Record<string, unknown> = {};
  const categorySlug = fieldSlugFor(input.mapping, "category");
  const authorSlug = fieldSlugFor(input.mapping, "author");
  const categoryType = input.mapping.category?.fieldType?.trim() || "Reference";
  const authorType = input.mapping.author?.fieldType?.trim() || "Reference";

  if (input.categoryItemId !== undefined) {
    if (!categorySlug) {
      throw new WebflowApiError(
        "bad_request",
        "Mapping CMS « category » manquant (slug dynamique requis)."
      );
    }
    if (categoryType === "MultiReference") {
      throw new WebflowApiError(
        "bad_request",
        "Champ category MultiReference non pris en charge (V7.13.1)."
      );
    }
    if (input.categoryItemId === null || input.categoryItemId === "") {
      fieldData[categorySlug] = null;
    } else {
      fieldData[categorySlug] = input.categoryItemId.trim();
    }
  }

  if (input.authorItemId !== undefined) {
    if (!authorSlug) {
      throw new WebflowApiError(
        "bad_request",
        "Mapping CMS « author » manquant (slug dynamique requis)."
      );
    }
    if (authorType === "MultiReference") {
      throw new WebflowApiError(
        "bad_request",
        "Champ author MultiReference non pris en charge (V7.13.1)."
      );
    }
    if (input.authorItemId === null || input.authorItemId === "") {
      fieldData[authorSlug] = null;
    } else {
      fieldData[authorSlug] = input.authorItemId.trim();
    }
  }

  if (Object.keys(fieldData).length === 0) {
    throw new WebflowApiError(
      "bad_request",
      "Aucune référence category/author à mettre à jour."
    );
  }

  return input.client.request<WebflowCmsItemSnapshot>({
    method: "PATCH",
    path: `/collections/${encodeURIComponent(input.collectionId)}/items/${encodeURIComponent(input.itemId)}`,
    body: { fieldData, isDraft: true },
  });
}

export function readReferenceIdsFromItem(
  item: WebflowCmsItemSnapshot,
  mapping: WebflowFieldMapping
): { categoryItemId: string | null; authorItemId: string | null } {
  const fd = item.fieldData ?? {};
  const categorySlug = fieldSlugFor(mapping, "category");
  const authorSlug = fieldSlugFor(mapping, "author");
  const asId = (value: unknown): string | null => {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    return null;
  };
  return {
    categoryItemId: categorySlug ? asId(fd[categorySlug]) : null,
    authorItemId: authorSlug ? asId(fd[authorSlug]) : null,
  };
}
