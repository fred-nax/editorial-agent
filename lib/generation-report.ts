import { languageLabel } from "./editorial-context";
import { VEILLE_KIND_LABELS, type VeilleKind } from "./veille/types";
import type { GenerationTrace, ObservedPage } from "./generation-trace";

export const UNRECORDED_TRACE_MESSAGE =
  "Traces non enregistrées pour cette génération.";

export const PENDING_TRACE_MESSAGE =
  "Les traces seront enregistrées à la fin de la génération.";

export const REPORT_DISCLAIMER =
  "Ce rapport retrace les événements disponibles. Il ne certifie pas la vérification de chaque affirmation de l'article.";

export const SEARCH_IS_NOT_CONSULTATION =
  "Une requête de recherche n'est pas une page consultée.";

const STATUS_NOTE =
  "Statut constaté au moment de la création. Il ne décrit pas l'état actuel du contenu.";

export type ReportLine = {
  label: string;
  value: string;
};

export type GenerationReportModel = {
  recorded: boolean;
  unrecordedMessage: string | null;
  contextLines: ReportLine[];
  searchObserved: boolean | null;
  queries: string[];
  queriesNote: string | null;
  pages: ObservedPage[];
  pagesNote: string | null;
  searchIsNotConsultation: string | null;
  callIds: string[];
  sessionId: string | null;
  wordpress: {
    id: string | null;
    url: string | null;
    statusAtCreation: string;
  };
  statusNote: string;
  disclaimer: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.replace(/\u0000/g, "").trim();
  return cleaned || null;
}

function httpUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function parseGenerationTrace(value: unknown): GenerationTrace | null {
  const record = asRecord(value);
  const context = asRecord(record?.context);
  const webSearch = asRecord(record?.webSearch);
  const pages = asRecord(record?.pages);
  const ids = asRecord(record?.ids);
  if (!record || record.version !== 1 || !context || !webSearch || !pages || !ids) {
    return null;
  }
  if (typeof context.subject !== "string") {
    return null;
  }

  const queries = Array.isArray(webSearch.queries)
    ? webSearch.queries
        .map((query) => text(query))
        .filter((query): query is string => Boolean(query))
    : [];
  const items = Array.isArray(pages.items)
    ? pages.items.flatMap((item) => {
        const page = asRecord(item);
        const url = httpUrl(page?.url);
        if (!page || !url) {
          return [];
        }
        const via: ObservedPage["via"] | null =
          page.via === "open_page"
            ? "open_page"
            : page.via === "find_in_page"
              ? "find_in_page"
              : null;
        if (!via) {
          return [];
        }
        return [{ url, via }];
      })
    : [];
  const callIds = Array.isArray(ids.webSearchCallIds)
    ? ids.webSearchCallIds.filter(
        (id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id)
      )
    : [];

  return {
    version: 1,
    context: {
      origin: text(context.origin),
      subject: context.subject,
      veilleContextTransmitted: context.veilleContextTransmitted === true,
      editorialContextTransmitted: context.editorialContextTransmitted === true,
      angle: text(context.angle),
      notes: text(context.notes),
      audience: text(context.audience),
      objective: text(context.objective),
      seoKeywords: text(context.seoKeywords),
      language: text(context.language),
      sourceUrl: httpUrl(context.sourceUrl),
      sourceTitle: text(context.sourceTitle),
      sourceName: text(context.sourceName),
      sourcePublishedOn: text(context.sourcePublishedOn),
      sourceKind: text(context.sourceKind),
    },
    webSearch: {
      observed: webSearch.observed === true,
      queries,
      truncated: webSearch.truncated === true,
    },
    pages: {
      items,
      truncated: pages.truncated === true,
    },
    ids: {
      sessionId:
        typeof ids.sessionId === "string" &&
        /^[A-Za-z0-9_-]{1,80}$/.test(ids.sessionId)
          ? ids.sessionId
          : null,
      webSearchCallIds: callIds,
    },
  };
}

function originLabel(origin: string | null): string {
  if (origin === "veille") {
    return "Veille éditoriale";
  }
  if (!origin) {
    return "Manuel ou SEO";
  }
  return origin;
}

function kindLabel(kind: string | null): string | null {
  if (!kind) {
    return null;
  }
  if (kind in VEILLE_KIND_LABELS) {
    return VEILLE_KIND_LABELS[kind as VeilleKind];
  }
  return kind;
}

