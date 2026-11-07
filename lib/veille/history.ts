import { handleVeilleSearch, type VeilleDateConfirmation, type VeilleSearchClient } from "./search";
import {
  VEILLE_COUNTRIES,
  VEILLE_KINDS,
  VEILLE_PERIODS,
  type VeilleArticle,
  type VeilleCountryCode,
  type VeilleKind,
  type VeillePeriod,
  type VeilleSearchResult,
} from "./types";

export const WATCH_HISTORY_PAGE_SIZE = 20;

export type WatchSearchSnapshot = {
  articles: VeilleArticle[];
  discarded: number;
  incomplete: boolean;
  notice: string;
};

export type WatchSearchSummary = {
  id: string;
  theme: string;
  periodDays: VeillePeriod;
  country: VeilleCountryCode;
  countryLabel: string;
  searchedAt: string;
  articleCount: number;
  status: "completed";
};

export type WatchSearchRecord = WatchSearchSummary & {
  result: VeilleSearchResult;
};

export type WatchHistoryStore = {
  save: (input: {
    theme: string;
    periodDays: VeillePeriod;
    country: VeilleCountryCode;
    searchedAt: Date;
    articleCount: number;
    snapshot: WatchSearchSnapshot;
  }) => Promise<WatchSearchSummary>;
  list: (
    page: number,
    pageSize: number
  ) => Promise<{ items: WatchSearchSummary[]; total: number }>;
  read: (id: string) => Promise<WatchSearchRecord | null>;
  delete: (id: string) => Promise<boolean>;
};

const SEARCH_ID = /^c[a-z0-9]{20,32}$/;

export function isWatchSearchId(value: string): boolean {
  return SEARCH_ID.test(value);
}

function countryByLabel(label: string): (typeof VEILLE_COUNTRIES)[number] | null {
  return (
    VEILLE_COUNTRIES.find((item) => item.label === label || item.code === label) ?? null
  );
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > max) {
    return null;
  }
  return cleaned;
}

function articleFromSnapshot(value: unknown): VeilleArticle | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const title = text(record.title, 180);
  const sourceName = text(record.sourceName, 120);
  const summary = text(record.summary, 500);
  const url = text(record.url, 500);
  const kind = VEILLE_KINDS.includes(record.kind as VeilleKind)
    ? (record.kind as VeilleKind)
    : null;
  if (!title || !sourceName || !summary || !url || !kind) {
    return null;
  }
  if (!/^https?:\/\//i.test(url)) {
    return null;
  }
  let event: string | null = null;
  if (record.event !== null && record.event !== undefined) {
    event = text(record.event, 240);
    if (!event) {
      return null;
    }
  }
  const dateVerified = record.dateVerified === true;
  const publishedOn =
    typeof record.publishedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.publishedOn)
      ? record.publishedOn
      : null;
  if (dateVerified !== Boolean(publishedOn && dateVerified)) {
    return null;
  }
  if (!dateVerified && record.publishedOn != null) {
    return null;
  }
  return {
    title,
    sourceName,
    url,
    summary,
    event,
    kind,
    publishedOn: dateVerified ? publishedOn : null,
    dateVerified,
  };
}

export function parseWatchSnapshot(value: unknown): WatchSearchSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const notice = text(record.notice, 500);
  const discarded = record.discarded;
  if (
    !notice ||
    typeof record.incomplete !== "boolean" ||
    typeof discarded !== "number" ||
    !Number.isInteger(discarded) ||
    discarded < 0 ||
    discarded > 1000 ||
    !Array.isArray(record.articles) ||
    record.articles.length > 12
  ) {
    return null;
  }
  const articles: VeilleArticle[] = [];
  for (const item of record.articles) {
    const article = articleFromSnapshot(item);
    if (!article) {
      return null;
    }
    articles.push(article);
  }
  return {
    articles,
    discarded,
    incomplete: record.incomplete,
    notice,
  };
}

export function snapshotFromResult(result: VeilleSearchResult): WatchSearchSnapshot {
  return {
    articles: result.articles,
    discarded: result.discarded,
    incomplete: result.incomplete,
    notice: result.notice,
  };
}

export function resultFromSnapshot(
  summary: Pick<WatchSearchSummary, "theme" | "periodDays" | "country">,
  snapshot: WatchSearchSnapshot
): VeilleSearchResult {
  const country = VEILLE_COUNTRIES.find((item) => item.code === summary.country);
  return {
    theme: summary.theme,
    periodDays: summary.periodDays,
    country: country?.label ?? summary.country,
    articles: snapshot.articles,
    discarded: snapshot.discarded,
    incomplete: snapshot.incomplete,
    notice: snapshot.notice,
  };
}

