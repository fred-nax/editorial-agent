/**
 * Découverte des collections Reference (category / author) depuis le mapping Blog.
 * Ne s’appuie pas sur les noms de collections — uniquement validations API + site configuré.
 */

import type { WebflowClient } from "@/lib/webflow/client";
import {
  getWebflowCollectionDetails,
  listWebflowCollections,
} from "@/lib/webflow/collections";
import { WebflowApiError } from "@/lib/webflow/errors";
import type {
  WebflowCollectionField,
  WebflowFieldMapping,
} from "@/lib/webflow/types";

export type WebflowReferenceKind = "category" | "author";

export type DiscoveredReferenceTarget = {
  kind: WebflowReferenceKind;
  editorialField: "category" | "author";
  fieldId: string;
  fieldSlug: string;
  fieldType: string;
  isRequired: boolean;
  referencedCollectionId: string;
  referencedCollectionName: string | null;
};

export type ReferenceDiscoveryResult = {
  ok: boolean;
  siteId: string;
  blogCollectionId: string;
  targets: DiscoveredReferenceTarget[];
  issues: string[];
};

function assertReferenceFieldType(
  kind: WebflowReferenceKind,
  fieldType: string
): void {
  if (fieldType === "MultiReference") {
    throw new WebflowApiError(
      "bad_request",
      `Le champ « ${kind} » est MultiReference : non pris en charge dans V7.13.1 (format incorrect évité).`
    );
  }
  if (fieldType !== "Reference") {
    throw new WebflowApiError(
      "bad_request",
      `Le champ « ${kind} » doit être de type Reference (reçu : ${fieldType}).`
    );
  }
}

function findMappedField(
  fields: WebflowCollectionField[],
  mapping: WebflowFieldMapping,
  key: "category" | "author"
): WebflowCollectionField | null {
  const entry = mapping[key];
  if (!entry?.fieldId?.trim()) {
    return null;
  }
  const byId = fields.find((f) => f.id === entry.fieldId.trim());
  if (byId) {
    return byId;
  }
  const slug = entry.fieldSlug?.trim();
  if (slug) {
    return fields.find((f) => f.slug === slug) ?? null;
  }
  return null;
}

/**
 * Résout les collections cibles category/author depuis le schéma Blog réel.
 */
export async function discoverWebflowReferenceTargets(input: {
  client: WebflowClient;
  siteId: string;
  blogCollectionId: string;
  mapping: WebflowFieldMapping;
}): Promise<ReferenceDiscoveryResult> {
  const siteId = input.siteId.trim();
  const blogCollectionId = input.blogCollectionId.trim();
  const issues: string[] = [];
  const targets: DiscoveredReferenceTarget[] = [];

  if (!siteId || !blogCollectionId) {
    return {
      ok: false,
      siteId,
      blogCollectionId,
      targets: [],
      issues: ["Site ou collection Blog Webflow non configurés."],
    };
  }

  const siteCollections = await listWebflowCollections(input.client, siteId);
  const siteCollectionIds = new Set(siteCollections.map((c) => c.id));
  if (!siteCollectionIds.has(blogCollectionId)) {
    return {
      ok: false,
      siteId,
      blogCollectionId,
      targets: [],
      issues: [
        "La collection Blog configurée n’appartient pas au site Webflow actif.",
      ],
    };
  }

  let details;
  try {
    details = await getWebflowCollectionDetails(
      input.client,
      blogCollectionId
    );
  } catch (error) {
    return {
      ok: false,
      siteId,
      blogCollectionId,
      targets: [],
      issues: [
        error instanceof Error
          ? `Collection Blog inaccessible : ${error.message}`
          : "Collection Blog inaccessible.",
      ],
    };
  }

  for (const kind of ["category", "author"] as const) {
    const mapped = findMappedField(details.fields, input.mapping, kind);
    if (!mapped) {
      if (input.mapping[kind]?.fieldId) {
        issues.push(
          `Champ mappé « ${kind} » introuvable dans le schéma Blog (supprimé ou id invalide).`
        );
      }
      continue;
    }

    try {
      assertReferenceFieldType(kind, mapped.type);
    } catch (error) {
      issues.push(
        error instanceof Error ? error.message : `Type incompatible pour ${kind}.`
      );
      continue;
    }

    const referencedCollectionId = mapped.referencedCollectionId?.trim() || "";
    if (!referencedCollectionId) {
      issues.push(
        `Champ « ${kind} » (Reference) sans collection cible dans les validations API.`
      );
      continue;
    }
    if (!siteCollectionIds.has(referencedCollectionId)) {
      issues.push(
        `Collection référencée pour « ${kind} » (${referencedCollectionId}) hors du site configuré.`
      );
      continue;
    }

    const collectionMeta = siteCollections.find(
      (c) => c.id === referencedCollectionId
    );

    targets.push({
      kind,
      editorialField: kind,
      fieldId: mapped.id,
      fieldSlug: mapped.slug?.trim() || input.mapping[kind]?.fieldSlug?.trim() || "",
      fieldType: mapped.type,
      isRequired: mapped.isRequired,
      referencedCollectionId,
      referencedCollectionName: collectionMeta?.displayName ?? null,
    });
  }

  return {
    ok: issues.length === 0 && targets.length > 0,
    siteId,
    blogCollectionId,
    targets,
    issues,
  };
}
