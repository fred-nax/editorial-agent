/**
 * SEC-003 — throttle applicatif des routes OpenAI / actions payantes (session).
 * Mémoire processus : simple, sans Redis. Reset au redémarrage Next (acceptable admin unique).
 */

export type PaidRouteRateLimitConfig = {
  maxRequests: number;
  windowMs: number;
};

export type PaidRouteRateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number | null;
  bucketKey: string;
};

const DEFAULTS: PaidRouteRateLimitConfig = {
  maxRequests: 30,
  windowMs: 60 * 60 * 1000,
};

type Bucket = {
  count: number;
  windowStartedAt: number;
};

const buckets = new Map<string, Bucket>();

export function readPaidRouteRateLimitConfig(
  env: NodeJS.ProcessEnv = process.env
): PaidRouteRateLimitConfig {
  return {
    maxRequests: parsePositiveInt(
      env.OPENAI_PAID_ROUTE_MAX_PER_HOUR,
      DEFAULTS.maxRequests
    ),
    windowMs: parsePositiveInt(
      env.OPENAI_PAID_ROUTE_WINDOW_MS,
      DEFAULTS.windowMs
    ),
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export function buildPaidRouteBucketKey(input: {
  workspaceId: string;
  routeKey: string;
  actor?: string;
}): string {
  const actor = (input.actor ?? "admin").trim().toLowerCase() || "admin";
  return `${input.workspaceId}|${input.routeKey}|${actor}`;
}

/**
 * Consomme un jeton de quota pour une route payante.
 * `peekOnly` : lecture sans incrément (tests).
 */
export function assertPaidRouteAllowed(input: {
  workspaceId: string;
  routeKey: string;
  actor?: string;
  now?: number;
  config?: PaidRouteRateLimitConfig;
  peekOnly?: boolean;
}): PaidRouteRateLimitDecision {
  const config = input.config ?? readPaidRouteRateLimitConfig();
  const now = input.now ?? Date.now();
  const bucketKey = buildPaidRouteBucketKey(input);
  let bucket = buckets.get(bucketKey);

  if (!bucket || now - bucket.windowStartedAt >= config.windowMs) {
    bucket = { count: 0, windowStartedAt: now };
    buckets.set(bucketKey, bucket);
  }

  if (bucket.count >= config.maxRequests) {
    const retryAfterMs = Math.max(
      0,
      config.windowMs - (now - bucket.windowStartedAt)
    );
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
      bucketKey,
    };
  }

  if (!input.peekOnly) {
    bucket.count += 1;
  }

  return {
    allowed: true,
    remaining: Math.max(0, config.maxRequests - bucket.count),
    retryAfterMs: null,
    bucketKey,
  };
}

/** Tests uniquement — vide les compteurs processus. */
export function resetPaidRouteRateLimitForTests(): void {
  buckets.clear();
}

export function paidRouteTooManyRequestsResponse(decision: PaidRouteRateLimitDecision) {
  const retrySec = decision.retryAfterMs
    ? Math.ceil(decision.retryAfterMs / 1000)
    : 3600;
  return {
    status: 429 as const,
    body: {
      error:
        "Trop de requêtes payantes OpenAI pour cet espace. Réessayez plus tard.",
      retryAfterSec: retrySec,
    },
    headers: {
      "Retry-After": String(retrySec),
    },
  };
}