export function isVeillePeriod(value: number): value is VeillePeriod {
  return (VEILLE_PERIODS as readonly number[]).includes(value);
}

export function isVeilleCountry(value: string): value is VeilleCountryCode {
  return VEILLE_COUNTRIES.some((item) => item.code === value);
}

export type WatchHandlerResult<T> = {
  status: number;
  body: T;
};

export async function completeVeilleSearch(
  request: Request,
  deps: {
    authenticated: boolean;
    client: VeilleSearchClient;
    now?: Date;
    confirmDates?: VeilleDateConfirmation;
    store: WatchHistoryStore;
  }
): Promise<WatchHandlerResult<{ result?: VeilleSearchResult; searchId?: string; error?: string }>> {
  const outcome = await handleVeilleSearch(request, deps);
  if (outcome.status !== 200 || !outcome.body.result) {
    return outcome;
  }
  const result = outcome.body.result;
  const country = countryByLabel(result.country);
  if (!country) {
    return {
      status: 500,
      body: { error: "Les résultats n’ont pas pu être enregistrés." },
    };
  }
  try {
    const saved = await deps.store.save({
      theme: result.theme,
      periodDays: result.periodDays,
      country: country.code,
      searchedAt: deps.now ?? new Date(),
      articleCount: result.articles.length,
      snapshot: snapshotFromResult(result),
    });
    return { status: 200, body: { result, searchId: saved.id } };
  } catch {
    return {
      status: 500,
      body: { error: "Les résultats n’ont pas pu être enregistrés." },
    };
  }
}

function pageNumber(value: string | null): number | null {
  if (value === null || value === "") {
    return 1;
  }
  if (!/^[1-9]\d{0,4}$/.test(value)) {
    return null;
  }
  return Number(value);
}

export async function handleListWatchSearches(
  url: URL,
  deps: { authenticated: boolean; store: WatchHistoryStore }
): Promise<
  WatchHandlerResult<{
    searches?: WatchSearchSummary[];
    page?: number;
    pageSize?: number;
    total?: number;
    error?: string;
  }>
> {
  if (!deps.authenticated) {
    return { status: 401, body: { error: "Unauthorized" } };
  }
  const page = pageNumber(url.searchParams.get("page"));
  if (!page) {
    return { status: 400, body: { error: "La page demandée est invalide." } };
  }
  try {
    const listed = await deps.store.list(page, WATCH_HISTORY_PAGE_SIZE);
    return {
      status: 200,
      body: {
        searches: listed.items,
        page,
        pageSize: WATCH_HISTORY_PAGE_SIZE,
        total: listed.total,
      },
    };
  } catch {
    return {
      status: 500,
      body: { error: "Les recherches enregistrées n’ont pas pu être lues." },
    };
  }
}

export async function handleReadWatchSearch(
  id: string,
  deps: { authenticated: boolean; store: WatchHistoryStore }
): Promise<WatchHandlerResult<{ search?: WatchSearchRecord; error?: string }>> {
  if (!deps.authenticated) {
    return { status: 401, body: { error: "Unauthorized" } };
  }
  if (!isWatchSearchId(id)) {
    return { status: 400, body: { error: "Identifiant de recherche invalide." } };
  }
  try {
    const search = await deps.store.read(id);
    if (!search) {
      return { status: 404, body: { error: "Cette recherche enregistrée est introuvable." } };
    }
    return { status: 200, body: { search } };
  } catch {
    return {
      status: 500,
      body: { error: "Cette recherche enregistrée est illisible." },
    };
  }
}

export async function handleDeleteWatchSearch(
  id: string,
  deps: { authenticated: boolean; store: WatchHistoryStore }
): Promise<WatchHandlerResult<{ deleted?: boolean; error?: string }>> {
  if (!deps.authenticated) {
    return { status: 401, body: { error: "Unauthorized" } };
  }
  if (!isWatchSearchId(id)) {
    return { status: 400, body: { error: "Identifiant de recherche invalide." } };
  }
  try {
    const deleted = await deps.store.delete(id);
    if (!deleted) {
      return { status: 404, body: { error: "Cette recherche enregistrée est introuvable." } };
    }
    return { status: 200, body: { deleted: true } };
  } catch {
    return {
      status: 500,
      body: { error: "La recherche n’a pas pu être supprimée." },
    };
  }
}
