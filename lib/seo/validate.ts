import { normalizeThemeLabel } from "./domains";
import { classifyContentType } from "./scoring";
import {
  type OpportunitySource,
  type RawOpportunityCandidate,
} from "./types";

function asString(value: unknown, max = 500): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, max);
}

function asSources(value: unknown): OpportunitySource[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const sources: OpportunitySource[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const title = asString(record.title, 200);
    const url = asString(record.url, 500);
    if (!title || !url) {
      continue;
    }
    if (!/^https?:\/\//i.test(url)) {
      continue;
    }
    sources.push({
      title,
      url,
      date: asString(record.date, 40),
    });
  }
  return sources.slice(0, 8);
}

export function validateOpportunityCandidate(
  value: unknown
): RawOpportunityCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const title = asString(record.title, 180);
  const subject = asString(record.subject, 500);
  const themeRaw = asString(record.theme, 120);
  if (!title || !subject || !themeRaw) {
    return null;
  }

  const theme = normalizeThemeLabel(themeRaw);
  const angle = asString(record.angle, 400);
  const searchIntent = asString(
    record.searchIntent ?? record.search_intent,
    200
  );

  const contentType = classifyContentType(
    record.contentType ?? record.content_type,
    { title, subject, searchIntent, angle }
  );

  return {
    title,
    subject,
    theme,
    angle,
    searchIntent,
    rationale: asString(record.rationale, 1000),
    sources: asSources(record.sources),
    naxialisService: asString(
      record.naxialisService ?? record.naxialis_service,
      120
    ),
    contentType,
  };
}

export function validateOpportunityList(
  value: unknown
): RawOpportunityCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: RawOpportunityCandidate[] = [];
  for (const item of value) {
    const parsed = validateOpportunityCandidate(item);
    if (parsed) {
      out.push(parsed);
    }
  }
  return out;
}

/** Extrait un tableau JSON depuis une réponse modèle éventuellement entourée de texte. */
export function extractJsonArray(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // continue
    }
  }

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}
