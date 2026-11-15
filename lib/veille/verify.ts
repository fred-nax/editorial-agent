import { classifyPublication } from "./classify";
import {
  MAX_THEME_LENGTH,
  MAX_VEILLE_RESULTS,
  VEILLE_COUNTRIES,
  VEILLE_NOTICE,
  VEILLE_PERIODS,
  type SearchReference,
  type VeilleArticle,
  type VeilleCountryCode,
  type VeillePeriod,
  type VeilleQuery,
  type VeilleSearchResult,
} from "./types";

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i;

export function countryByCode(code: string): (typeof VEILLE_COUNTRIES)[number] | null {
  return VEILLE_COUNTRIES.find((item) => item.code === code) ?? null;
}

export function validateVeilleQuery(
  value: unknown
): { ok: true; query: VeilleQuery } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Corps JSON invalide." };
  }
  const record = value as Record<string, unknown>;
  if ("agentId" in record || "agent_id" in record) {
    return { ok: false, error: "Paramètre de recherche invalide." };
  }

  if (typeof record.theme !== "string") {
    return { ok: false, error: "La thématique est obligatoire." };
  }
  const theme = record.theme.replace(/\s+/g, " ").trim();
  if (theme.length < 3) {
    return { ok: false, error: "La thématique doit contenir au moins 3 caractères." };
  }
  if (theme.length > MAX_THEME_LENGTH) {
    return {
      ok: false,
      error: `La thématique ne peut pas dépasser ${MAX_THEME_LENGTH} caractères.`,
    };
  }

  const period = record.periodDays;
  if (
    typeof period !== "number" ||
    !VEILLE_PERIODS.includes(period as VeillePeriod)
  ) {
    return { ok: false, error: "La période doit être 7, 30 ou 90 jours." };
  }

  const country = record.country;
  if (typeof country !== "string" || !countryByCode(country)) {
    return { ok: false, error: "Zone géographique non prise en charge." };
  }

  return {
    ok: true,
    query: {
      theme,
      periodDays: period as VeillePeriod,
      country: country as VeilleCountryCode,
    },
  };
}

/** Date calendaire indiquée par une métadonnée de publication, pas une date de modification. */
export function publishedCalendarDate(value: unknown, now: Date): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = value
    .trim()
    .match(
      /^(\d{4}-\d{2}-\d{2})(?:[tT\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
    );
  if (!match) {
    return null;
  }
  return strictCalendarDate(match[1], now);
}

export function strictCalendarDate(
  value: unknown,
  now: Date
): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  const today = now.toISOString().slice(0, 10);
  if (value > today) {
    return null;
  }
  return value;
}

export function ageInDays(isoDate: string, now: Date): number {
  const published = Date.parse(`${isoDate}T12:00:00.000Z`);
  return (now.getTime() - published) / 86_400_000;
}

export function normalizeArticleUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!host || host === "localhost" || host.endsWith(".local")) {
      return null;
    }
    const path = url.pathname.replace(/\/+$/, "") || "";
    const params = new URLSearchParams(url.search);
    for (const key of [...params.keys()]) {
      if (TRACKING_PARAM.test(key)) {
        params.delete(key);
      }
    }
    const query = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${key}=${item}`)
      .join("&");
    return `https://${host}${path}${query ? `?${query}` : ""}`;
  } catch {
    return null;
  }
}

function readReferenceDate(record: Record<string, unknown>, now: Date): string | null {
  return (
    strictCalendarDate(record.date, now) ??
    strictCalendarDate(record.published_at, now) ??
    strictCalendarDate(record.publishedAt, now)
  );
}

function pushReference(
  target: SearchReference[],
  url: unknown,
  title: unknown,
  date: string | null
) {
  if (typeof url !== "string") {
    return;
  }
  const normalized = normalizeArticleUrl(url);
  if (!normalized) {
    return;
  }
  target.push({
    url: normalized,
    title: typeof title === "string" && title.trim() ? title.trim() : null,
    date,
  });
}

export function collectSearchReferences(
  response: unknown,
  now: Date
): SearchReference[] {
  if (!response || typeof response !== "object") {
    return [];
  }
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return [];
  }
  const refs: SearchReference[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (record.type === "web_search_call" && record.action && typeof record.action === "object") {
      const action = record.action as Record<string, unknown>;
      if (action.type === "search" && Array.isArray(action.sources)) {
        for (const source of action.sources) {
          if (!source || typeof source !== "object") {
            continue;
          }
          const sourceRecord = source as Record<string, unknown>;
          pushReference(
            refs,
            sourceRecord.url,
            sourceRecord.title,
            readReferenceDate(sourceRecord, now)
          );
        }
      }
      if (action.type === "open_page" || action.type === "find_in_page") {
        pushReference(refs, action.url, null, readReferenceDate(action, now));
      }
    }
    if (record.type === "message" && Array.isArray(record.content)) {
      for (const part of record.content) {
        if (!part || typeof part !== "object") {
          continue;
        }
        const content = part as Record<string, unknown>;
        if (!Array.isArray(content.annotations)) {
          continue;
        }
        for (const annotation of content.annotations) {
          if (!annotation || typeof annotation !== "object") {
            continue;
          }
          const cited = annotation as Record<string, unknown>;
          if (cited.type !== "url_citation") {
            continue;
          }
          pushReference(refs, cited.url, cited.title, readReferenceDate(cited, now));
        }
      }
    }
  }
  return refs;
}

