/**
 * Rate-limit / lockout temporaire des tentatives de login (AUTH-001).
 * Persistance PostgreSQL — survit à un redémarrage Next.js.
 * Pas de blocage permanent (anti-DoS compte admin).
 */

import { db } from "@/lib/db";
import { logInfo } from "@/lib/logger";

export type LoginRateLimitConfig = {
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number;
};

export type LoginRateLimitDecision = {
  allowed: boolean;
  /** Message générique (jamais d’énumération de compte). */
  message: string | null;
  remainingAttempts: number;
  retryAfterMs: number | null;
  bucketKey: string;
};

const DEFAULTS: LoginRateLimitConfig = {
  maxAttempts: 10,
  windowMs: 15 * 60 * 1000,
  lockoutMs: 15 * 60 * 1000,
};

export function readLoginRateLimitConfig(
  env: NodeJS.ProcessEnv = process.env
): LoginRateLimitConfig {
  const maxAttempts = parsePositiveInt(
    env.AUTH_LOGIN_MAX_ATTEMPTS,
    DEFAULTS.maxAttempts
  );
  const windowMs = parsePositiveInt(
    env.AUTH_LOGIN_WINDOW_MS,
    DEFAULTS.windowMs
  );
  const lockoutMs = parsePositiveInt(
    env.AUTH_LOGIN_LOCKOUT_MS,
    DEFAULTS.lockoutMs
  );
  return { maxAttempts, windowMs, lockoutMs };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export function normalizeLoginKey(email: string): string {
  return email.trim().toLowerCase();
}

export function buildLoginBucketKey(ipAddress: string, loginKey: string): string {
  return `${ipAddress.trim().toLowerCase()}|${loginKey}`;
}

const GENERIC_LOCK_MESSAGE =
  "Trop de tentatives de connexion. Réessayez plus tard.";

/**
 * Vérifie si une tentative est autorisée (avant bcrypt).
 */
export async function assertLoginAttemptAllowed(input: {
  ipAddress: string;
  login: string;
  now?: Date;
  config?: LoginRateLimitConfig;
}): Promise<LoginRateLimitDecision> {
  const config = input.config ?? readLoginRateLimitConfig();
  const now = input.now ?? new Date();
  const loginKey = normalizeLoginKey(input.login);
  const ipAddress = input.ipAddress.trim() || "unknown";
  const bucketKey = buildLoginBucketKey(ipAddress, loginKey);
  const windowStart = new Date(now.getTime() - config.windowMs);

  const recentFailures = await db.authLoginAttempt.count({
    where: {
      bucketKey,
      success: false,
      attemptedAt: { gte: windowStart },
    },
  });

  if (recentFailures >= config.maxAttempts) {
    const newestBlocking = await db.authLoginAttempt.findFirst({
      where: {
        bucketKey,
        success: false,
        attemptedAt: { gte: windowStart },
      },
      orderBy: { attemptedAt: "desc" },
      select: { attemptedAt: true },
    });
    const blockStarted = newestBlocking?.attemptedAt ?? now;
    const unlockAt = new Date(blockStarted.getTime() + config.lockoutMs);
    const retryAfterMs = Math.max(0, unlockAt.getTime() - now.getTime());

    // Lockout écoulé : purge du bucket puis autorisation (pas de ban permanent).
    if (retryAfterMs <= 0) {
      await db.authLoginAttempt.deleteMany({
        where: { bucketKey, success: false },
      });
      return {
        allowed: true,
        message: null,
        remainingAttempts: config.maxAttempts,
        retryAfterMs: null,
        bucketKey,
      };
    }

    return {
      allowed: false,
      message: GENERIC_LOCK_MESSAGE,
      remainingAttempts: 0,
      retryAfterMs,
      bucketKey,
    };
  }

  return {
    allowed: true,
    message: null,
    remainingAttempts: Math.max(0, config.maxAttempts - recentFailures),
    retryAfterMs: null,
    bucketKey,
  };
}

export async function recordLoginAttempt(input: {
  ipAddress: string;
  login: string;
  success: boolean;
  now?: Date;
}): Promise<void> {
  const loginKey = normalizeLoginKey(input.login);
  const ipAddress = input.ipAddress.trim() || "unknown";
  const bucketKey = buildLoginBucketKey(ipAddress, loginKey);
  await db.authLoginAttempt.create({
    data: {
      loginKey,
      ipAddress,
      bucketKey,
      success: input.success,
      attemptedAt: input.now ?? new Date(),
    },
  });
  logInfo("auth-rate-limit", input.success ? "login success" : "login failure", {
    bucketKey,
  });
}

/**
 * Purge contrôlée des tentatives hors fenêtre (appel opportuniste).
 */
export async function purgeExpiredLoginAttempts(input?: {
  olderThanMs?: number;
  now?: Date;
}): Promise<number> {
  const config = readLoginRateLimitConfig();
  const retention = Math.max(
    config.windowMs,
    config.lockoutMs,
    input?.olderThanMs ?? 0
  );
  const now = input?.now ?? new Date();
  const cutoff = new Date(now.getTime() - retention * 2);
  const result = await db.authLoginAttempt.deleteMany({
    where: { attemptedAt: { lt: cutoff } },
  });
  return result.count;
}

export const LOGIN_RATE_LIMIT_DEFAULTS = DEFAULTS;
