/**
 * Validation du mapping éditorial → champs collection Webflow.
 * Ne crée / ne modifie aucune collection distante.
 */

import {
  WEBFLOW_FIELD_TYPE_ALLOWLIST,
  WEBFLOW_OPTIONAL_EDITORIAL_FIELDS,
  WEBFLOW_REQUIRED_EDITORIAL_FIELDS,
  type WebflowCollectionField,
  type WebflowEditorialFieldKey,
  type WebflowFieldMapping,
  type WebflowFieldMappingEntry,
  type WebflowMappingIssue,
  type WebflowMappingValidationResult,
} from "@/lib/webflow/types";

const ALL_EDITORIAL_FIELDS: readonly WebflowEditorialFieldKey[] = [
  ...WEBFLOW_REQUIRED_EDITORIAL_FIELDS,
  ...WEBFLOW_OPTIONAL_EDITORIAL_FIELDS,
];

export function isWebflowEditorialFieldKey(
  value: unknown
): value is WebflowEditorialFieldKey {
  return (
    typeof value === "string" &&
    (ALL_EDITORIAL_FIELDS as readonly string[]).includes(value)
  );
}

export function parseWebflowFieldMappingJson(
  raw: string | null | undefined
): WebflowFieldMapping {
  if (!raw?.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: WebflowFieldMapping = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      if (!isWebflowEditorialFieldKey(key)) {
        continue;
      }
      if (value === null) {
        result[key] = null;
        continue;
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }
      const entry = value as Record<string, unknown>;
      const fieldId =
        typeof entry.fieldId === "string" ? entry.fieldId.trim() : "";
      if (!fieldId) {
        continue;
      }
      result[key] = {
        fieldId,
        fieldSlug:
          typeof entry.fieldSlug === "string" ? entry.fieldSlug.trim() : null,
        fieldType:
          typeof entry.fieldType === "string" ? entry.fieldType.trim() : null,
        displayName:
          typeof entry.displayName === "string"
            ? entry.displayName.trim()
            : null,
      };
    }
    return result;
  } catch {
    return {};
  }
}

export function serializeWebflowFieldMapping(
  mapping: WebflowFieldMapping
): string {
  const clean: WebflowFieldMapping = {};
  for (const key of ALL_EDITORIAL_FIELDS) {
    const entry = mapping[key];
    if (!entry?.fieldId?.trim()) {
      continue;
    }
    clean[key] = {
      fieldId: entry.fieldId.trim(),
      fieldSlug: entry.fieldSlug?.trim() || null,
      fieldType: entry.fieldType?.trim() || null,
      displayName: entry.displayName?.trim() || null,
    };
  }
  return JSON.stringify(clean);
}

export function normalizeWebflowFieldMappingInput(
  input: unknown
): WebflowFieldMapping {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return parseWebflowFieldMappingJson(JSON.stringify(input));
}

/**
 * Valide le mapping contre le schéma réel de la collection.
 * - Champs éditoriaux obligatoires présents
 * - Types compatibles
 * - fieldId existant dans la collection
 * - Avertissement si un champ collection obligatoire n’est mappé à aucun éditorial
 */
export function validateWebflowFieldMapping(
  mapping: WebflowFieldMapping,
  collectionFields: readonly WebflowCollectionField[]
): WebflowMappingValidationResult {
  const issues: WebflowMappingIssue[] = [];
  const byId = new Map(collectionFields.map((field) => [field.id, field]));
  const mappedFieldIds = new Set<string>();

  for (const editorial of WEBFLOW_REQUIRED_EDITORIAL_FIELDS) {
    const entry = mapping[editorial];
    if (!entry?.fieldId?.trim()) {
      issues.push({
        code: "missing_required",
        editorialField: editorial,
        message: `Champ éditorial obligatoire « ${editorial} » non associé.`,
      });
      continue;
    }
    pushEntryIssues(editorial, entry, byId, issues, mappedFieldIds);
  }

  for (const editorial of WEBFLOW_OPTIONAL_EDITORIAL_FIELDS) {
    const entry = mapping[editorial];
    if (!entry?.fieldId?.trim()) {
      continue;
    }
    pushEntryIssues(editorial, entry, byId, issues, mappedFieldIds);
  }

  for (const field of collectionFields) {
    if (field.isRequired && !mappedFieldIds.has(field.id)) {
      issues.push({
        code: "required_collection_field_unmapped",
        fieldId: field.id,
        message: `Champ Webflow obligatoire « ${field.displayName} » (${field.slug ?? field.id}) non mappé.`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

function pushEntryIssues(
  editorial: WebflowEditorialFieldKey,
  entry: WebflowFieldMappingEntry,
  byId: Map<string, WebflowCollectionField>,
  issues: WebflowMappingIssue[],
  mappedFieldIds: Set<string>
): void {
  const fieldId = entry.fieldId.trim();
  if (!fieldId) {
    issues.push({
      code: "invalid_entry",
      editorialField: editorial,
      message: `Association invalide pour « ${editorial} ».`,
    });
    return;
  }

  const field = byId.get(fieldId);
  if (!field) {
    issues.push({
      code: "unknown_field",
      editorialField: editorial,
      fieldId,
      message: `Champ Webflow introuvable pour « ${editorial} » (id ${fieldId}).`,
    });
    return;
  }

  mappedFieldIds.add(field.id);
  const allowed = WEBFLOW_FIELD_TYPE_ALLOWLIST[editorial];
  if (!allowed.includes(field.type)) {
    issues.push({
      code: "type_mismatch",
      editorialField: editorial,
      fieldId: field.id,
      message: `Type incompatible pour « ${editorial} » : ${field.type} (attendu : ${allowed.join(" | ")}).`,
    });
  }
}

export function enrichMappingWithCollectionFields(
  mapping: WebflowFieldMapping,
  collectionFields: readonly WebflowCollectionField[]
): WebflowFieldMapping {
  const byId = new Map(collectionFields.map((field) => [field.id, field]));
  const enriched: WebflowFieldMapping = {};
  for (const key of ALL_EDITORIAL_FIELDS) {
    const entry = mapping[key];
    if (!entry?.fieldId) {
      continue;
    }
    const field = byId.get(entry.fieldId);
    enriched[key] = field
      ? {
          fieldId: field.id,
          fieldSlug: field.slug,
          fieldType: field.type,
          displayName: field.displayName,
        }
      : { ...entry };
  }
  return enriched;
}
