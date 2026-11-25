import type { LanguageCode } from "@/lib/editorial-context";
import { LANGUAGE_OPTIONS } from "@/lib/editorial-context";
import type { WorkspaceCmsProvider } from "./constants";

/** Défauts produit V7.11.2 — WordPress FR, Webflow en-US. */
export const WORKSPACE_DEFAULT_LANGUAGE: Record<
  WorkspaceCmsProvider,
  LanguageCode
> = {
  wordpress: "fr",
  webflow: "en-US",
};

const LANGUAGE_CODES = new Set<string>(
  LANGUAGE_OPTIONS.map((option) => option.code)
);

/**
 * Normalise une langue workspace / formulaire vers un code LANGUAGE_OPTIONS.
 * Alias : fr-FR → fr ; en → en-US ; en-GB conservé.
 */
export function normalizeWorkspaceLanguage(
  value: string | null | undefined
): LanguageCode | null {
  const raw = (value ?? "").trim();
  if (!raw) {
    return null;
  }

  const compact = raw.replace(/_/g, "-");
  const lower = compact.toLowerCase();

  if (lower === "fr" || lower === "fr-fr" || lower === "french") {
    return "fr";
  }
  if (lower === "en-gb" || lower === "en-uk") {
    return "en-GB";
  }
  if (lower === "en" || lower === "en-us" || lower === "english") {
    return "en-US";
  }
  if (lower === "es" || lower === "es-es" || lower === "spanish") {
    return "es";
  }
  if (LANGUAGE_CODES.has(compact)) {
    return compact as LanguageCode;
  }
  if (LANGUAGE_CODES.has(raw)) {
    return raw as LanguageCode;
  }
  return null;
}

/** Langue de formulaire : code connu ou jeton « agent décide ». */
export function resolveFormLanguage(
  value: string | null | undefined,
  agentDecidesToken: string
): string {
  const normalized = normalizeWorkspaceLanguage(value);
  return normalized ?? agentDecidesToken;
}

export function defaultLanguageForCmsProvider(
  cmsProvider: WorkspaceCmsProvider
): LanguageCode {
  return WORKSPACE_DEFAULT_LANGUAGE[cmsProvider];
}

export function assertLanguageCode(value: unknown): LanguageCode {
  if (typeof value !== "string") {
    throw new Error("Langue éditoriale invalide.");
  }
  const normalized = normalizeWorkspaceLanguage(value);
  if (!normalized) {
    throw new Error("Langue éditoriale non reconnue.");
  }
  return normalized;
}
