/**
 * Validation du contenu HTML destiné à un champ Rich Text Webflow.
 * Indépendante de la validation WordPress.
 */

export type WebflowContentValidationIssue = {
  code:
    | "empty_content"
    | "has_h1"
    | "dangerous_html"
    | "inline_style"
    | "missing_headings"
    | "invalid_title"
    | "invalid_slug";
  message: string;
};

export type WebflowDraftPayload = {
  title: string;
  content: string;
  excerpt: string;
  slug: string;
  meta_title: string;
  meta_description: string;
};

const DANGEROUS_TAG_RE =
  /<\s*(script|style|iframe|object|embed|form|link|meta|base|svg\s[^>]*onload)\b/i;
const EVENT_HANDLER_RE = /\son[a-z]+\s*=/i;
const JAVASCRIPT_URL_RE = /\shref\s*=\s*["']?\s*javascript:/i;
const INLINE_STYLE_RE = /\sstyle\s*=/i;
const H1_RE = /<\s*h1\b/i;
const H2_OR_H3_RE = /<\s*h[23]\b/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateWebflowDraftPayload(
  input: WebflowDraftPayload
): WebflowContentValidationIssue[] {
  const issues: WebflowContentValidationIssue[] = [];
  const title = input.title.trim();
  const slug = input.slug.trim();
  const content = input.content.trim();

  if (!title || title.length < 3 || title.length > 200) {
    issues.push({
      code: "invalid_title",
      message: "Titre Webflow invalide (3–200 caractères requis).",
    });
  }

  if (!slug || slug.length > 120 || !SLUG_RE.test(slug)) {
    issues.push({
      code: "invalid_slug",
      message:
        "Slug Webflow invalide (minuscules, chiffres et tirets uniquement).",
    });
  }

  if (!content) {
    issues.push({
      code: "empty_content",
      message: "Contenu Rich Text vide.",
    });
    return issues;
  }

  if (H1_RE.test(content)) {
    issues.push({
      code: "has_h1",
      message: "Le contenu ne doit pas contenir de balise H1.",
    });
  }

  if (
    DANGEROUS_TAG_RE.test(content) ||
    EVENT_HANDLER_RE.test(content) ||
    JAVASCRIPT_URL_RE.test(content)
  ) {
    issues.push({
      code: "dangerous_html",
      message:
        "HTML dangereux détecté (script, style, iframe, handlers ou javascript:).",
    });
  }

  if (INLINE_STYLE_RE.test(content)) {
    issues.push({
      code: "inline_style",
      message: "Les styles inline sont interdits dans le contenu Webflow.",
    });
  }

  if (!H2_OR_H3_RE.test(content)) {
    issues.push({
      code: "missing_headings",
      message: "Le contenu doit inclure une structure avec H2 ou H3.",
    });
  }

  for (const key of [
    "excerpt",
    "meta_title",
    "meta_description",
  ] as const) {
    if (!String(input[key] ?? "").trim()) {
      issues.push({
        code: "invalid_title",
        message: `Paramètre obligatoire « ${key} » manquant.`,
      });
    }
  }

  return issues;
}

export function assertValidWebflowDraftPayload(
  input: WebflowDraftPayload
): void {
  const issues = validateWebflowDraftPayload(input);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join(" "));
  }
}
