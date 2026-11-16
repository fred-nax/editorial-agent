import type { AgentToolParam } from "openai/resources/beta/agents/agents.js";

export const CREATE_WORDPRESS_DRAFT_TOOL_NAME =
  "create_wordpress_draft" as const;

export const agentSessionTools: AgentToolParam[] = [
  {
    type: "web_search",
    mode: "live",
    context_size: "medium",
  },
  {
    type: "function",
    name: CREATE_WORDPRESS_DRAFT_TOOL_NAME,
    description:
      "Crée un nouvel article WordPress en brouillon sur le site connecté, avec son contenu, ses catégories et ses métadonnées Slim SEO.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Titre WordPress de l'article",
        },
        content: {
          type: "string",
          description: "Contenu HTML complet de l'article",
        },
        excerpt: {
          type: "string",
          description: "Extrait court WordPress",
        },
        slug: {
          type: "string",
          description: "Slug WordPress",
        },
        meta_title: {
          type: "string",
          description:
            "Meta title Slim SEO, idéalement 50 à 60 caractères",
        },
        meta_description: {
          type: "string",
          description:
            "Meta description Slim SEO, idéalement 140 à 160 caractères",
        },
      },
      required: [
        "title",
        "content",
        "excerpt",
        "slug",
        "meta_title",
        "meta_description",
      ],
      additionalProperties: false,
    },
  },
];
