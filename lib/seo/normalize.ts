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
]);

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
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
