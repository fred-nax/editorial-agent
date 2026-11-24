/**
 * Schéma futur de create_webflow_draft (V7.10.0 — non branché à la session).
 * Six paramètres obligatoires ; aucune exécution / génération Webflow dans cette version.
 */

export const CREATE_WEBFLOW_DRAFT_TOOL_NAME = "create_webflow_draft" as const;

export const CREATE_WEBFLOW_DRAFT_REQUIRED_PARAMS = [
  "title",
  "content",
  "excerpt",
  "slug",
  "meta_title",
  "meta_description",
] as const;

/** Définition OpenAI function tool — réservée à une version ultérieure. */
export const createWebflowDraftToolDefinition = {
  type: "function" as const,
  name: CREATE_WEBFLOW_DRAFT_TOOL_NAME,
  description:
    "Crée un item brouillon dans la collection Webflow configurée (non activé en V7.10.0).",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: [...CREATE_WEBFLOW_DRAFT_REQUIRED_PARAMS],
    properties: {
      title: { type: "string", description: "Titre de l’item CMS." },
      content: { type: "string", description: "Contenu Rich Text HTML." },
      excerpt: { type: "string", description: "Résumé / excerpt." },
      slug: { type: "string", description: "Slug URL de l’item." },
      meta_title: { type: "string", description: "Titre SEO." },
      meta_description: { type: "string", description: "Description SEO." },
    },
  },
  strict: true,
};

/** Garde explicite : la création distante n’est pas disponible. */
export function assertWebflowDraftCreationDisabled(): never {
  throw new Error(
    "Création Webflow non activée. Validez d’abord la connexion et le mapping des champs (V7.10.0 lecture seule)."
  );
}
