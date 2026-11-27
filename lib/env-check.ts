/** Secrets d’infrastructure — toujours requis au démarrage. */
const REQUIRED_INFRA_ENV = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD_HASH",
] as const;

/**
 * Connexions métier : optionnelles au boot si déjà en base (AppSettings).
 * Conservées pour compatibilité / signalement.
 */
const OPTIONAL_CONNECTION_ENV = [
  "OPENAI_API_KEY",
  "OPENAI_AGENT_ID",
  "WP_URL",
  "WP_USERNAME",
  "WP_APP_PASSWORD",
] as const;

export function missingRequiredEnv(): string[] {
  return REQUIRED_INFRA_ENV.filter((name) => !process.env[name]?.trim());
}

export function missingConnectionEnv(): string[] {
  return OPTIONAL_CONNECTION_ENV.filter((name) => !process.env[name]?.trim());
}

/**
 * AUTH-002 — en production, AUTH_URL (ou NEXTAUTH_URL) doit être défini
 * pour compenser trustHost: true derrière un reverse proxy.
 */
export function missingAuthUrlInProduction(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (env.NODE_ENV !== "production") {
    return null;
  }
  if (env.AUTH_URL?.trim() || env.NEXTAUTH_URL?.trim()) {
    return null;
  }
  return "AUTH_URL (ou NEXTAUTH_URL)";
}

export function assertRequiredEnv(
  env: NodeJS.ProcessEnv = process.env
): void {
  const missing: string[] = REQUIRED_INFRA_ENV.filter(
    (name) => !env[name]?.trim()
  );
  const authUrlMissing = missingAuthUrlInProduction(env);
  if (authUrlMissing) {
    missing.push(authUrlMissing);
  }
  if (missing.length === 0) {
    return;
  }

  throw new Error(
    `Variables d'environnement manquantes : ${missing.join(", ")}`
  );
}
