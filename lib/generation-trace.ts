import {
  transmittedContextSnapshot,
  type GenerationContextInput,
  type TransmittedContextSnapshot,
} from "./topics/build-generation-context";

export const MAX_TRACE_QUERIES = 20;
export const MAX_TRACE_QUERY_LENGTH = 240;
export const MAX_TRACE_PAGES = 20;
export const MAX_TRACE_URL_LENGTH = 500;
export const MAX_TRACE_CALL_IDS = 20;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export type ObservedPage = {
  url: string;
  via: "open_page" | "find_in_page";
};

export type GenerationEventTrace = {
  webSearch: {
    observed: boolean;
    queries: string[];
    truncated: boolean;
  };
  pages: {
    items: ObservedPage[];
    truncated: boolean;
  };
  ids: {
    sessionId: string | null;
    webSearchCallIds: string[];
  };
};

export type GenerationTrace = {
  version: 1;
  context: TransmittedContextSnapshot;
  webSearch: GenerationEventTrace["webSearch"];
  pages: GenerationEventTrace["pages"];
  ids: GenerationEventTrace["ids"];
};

export type EventTraceState = {
  observed: boolean;
  queries: string[];
  queryKeys: Set<string>;
  queriesTruncated: boolean;
  pages: ObservedPage[];
  pageKeys: Set<string>;
  pagesTruncated: boolean;
  callIds: string[];
  callIdKeys: Set<string>;
  sessionId: string | null;
};

const eventsSymbol = Symbol.for("naxialis.generationEvents");
const wpStatusSymbol = Symbol.for("naxialis.generationWpStatus");
const wpPostIdSymbol = Symbol.for("naxialis.generationWpPostId");
const wpUrlSymbol = Symbol.for("naxialis.generationWpUrl");

export function createEventTraceState(): EventTraceState {
  return {
    observed: false,
    queries: [],
    queryKeys: new Set(),
    queriesTruncated: false,
    pages: [],
    pageKeys: new Set(),
    pagesTruncated: false,
    callIds: [],
    callIdKeys: new Set(),
    sessionId: null,
  };
}