function asText(value: unknown, max: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) {
    return null;
  }
  return text.slice(0, max);
}

function pathDateOutsidePeriod(url: string, periodDays: number, now: Date): boolean {
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  const match = path.match(/(20\d{2})[/-](\d{2})[/-](\d{2})/);
  if (!match) {
    return false;
  }
  const found = strictCalendarDate(`${match[1]}-${match[2]}-${match[3]}`, now);
  return Boolean(found && ageInDays(found, now) > periodDays);
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

export function responseText(response: unknown): string {
  if (!response || typeof response !== "object") {
    return "";
  }
  const record = response as Record<string, unknown>;
  if (typeof record.output_text === "string") {
    return record.output_text;
  }
  if (!Array.isArray(record.output)) {
    return "";
  }
  const chunks: string[] = [];
  for (const item of record.output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const message = item as Record<string, unknown>;
    if (message.type !== "message" || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const content = part as Record<string, unknown>;
      if (content.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("\n");
}

export function buildVeilleArticles(input: {
  candidates: unknown;
  references: SearchReference[];
  periodDays: VeillePeriod;
  now: Date;
}): { articles: VeilleArticle[]; discarded: number; parsed: boolean } {
  if (!Array.isArray(input.candidates)) {
    return { articles: [], discarded: 0, parsed: false };
  }

  const referencesByUrl = new Map<string, SearchReference>();
  for (const reference of input.references) {
    const current = referencesByUrl.get(reference.url);
    if (!current || (!current.date && reference.date)) {
      referencesByUrl.set(reference.url, reference);
    }
  }

  const kept = new Map<string, VeilleArticle>();
  let discarded = 0;

  for (const candidate of input.candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      discarded += 1;
      continue;
    }
    const record = candidate as Record<string, unknown>;
    const title = asText(record.title, 180);
    const summary = asText(record.summary, 500);
    const rawUrl = typeof record.url === "string" ? record.url : "";
    const url = normalizeArticleUrl(rawUrl);
    if (!title || !summary || !url) {
      discarded += 1;
      continue;
    }
    const reference = referencesByUrl.get(url);
    if (!reference) {
      discarded += 1;
      continue;
    }
    if (pathDateOutsidePeriod(url, input.periodDays, input.now)) {
      discarded += 1;
      continue;
    }

    const claimed = strictCalendarDate(record.date, input.now);
    if (claimed && ageInDays(claimed, input.now) > input.periodDays) {
      discarded += 1;
      continue;
    }

    const verifiedDate =
      reference.date && ageInDays(reference.date, input.now) <= input.periodDays
        ? reference.date
        : null;
    if (reference.date && !verifiedDate) {
      discarded += 1;
      continue;
    }

    const sourceName = asText(record.source, 120) ?? hostLabel(url);
    const event = asText(record.event, 240);
    const article: VeilleArticle = {
      title,
      sourceName,
      url,
      summary,
      event,
      kind: classifyPublication({
        title,
        url,
        summary,
        event,
        hintedKind: record.kind,
      }),
      publishedOn: verifiedDate,
      dateVerified: Boolean(verifiedDate),
    };

    const previous = kept.get(url);
    if (!previous) {
      kept.set(url, article);
      continue;
    }
    discarded += 1;
    if (!previous.dateVerified && article.dateVerified) {
      kept.set(url, article);
    }
  }

  const ordered = [...kept.values()];
  const preferred = new Set(
    sortByVerifiedDate(ordered)
      .slice(0, MAX_VEILLE_RESULTS)
      .map((article) => article.url)
  );
  const articles = ordered.filter((article) => preferred.has(article.url));
  discarded += ordered.length - articles.length;
  return { articles, discarded, parsed: true };
}

export function sortByVerifiedDate(articles: VeilleArticle[]): VeilleArticle[] {
  return articles
    .map((article, index) => ({ article, index }))
    .sort((left, right) => {
      if (left.article.dateVerified && right.article.dateVerified) {
        return right.article.publishedOn!.localeCompare(left.article.publishedOn!);
      }
      if (left.article.dateVerified) {
        return -1;
      }
      if (right.article.dateVerified) {
        return 1;
      }
      return left.index - right.index;
    })
    .map((item) => item.article);
}

export function emptyVeilleResult(
  query: VeilleQuery,
  incomplete: boolean
): VeilleSearchResult {
  const country = countryByCode(query.country);
  return {
    theme: query.theme,
    periodDays: query.periodDays,
    country: country?.label ?? query.country,
    articles: [],
    discarded: 0,
    incomplete,
    notice: VEILLE_NOTICE,
  };
}
