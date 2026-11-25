const STOP_WORDS = new Set([
  "le",
  "la",
  "les",
  "un",
  "une",
  "des",
  "de",
  "du",
  "et",
  "ou",
  "a",
  "à",
  "au",
  "aux",
  "en",
  "dans",
  "pour",
  "par",
  "sur",
  "avec",
  "sans",
  "ce",
  "ces",
  "cette",
  "son",
  "sa",
  "ses",
  "qui",
  "que",
  "quoi",
  "comment",
  "pourquoi",
  "the",
  "and",
  "or",
  "for",
  "with",
  "from",
  "into",
  "your",
  "our",
  // Anglais (V7.12.1 — similarité FR/EN locale)
  "of",
  "to",
  "in",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "as",
  "by",
  "an",
  "on",
  "at",
  "this",
  "that",
  "these",
  "those",
  "how",
  "what",
  "why",
  "when",
  "where",
  "which",
  "who",
  "will",
  "can",
  "could",
  "should",
  "would",
  "about",
  "over",
  "after",
  "before",
  "between",
  "through",
  "their",
  "them",
  "they",
  "than",
  "then",
  "too",
  "very",
  "just",
  "also",
  "more",
  "most",
  "other",
  "some",
  "such",
  "only",
  "own",
  "same",
  "into",
  "out",
  "up",
  "down",
  "not",
  "no",
  "yes",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "its",
  "it",
]);

/**
 * Décode les entités HTML courantes (WordPress title.rendered / excerpt).
 * Idempotent sur une chaîne déjà décodée ; ne pas boucler sans nécessité.
 */
export function decodeHtmlEntities(value: string): string {
  if (!value || !value.includes("&")) {
    return value;
  }
  return value
    .replace(/&rsquo;|&#8217;|&#x2019;/gi, "'")
    .replace(/&lsquo;|&#8216;|&#x2018;/gi, "'")
    .replace(/&rdquo;|&#8221;|&#x201d;/gi, '"')
    .replace(/&ldquo;|&#8220;|&#x201c;/gi, '"')
    .replace(/&hellip;|&#8230;/gi, "…")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&lt;|&#60;/gi, "<")
    .replace(/&gt;|&#62;/gi, ">")
    .replace(/&eacute;|&#233;/gi, "é")
    .replace(/&Eacute;|&#201;/gi, "É")
    .replace(/&agrave;|&#224;/gi, "à")
    .replace(/&egrave;|&#232;/gi, "è")
    .replace(/&ecirc;|&#234;/gi, "ê")
    .replace(/&ccedil;|&#231;/gi, "ç")
    .replace(/&uuml;|&#252;/gi, "ü")
    .replace(/&ouml;|&#246;/gi, "ö")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    })
    .replace(/&amp;/gi, "&");
}

export function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, "-").replace(/-+/g, "-");
}

export function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}
