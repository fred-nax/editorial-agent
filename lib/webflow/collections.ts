import type { WebflowClient } from "@/lib/webflow/client";
import type {
  WebflowCollectionDetails,
  WebflowCollectionField,
  WebflowCollectionSummary,
} from "@/lib/webflow/types";

type CollectionsApiResponse = {
  collections?: Array<{
    id?: string;
    displayName?: string;
    singularName?: string | null;
    slug?: string | null;
  }>;
};

type CollectionDetailsApiResponse = {
  id?: string;
  displayName?: string;
  singularName?: string | null;
  slug?: string | null;
  fields?: Array<{
    id?: string;
    displayName?: string;
    slug?: string | null;
    type?: string;
    isRequired?: boolean;
    isEditable?: boolean;
  }>;
};

export async function listWebflowCollections(
  client: WebflowClient,
  siteId: string
): Promise<WebflowCollectionSummary[]> {
  const trimmed = siteId.trim();
  if (!trimmed) {
    throw new Error("Identifiant de site Webflow manquant.");
  }

  const payload = await client.request<CollectionsApiResponse>({
    path: `/sites/${encodeURIComponent(trimmed)}/collections`,
  });
  const collections = Array.isArray(payload.collections)
    ? payload.collections
    : [];

  return collections
    .filter(
      (item): item is { id: string; displayName?: string; singularName?: string | null; slug?: string | null } =>
        typeof item?.id === "string" && item.id.trim().length > 0
    )
    .map((item) => ({
      id: item.id.trim(),
      displayName:
        typeof item.displayName === "string" && item.displayName.trim()
          ? item.displayName.trim()
          : item.id.trim(),
      singularName:
        typeof item.singularName === "string" && item.singularName.trim()
          ? item.singularName.trim()
          : null,
      slug:
        typeof item.slug === "string" && item.slug.trim()
          ? item.slug.trim()
          : null,
    }));
}

export async function getWebflowCollectionDetails(
  client: WebflowClient,
  collectionId: string
): Promise<WebflowCollectionDetails> {
  const trimmed = collectionId.trim();
  if (!trimmed) {
    throw new Error("Identifiant de collection Webflow manquant.");
  }

  const payload = await client.request<CollectionDetailsApiResponse>({
    path: `/collections/${encodeURIComponent(trimmed)}`,
  });

  if (typeof payload.id !== "string" || !payload.id.trim()) {
    throw new Error("Collection Webflow invalide (réponse sans id).");
  }

  const fields: WebflowCollectionField[] = Array.isArray(payload.fields)
    ? payload.fields
        .filter(
          (field): field is {
            id: string;
            displayName?: string;
            slug?: string | null;
            type?: string;
            isRequired?: boolean;
            isEditable?: boolean;
          } => typeof field?.id === "string" && field.id.trim().length > 0
        )
        .map((field) => ({
          id: field.id.trim(),
          displayName:
            typeof field.displayName === "string" && field.displayName.trim()
              ? field.displayName.trim()
              : field.id.trim(),
          slug:
            typeof field.slug === "string" && field.slug.trim()
              ? field.slug.trim()
              : null,
          type:
            typeof field.type === "string" && field.type.trim()
              ? field.type.trim()
              : "PlainText",
          isRequired: field.isRequired === true,
          isEditable: field.isEditable !== false,
        }))
    : [];

  return {
    id: payload.id.trim(),
    displayName:
      typeof payload.displayName === "string" && payload.displayName.trim()
        ? payload.displayName.trim()
        : payload.id.trim(),
    singularName:
      typeof payload.singularName === "string" && payload.singularName.trim()
        ? payload.singularName.trim()
        : null,
    slug:
      typeof payload.slug === "string" && payload.slug.trim()
        ? payload.slug.trim()
        : null,
    fields,
  };
}
