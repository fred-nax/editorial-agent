/**
 * Création d’items CMS Webflow en brouillon (V7.10.1).
 * Jamais de publish / live. Mapping dynamique depuis AppSettings.
 */

import type { WebflowClient } from "@/lib/webflow/client";
import { WebflowApiError } from "@/lib/webflow/errors";
import { assertValidWebflowDraftPayload } from "@/lib/webflow/content-validation";
import { estimateReadingTimeMinutes } from "@/lib/webflow/reading-time";
import {
  WEBFLOW_REQUIRED_EDITORIAL_FIELDS,
  type WebflowFieldMapping,
} from "@/lib/webflow/types";

export type WebflowDraftCreateInput = {
  title: string;
  content: string;
  excerpt: string;
  slug: string;
  meta_title: string;
  meta_description: string;
};

export type WebflowDraftCreateResult = {
  success: true;
  itemId: string;
  isDraft: true;
  isArchived: false;
  title: string;
  slug: string;
  excerpt: string;
  meta_title: string;
  meta_description: string;
  fieldDataKeys: string[];
};

type CreateItemResponse = {
  id?: string;
  isDraft?: boolean;
  isArchived?: boolean;
  fieldData?: Record<string, unknown>;
};

type ListItemsResponse = {
  items?: Array<{
    id?: string;
    isDraft?: boolean;
    fieldData?: Record<string, unknown>;
  }>;
};

function fieldSlugFor(
  mapping: WebflowFieldMapping,
  editorial: keyof WebflowFieldMapping
): string | null {
  const entry = mapping[editorial];
  const slug = entry?.fieldSlug?.trim();
  return slug || null;
}

/**
 * Construit fieldData Webflow à partir du mapping enregistré (slugs dynamiques).
 * V7.10.1 : six champs obligatoires + reading_time optionnel calculé localement.
 * Pas d’image / catégorie / auteur inventés.
 */
export function buildWebflowFieldData(
  input: WebflowDraftCreateInput,
  mapping: WebflowFieldMapping
): Record<string, string | number> {
  assertValidWebflowDraftPayload(input);

  for (const key of WEBFLOW_REQUIRED_EDITORIAL_FIELDS) {
    if (!fieldSlugFor(mapping, key)) {
      throw new Error(
        `Mapping Webflow incomplet : champ éditorial « ${key} » sans slug.`
      );
    }
  }

  const fieldData: Record<string, string | number> = {};
  const titleSlug = fieldSlugFor(mapping, "title")!;
  const slugSlug = fieldSlugFor(mapping, "slug")!;
  const contentSlug = fieldSlugFor(mapping, "content")!;
  const excerptSlug = fieldSlugFor(mapping, "excerpt")!;
  const metaTitleSlug = fieldSlugFor(mapping, "meta_title")!;
  const metaDescSlug = fieldSlugFor(mapping, "meta_description")!;

  fieldData[titleSlug] = input.title.trim();
  fieldData[slugSlug] = input.slug.trim();
  fieldData[contentSlug] = input.content.trim();
  fieldData[excerptSlug] = input.excerpt.trim();
  fieldData[metaTitleSlug] = input.meta_title.trim();
  fieldData[metaDescSlug] = input.meta_description.trim();

  const readingSlug = fieldSlugFor(mapping, "reading_time");
  if (readingSlug) {
    fieldData[readingSlug] = estimateReadingTimeMinutes(input.content);
  }

  return fieldData;
}

export async function findWebflowItemIdBySlug(
  client: WebflowClient,
  collectionId: string,
  slugFieldSlug: string,
  slugValue: string
): Promise<string | null> {
  const trimmedCollection = collectionId.trim();
  const trimmedSlug = slugValue.trim();
  if (!trimmedCollection || !trimmedSlug || !slugFieldSlug.trim()) {
    return null;
  }

  // Liste limitée — filtre client sur le slug (API v2 sans filtre slug universel).
  const payload = await client.request<ListItemsResponse>({
    method: "GET",
    path: `/collections/${encodeURIComponent(trimmedCollection)}/items`,
    query: { limit: "100" },
  });

  const items = Array.isArray(payload.items) ? payload.items : [];
  for (const item of items) {
    const value = item.fieldData?.[slugFieldSlug];
    if (
      typeof value === "string" &&
      value.trim() === trimmedSlug &&
      typeof item.id === "string" &&
      item.id.trim()
    ) {
      return item.id.trim();
    }
  }
  return null;
}

export async function createWebflowCollectionDraft(options: {
  client: WebflowClient;
  collectionId: string;
  mapping: WebflowFieldMapping;
  input: WebflowDraftCreateInput;
  /**
   * Si true et qu’un item avec le même slug existe déjà, refuse une 2ᵉ création
   * (prévention doublons / reprises ambiguës).
   */
  rejectIfSlugExists?: boolean;
}): Promise<WebflowDraftCreateResult> {
  const collectionId = options.collectionId.trim();
  if (!collectionId) {
    throw new Error("Collection Webflow manquante pour la création.");
  }

  const fieldData = buildWebflowFieldData(options.input, options.mapping);
  const slugField = fieldSlugFor(options.mapping, "slug");
  if (!slugField) {
    throw new Error("Mapping slug Webflow manquant.");
  }

  if (options.rejectIfSlugExists !== false) {
    const existingId = await findWebflowItemIdBySlug(
      options.client,
      collectionId,
      slugField,
      options.input.slug
    );
    if (existingId) {
      throw new WebflowApiError(
        "bad_request",
        `Un item Webflow avec le slug « ${options.input.slug.trim()} » existe déjà (id ${existingId}). Aucune nouvelle création.`
      );
    }
  }

  const response = await options.client.request<CreateItemResponse>({
    method: "POST",
    path: `/collections/${encodeURIComponent(collectionId)}/items`,
    body: {
      isDraft: true,
      isArchived: false,
      fieldData,
    },
  });

  const itemId = typeof response.id === "string" ? response.id.trim() : "";
  if (!itemId) {
    throw new WebflowApiError(
      "invalid_response",
      "Réponse Webflow sans identifiant d’item."
    );
  }

  if (response.isDraft === false) {
    throw new WebflowApiError(
      "invalid_response",
      "L’item Webflow n’est pas en brouillon — création refusée."
    );
  }

  return {
    success: true,
    itemId,
    isDraft: true,
    isArchived: false,
    title: options.input.title.trim(),
    slug: options.input.slug.trim(),
    excerpt: options.input.excerpt.trim(),
    meta_title: options.input.meta_title.trim(),
    meta_description: options.input.meta_description.trim(),
    fieldDataKeys: Object.keys(fieldData),
  };
}
