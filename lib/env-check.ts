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

export function assertRequiredEnv(): void {
  const missing = missingRequiredEnv();
  if (missing.length === 0) {
    return;
  }

  throw new Error(
    `Variables d'environnement manquantes : ${missing.join(", ")}`
  );
}
