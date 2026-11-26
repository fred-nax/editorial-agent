/**
 * Marqueur non destructif dans ArticleGeneration.trace (JSON existant)
 * lorsqu’une consommation OpenAI observable n’a pas pu être enregistrée.
 * Aucune migration Prisma supplémentaire.
 */

export const USAGE_TRACKING_TRACE_KEY = "usageTracking";

export type UsageTrackingFailure = {
  ok: false;
  at: string;
  operationType: string;
  error: string;
};

export type UsageTrackingTraceState = {
  failures: UsageTrackingFailure[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function readUsageTrackingFromTrace(
  trace: unknown
): UsageTrackingTraceState | null {
  const root = asRecord(trace);
  const block = asRecord(root?.[USAGE_TRACKING_TRACE_KEY]);
  if (!block) {
    return null;
  }
  const failuresRaw = block.failures;
  if (!Array.isArray(failuresRaw)) {
    return { failures: [] };
  }
  const failures: UsageTrackingFailure[] = [];
  for (const item of failuresRaw) {
    const row = asRecord(item);
    if (!row || row.ok !== false) {
      continue;
    }
    if (typeof row.operationType !== "string" || typeof row.error !== "string") {
      continue;
    }
    failures.push({
      ok: false,
      at: typeof row.at === "string" ? row.at : "",
      operationType: row.operationType,
      error: row.error.slice(0, 240),
    });
  }
  return { failures };
}

/** Fusionne un échec de tracking dans un objet trace existant (sans prompts). */
export function mergeUsageTrackingFailure(
  trace: unknown,
  failure: Omit<UsageTrackingFailure, "ok" | "at"> & { at?: string }
): Record<string, unknown> {
  const root = asRecord(trace) ? { ...asRecord(trace)! } : {};
  const previous = readUsageTrackingFromTrace(root) ?? { failures: [] };
  const nextFailure: UsageTrackingFailure = {
    ok: false,
    at: failure.at ?? new Date().toISOString(),
    operationType: failure.operationType,
    error: failure.error.slice(0, 240),
  };
  root[USAGE_TRACKING_TRACE_KEY] = {
    failures: [...previous.failures, nextFailure].slice(-10),
  };
  return root;
}