function contextLines(trace: GenerationTrace): ReportLine[] {
  const context = trace.context;
  const lines: ReportLine[] = [
    { label: "Origine", value: originLabel(context.origin) },
    { label: "Titre demandé", value: context.subject },
  ];
  if (context.veilleContextTransmitted) {
    if (context.angle) {
      lines.push({ label: "Angle transmis", value: context.angle });
    }
    if (context.notes) {
      lines.push({ label: "Notes transmises", value: context.notes });
    }
    if (context.sourceTitle) {
      lines.push({ label: "Titre de la publication", value: context.sourceTitle });
    }
    if (context.sourceName) {
      lines.push({ label: "Média", value: context.sourceName });
    }
    if (context.sourceUrl) {
      lines.push({ label: "URL transmise", value: context.sourceUrl });
    }
    const hasPublication = Boolean(
      context.sourceTitle || context.sourceName || context.sourceUrl
    );
    if (context.sourcePublishedOn) {
      lines.push({
        label: "Date vérifiée",
        value: context.sourcePublishedOn,
      });
    } else if (hasPublication) {
      lines.push({ label: "Date vérifiée", value: "Non vérifiée" });
    }
    const kind = kindLabel(context.sourceKind);
    if (kind) {
      lines.push({ label: "Type de publication", value: kind });
    }
    return lines;
  }

  if (context.editorialContextTransmitted) {
    if (context.language) {
      const label = languageLabel(context.language);
      lines.push({
        label: "Langue de rédaction",
        value: label
          ? `${label} (${context.language})`
          : context.language,
      });
    }
    if (context.angle) {
      lines.push({ label: "Angle transmis", value: context.angle });
    }
    if (context.audience) {
      lines.push({ label: "Public cible", value: context.audience });
    }
    if (context.objective) {
      lines.push({ label: "Objectif éditorial", value: context.objective });
    }
    if (context.seoKeywords) {
      lines.push({ label: "Mots-clés suggérés", value: context.seoKeywords });
    }
    if (context.notes) {
      lines.push({ label: "Notes transmises", value: context.notes });
    }
    return lines;
  }

  lines.push({
    label: "Contexte documentaire",
    value: "Non transmis. Le sujet a été envoyé seul.",
  });
  return lines;
}

export function buildGenerationReport(input: {
  trace: unknown;
  status?: string | null;
  wpPostId?: number | null;
  wpUrl?: string | null;
  wpStatus?: string | null;
}): GenerationReportModel {
  const trace = parseGenerationTrace(input.trace);
  const wordpress = {
    id: input.wpPostId ? `#${input.wpPostId}` : null,
    url: httpUrl(input.wpUrl),
    statusAtCreation: text(input.wpStatus) ?? "non enregistré",
  };
  if (!trace) {
    const pending =
      input.status === "queued" || input.status === "running";
    return {
      recorded: false,
      unrecordedMessage: pending
        ? PENDING_TRACE_MESSAGE
        : UNRECORDED_TRACE_MESSAGE,
      contextLines: [],
      searchObserved: null,
      queries: [],
      queriesNote: null,
      pages: [],
      pagesNote: null,
      searchIsNotConsultation: null,
      callIds: [],
      sessionId: null,
      wordpress,
      statusNote: STATUS_NOTE,
      disclaimer: REPORT_DISCLAIMER,
    };
  }

  const queriesNote = trace.webSearch.queries.length
    ? trace.webSearch.truncated
      ? "La liste des requêtes a été limitée."
      : null
    : trace.webSearch.observed
      ? "Un appel web_search a été observé, sans requête lisible."
      : "Aucun appel web_search observé.";
  const pagesNote = trace.pages.items.length
    ? trace.pages.truncated
      ? "La liste des pages a été limitée."
      : null
    : "Aucune URL d'ouverture de page observée.";

  return {
    recorded: true,
    unrecordedMessage: null,
    contextLines: contextLines(trace),
    searchObserved: trace.webSearch.observed,
    queries: trace.webSearch.queries,
    queriesNote,
    pages: trace.pages.items,
    pagesNote,
    searchIsNotConsultation: SEARCH_IS_NOT_CONSULTATION,
    callIds: trace.ids.webSearchCallIds,
    sessionId: trace.ids.sessionId,
    wordpress,
    statusNote: STATUS_NOTE,
    disclaimer: REPORT_DISCLAIMER,
  };
}
