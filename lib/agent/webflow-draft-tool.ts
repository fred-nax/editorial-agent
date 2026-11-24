/**
 * Schéma create_webflow_draft (V7.10.1 — branché à la session Webflow).
 * Six paramètres obligatoires.
 */

import type { AgentToolParam } from "openai/resources/beta/agents/agents.js";

export const CREATE_WEBFLOW_DRAFT_TOOL_NAME = "create_webflow_draft" as const;

export const CREATE_WEBFLOW_DRAFT_REQUIRED_PARAMS = [
  "title",
  "content",
  "excerpt",
  "slug",
  "meta_title",
  "meta_description",
] as const;

/** Définition OpenAI function tool pour l’agent Webflow. */
export const createWebflowDraftToolDefinition = {
  type: "function" as const,
  name: CREATE_WEBFLOW_DRAFT_TOOL_NAME,
  description:
    "Obligatoire pour terminer la génération : crée un item brouillon Webflow (isDraft=true) dans la collection configurée avec title, content, excerpt, slug, meta_title et meta_description. Ne publie jamais. Ne remplace pas cet appel par une simple rédaction textuelle.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: [...CREATE_WEBFLOW_DRAFT_REQUIRED_PARAMS],
    properties: {
      title: { type: "string", description: "Titre de l’item CMS." },
      content: {
        type: "string",
        description:
          "Contenu Rich Text HTML (H2/H3, sans H1, sans script ni style inline).",
      },
      excerpt: { type: "string", description: "Résumé / excerpt." },
      slug: {
        type: "string",
        description: "Slug URL (minuscules, chiffres, tirets).",
      },
      meta_title: { type: "string", description: "Titre SEO." },
      meta_description: { type: "string", description: "Description SEO." },
    },
  },
} satisfies AgentToolParam;

export type WebflowDraftToolArgs = {
  title: string;
  content: string;
  excerpt: string;
  slug: string;
  meta_title: string;
  meta_description: string;
};

export function parseWebflowDraftArgs(raw: unknown): WebflowDraftToolArgs {
  const args = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!args || typeof args !== "object") {
    throw new Error("Arguments create_webflow_draft invalides.");
  }
  const record = args as Record<string, unknown>;
  return {
    title: String(record.title ?? ""),
    content: String(record.content ?? ""),
    excerpt: String(record.excerpt ?? ""),
    slug: String(record.slug ?? ""),
    meta_title: String(record.meta_title ?? ""),
    meta_description: String(record.meta_description ?? ""),
  };
}
