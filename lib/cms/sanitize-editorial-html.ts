/**
 * Sanitisation HTML éditorial avant envoi CMS / aperçu sécurisé (CMS-005).
 * Conserve titres, paragraphes, tableaux, classes Tailwind, liens, listes,
 * FAQ (details/summary) — bloque scripts, handlers, javascript:, iframes actifs.
 */

import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "hr",
  "div",
  "span",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "sub",
  "sup",
  "blockquote",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "colgroup",
  "col",
  "a",
  "img",
  "figure",
  "figcaption",
  "details",
  "summary",
  "section",
  "article",
  "header",
  "footer",
  "nav",
  "aside",
];

const URI_SAFE = {
  a: ["href", "name", "target", "rel", "title", "class", "id"],
  img: ["src", "alt", "title", "width", "height", "class", "id", "loading"],
};

function isSafeUri(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.startsWith("#") || trimmed.startsWith("/")) return true;
  if (
    trimmed.startsWith("https:") ||
    trimmed.startsWith("http:") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:")
  ) {
    return true;
  }
  // data: images seulement (pas de SVG scriptable)
  if (trimmed.startsWith("data:image/")) {
    return !trimmed.includes("svg");
  }
  return false;
}

export type SanitizeEditorialHtmlResult = {
  html: string;
  modified: boolean;
};

/**
 * Nettoie le HTML éditorial. Idempotent sur contenu déjà sain.
 */
export function sanitizeEditorialHtml(raw: string): SanitizeEditorialHtmlResult {
  const input = typeof raw === "string" ? raw : "";
  const cleaned = sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      ...URI_SAFE,
      "*": ["class", "id", "title", "lang", "dir", "role"],
      td: ["colspan", "rowspan", "class", "id", "headers", "scope"],
      th: ["colspan", "rowspan", "class", "id", "headers", "scope"],
      col: ["span", "class"],
      ol: ["start", "type", "class", "id"],
      details: ["open", "class", "id"],
      table: ["class", "id", "role"],
    },
    allowVulnerableTags: false,
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {
      img: ["http", "https", "data"],
    },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href ?? "";
        if (href && !isSafeUri(href)) {
          const { href: _drop, ...rest } = attribs;
          return { tagName, attribs: rest };
        }
        const next = { ...attribs };
        if (next.target === "_blank" && !next.rel) {
          next.rel = "noopener noreferrer";
        }
        return { tagName, attribs: next };
      },
      img: (tagName, attribs) => {
        const src = attribs.src ?? "";
        if (src && !isSafeUri(src)) {
          return { tagName: "span", attribs: { class: attribs.class ?? "" } };
        }
        return { tagName, attribs };
      },
    },
    // Pas de style inline arbitraire (réduit XSS CSS).
    allowedStyles: {},
    disallowedTagsMode: "discard",
  });

  return {
    html: cleaned,
    modified: cleaned !== input,
  };
}