export function emptyEventTrace(): GenerationEventTrace {
  return {
    webSearch: { observed: false, queries: [], truncated: false },
    pages: { items: [], truncated: false },
    ids: { sessionId: null, webSearchCallIds: [] },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function plainText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return null;
  }
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength).trimEnd()}…`;
}

function safeId(value: unknown): string | null {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    return null;
  }
  return value;
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const raw = value.replace(/\u0000/g, "").trim();
  if (!raw || raw.length > MAX_TRACE_URL_LENGTH) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.username = "";
    url.password = "";
    const serialized = url.toString();
    if (serialized.length > MAX_TRACE_URL_LENGTH) {
      return null;
    }
    return serialized;
  } catch {
    return null;
  }
}

function rememberQuery(state: EventTraceState, value: unknown): void {
  const query = plainText(value, MAX_TRACE_QUERY_LENGTH);
  if (!query) {
    return;
  }
  if (typeof value === "string" && value.trim().length > MAX_TRACE_QUERY_LENGTH) {
    state.queriesTruncated = true;
  }
  if (state.queryKeys.has(query)) {
    return;
  }
  if (state.queries.length >= MAX_TRACE_QUERIES) {
    state.queriesTruncated = true;
    return;
  }
  state.queryKeys.add(query);
  state.queries.push(query);
}

function rememberPage(
  state: EventTraceState,
  via: ObservedPage["via"],
  value: unknown
): void {
  if (typeof value === "string" && value.trim().length > MAX_TRACE_URL_LENGTH) {
    state.pagesTruncated = true;
  }
  const url = safeHttpUrl(value);
  if (!url) {
    return;
  }
  const key = `${via}\n${url}`;
  if (state.pageKeys.has(key)) {
    return;
  }
  if (state.pages.length >= MAX_TRACE_PAGES) {
    state.pagesTruncated = true;
    return;
  }
  state.pageKeys.add(key);
  state.pages.push({ url, via });
}

function rememberCallId(state: EventTraceState, value: unknown): void {
  const id = safeId(value);
  if (!id || state.callIdKeys.has(id)) {
    return;
  }
  if (state.callIds.length >= MAX_TRACE_CALL_IDS) {
    return;
  }
  state.callIdKeys.add(id);
  state.callIds.push(id);
}

function observeWebSearchItem(
  state: EventTraceState,
  item: Record<string, unknown>
): void {
  state.observed = true;
  rememberCallId(state, item.id);
  const action = asRecord(item.action);
  if (!action || action.type === "search") {
    if (action?.type === "search") {
      rememberQuery(state, action.query);
      if (Array.isArray(action.queries)) {
        for (const query of action.queries) {
          rememberQuery(state, query);
        }
      }
    }
    return;
  }
  if (action.type === "open_page") {
    rememberPage(state, "open_page", action.url);
    return;
  }
  if (action.type === "find_in_page") {
    rememberPage(state, "find_in_page", action.url);
  }
}

export function observeAgentEvent(state: EventTraceState, event: unknown): void {
  try {
    const record = asRecord(event);
    if (!record || typeof record.type !== "string") {
      return;
    }
    if (record.type.includes("reasoning")) {
      return;
    }
    if (record.type === "agent.session.created") {
      const session = asRecord(record.session);
      const sessionId = safeId(session?.id);
      if (sessionId) {
        state.sessionId = sessionId;
      }
      return;
    }
    if (
      record.type !== "agent.session.turn.item.added" &&
      record.type !== "agent.session.turn.item.done"
    ) {
      return;
    }
    const item = asRecord(record.item);
    if (item?.type === "web_search_call") {
      observeWebSearchItem(state, item);
    }
  } catch {
    // Une trace illisible ne doit pas interrompre la génération.
  }
}

export function eventTraceFromState(
  state: EventTraceState,
  sessionId?: string | null
): GenerationEventTrace {
  const resolvedSession = safeId(sessionId) ?? state.sessionId;
  return {
    webSearch: {
      observed: state.observed,
      queries: [...state.queries],
      truncated: state.queriesTruncated,
    },
    pages: {
      items: state.pages.map((page) => ({ url: page.url, via: page.via })),
      truncated: state.pagesTruncated,
    },
    ids: {
      sessionId: resolvedSession,
      webSearchCallIds: [...state.callIds],
    },
  };
}

export function contextSnapshot(
  input: GenerationContextInput
): TransmittedContextSnapshot {
  return transmittedContextSnapshot(input);
}

export function assembleGenerationTrace(
  context: TransmittedContextSnapshot,
  events: GenerationEventTrace | null | undefined
): GenerationTrace {
  const source = events ?? emptyEventTrace();
  return {
    version: 1,
    context: { ...context },
    webSearch: {
      observed: source.webSearch.observed,
      queries: [...source.webSearch.queries],
      truncated: source.webSearch.truncated,
    },
    pages: {
      items: source.pages.items.map((page) => ({ url: page.url, via: page.via })),
      truncated: source.pages.truncated,
    },
    ids: {
      sessionId: source.ids.sessionId,
      webSearchCallIds: [...source.ids.webSearchCallIds],
    },
  };
}

function cleanWpStatus(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.replace(/[^\w-]/g, "").slice(0, 32);
  return cleaned || null;
}

export function attachObservedEvents(
  error: unknown,
  events: GenerationEventTrace,
  wpStatus: string | null,
  wordpress?: { postId?: number | null; link?: string | null }
): void {
  if (!error || typeof error !== "object") {
    return;
  }
  try {
    Object.defineProperty(error, eventsSymbol, {
      value: events,
      enumerable: false,
    });
    const status = cleanWpStatus(wpStatus);
    if (status) {
      Object.defineProperty(error, wpStatusSymbol, {
        value: status,
        enumerable: false,
      });
    }
    if (typeof wordpress?.postId === "number" && Number.isInteger(wordpress.postId)) {
      Object.defineProperty(error, wpPostIdSymbol, {
        value: wordpress.postId,
        enumerable: false,
      });
    }
    const link = safeHttpUrl(wordpress?.link);
    if (link) {
      Object.defineProperty(error, wpUrlSymbol, {
        value: link,
        enumerable: false,
      });
    }
  } catch {
    // La génération continue même si l'erreur ne peut pas porter la trace.
  }
}

export function readFailureTrace(error: unknown): {
  events: GenerationEventTrace | null;
  wpStatus: string | null;
  wpPostId: number | null;
  wpUrl: string | null;
} {
  if (!error || typeof error !== "object") {
    return { events: null, wpStatus: null, wpPostId: null, wpUrl: null };
  }
  const record = error as Record<symbol, unknown>;
  const events = record[eventsSymbol];
  const postId = record[wpPostIdSymbol];
  return {
    events:
      events && typeof events === "object"
        ? (events as GenerationEventTrace)
        : null,
    wpStatus: cleanWpStatus(record[wpStatusSymbol]),
    wpPostId: typeof postId === "number" && Number.isInteger(postId) ? postId : null,
    wpUrl: safeHttpUrl(record[wpUrlSymbol]),
  };
}

export function completedTraceUpdate(
  context: TransmittedContextSnapshot,
  events: GenerationEventTrace | null | undefined,
  wpStatus: string
) {
  return {
    trace: assembleGenerationTrace(context, events),
    wpStatus: cleanWpStatus(wpStatus),
  };
}

export function failedTraceUpdate(
  context: TransmittedContextSnapshot,
  error: unknown
) {
  const failure = readFailureTrace(error);
  return {
    trace: assembleGenerationTrace(context, failure.events),
    wpStatus: failure.wpStatus,
    wpPostId: failure.wpPostId,
    wpUrl: failure.wpUrl,
  };
}
