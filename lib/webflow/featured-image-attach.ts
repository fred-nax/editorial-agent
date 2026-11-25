/**
 * Association d’un asset Webflow au champ Image d’un item CMS brouillon (staged).
 * Jamais live / publish / unpublish.
 */

import type { WebflowClient } from "@/lib/webflow/client";
import { WebflowApiError } from "@/lib/webflow/errors";
import type { WebflowFieldMapping } from "@/lib/webflow/types";

export type WebflowCmsItemSnapshot = {
  id: string;
  isDraft?: boolean;
  isArchived?: boolean;
  fieldData?: Record<string, unknown>;
};

export function resolveFeaturedImageFieldSlugs(mapping: WebflowFieldMapping): {
  imageSlug: string;
  altSlug: string | null;
  imageType: string | null;
  altType: string | null;
} {
  const image = mapping.featured_image;
  const alt = mapping.alt_text;
  const imageSlug = image?.fieldSlug?.trim() || "";
  if (!image?.fieldId || !imageSlug) {
    throw new WebflowApiError(
      "bad_request",
      "Mapping CMS « featured_image » manquant (slug dynamique requis)."
    );
  }
  if (image.fieldType && image.fieldType !== "Image") {
    throw new WebflowApiError(
      "bad_request",
      `Le champ image mappé doit être de type Image (reçu : ${image.fieldType}).`
    );
  }
  if (alt?.fieldType && alt.fieldType !== "PlainText") {
    throw new WebflowApiError(
      "bad_request",
      `Le champ ALT mappé doit être PlainText (reçu : ${alt.fieldType}).`
    );
  }
  return {
    imageSlug,
    altSlug: alt?.fieldSlug?.trim() || null,
    imageType: image.fieldType ?? "Image",
    altType: alt?.fieldType ?? null,
  };
}

/** Format Image Data API V2 — url + fileId, alt optionnel dans l’objet. */
export function buildWebflowImageFieldValue(input: {
  assetId: string;
  hostedUrl: string;
  altText?: string | null;
}): Record<string, string> {
  const value: Record<string, string> = {
    fileId: input.assetId,
    url: input.hostedUrl,
  };
  if (input.altText?.trim()) {
    value.alt = input.altText.trim().slice(0, 500);
  }
  return value;
}

export function assertWebflowDraftItemForFeaturedImage(
  item: WebflowCmsItemSnapshot,
  expectedId: string
): void {
  if (!item.id || item.id !== expectedId) {
    throw new WebflowApiError(
      "not_found",
      "L’item CMS Webflow ne correspond pas à la génération."
    );
  }
  if (item.isArchived === true) {
    throw new WebflowApiError(
      "bad_request",
      "Item CMS archivé : association d’image refusée.",
      { status: 409 }
    );
  }
  if (item.isDraft !== true) {
    throw new WebflowApiError(
      "bad_request",
      "Seuls les brouillons Webflow (staged, non publiés) peuvent recevoir une image à la une dans cette version.",
      { status: 409 }
    );
  }
}

export async function fetchWebflowCollectionItem(
  client: WebflowClient,
  collectionId: string,
  itemId: string
): Promise<WebflowCmsItemSnapshot> {
  return client.request<WebflowCmsItemSnapshot>({
    method: "GET",
    path: `/collections/${collectionId}/items/${itemId}`,
  });
}

export async function patchWebflowDraftItemFeaturedImage(input: {
  client: WebflowClient;
  collectionId: string;
  itemId: string;
  mapping: WebflowFieldMapping;
  assetId: string;
  hostedUrl: string;
  altText?: string | null;
}): Promise<WebflowCmsItemSnapshot> {
  const { imageSlug, altSlug } = resolveFeaturedImageFieldSlugs(input.mapping);
  const fieldData: Record<string, unknown> = {
    [imageSlug]: buildWebflowImageFieldValue({
      assetId: input.assetId,
      hostedUrl: input.hostedUrl,
      altText: altSlug ? null : input.altText,
    }),
  };
  if (altSlug && input.altText?.trim()) {
    fieldData[altSlug] = input.altText.trim().slice(0, 500);
  }

  const updated = await input.client.request<WebflowCmsItemSnapshot>({
    method: "PATCH",
    path: `/collections/${input.collectionId}/items/${input.itemId}`,
    body: {
      isDraft: true,
      isArchived: false,
      fieldData,
    },
  });
  assertWebflowDraftItemForFeaturedImage(updated, input.itemId);
  return updated;
}
