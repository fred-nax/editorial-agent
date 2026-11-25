/**
 * Types Webflow Data API V2 (lecture seule — V7.10.0).
 * Aucune création / publication / suppression dans cette version.
 */

export const WEBFLOW_API_BASE = "https://api.webflow.com/v2";

/** Champs éditoriaux mappables vers une collection CMS. */
export const WEBFLOW_REQUIRED_EDITORIAL_FIELDS = [
  "title",
  "slug",
  "content",
  "excerpt",
  "meta_title",
  "meta_description",
] as const;

export const WEBFLOW_OPTIONAL_EDITORIAL_FIELDS = [
  "featured_image",
  "alt_text",
  "category",
  "author",
  "reading_time",
] as const;

export type WebflowRequiredEditorialField =
  (typeof WEBFLOW_REQUIRED_EDITORIAL_FIELDS)[number];

export type WebflowOptionalEditorialField =
  (typeof WEBFLOW_OPTIONAL_EDITORIAL_FIELDS)[number];

export type WebflowEditorialFieldKey =
  | WebflowRequiredEditorialField
  | WebflowOptionalEditorialField;

/** Types Webflow acceptés par champ éditorial (incompatibilités détectées sinon). */
export const WEBFLOW_FIELD_TYPE_ALLOWLIST: Record<
  WebflowEditorialFieldKey,
  readonly string[]
> = {
  title: ["PlainText"],
  slug: ["PlainText"],
  content: ["RichText"],
  excerpt: ["PlainText", "RichText"],
  meta_title: ["PlainText"],
  meta_description: ["PlainText", "RichText"],
  featured_image: ["Image"],
  alt_text: ["PlainText"],
  category: ["PlainText", "Option", "Reference"],
  author: ["PlainText", "Reference"],
  reading_time: ["PlainText", "Number"],
};

export type WebflowFieldMappingEntry = {
  /** Identifiant stable du champ Webflow (préféré). */
  fieldId: string;
  /** Slug affiché — ne jamais supposer qu’il est identique d’un site à l’autre. */
  fieldSlug?: string | null;
  fieldType?: string | null;
  displayName?: string | null;
};

export type WebflowFieldMapping = Partial<
  Record<WebflowEditorialFieldKey, WebflowFieldMappingEntry | null>
>;

export type WebflowSiteSummary = {
  id: string;
  displayName: string;
  shortName: string | null;
};

export type WebflowCollectionSummary = {
  id: string;
  displayName: string;
  singularName: string | null;
  slug: string | null;
};

export type WebflowCollectionField = {
  id: string;
  displayName: string;
  slug: string | null;
  type: string;
  isRequired: boolean;
  isEditable: boolean;
  /** Collection cible d’un champ Reference (issu de validations API). */
  referencedCollectionId?: string | null;
};

export type WebflowCollectionDetails = WebflowCollectionSummary & {
  fields: WebflowCollectionField[];
};

export type WebflowMappingIssue = {
  code:
    | "missing_required"
    | "unknown_field"
    | "type_mismatch"
    | "required_collection_field_unmapped"
    | "invalid_entry";
  editorialField?: WebflowEditorialFieldKey;
  fieldId?: string;
  message: string;
};

export type WebflowMappingValidationResult = {
  ok: boolean;
  issues: WebflowMappingIssue[];
};
