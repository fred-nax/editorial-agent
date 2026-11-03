const REQUIRED_ENV = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD_HASH",
  "OPENAI_API_KEY",
  "OPENAI_AGENT_ID",
  "WP_URL",
  "WP_USERNAME",
  "WP_APP_PASSWORD",
] as const;

export function missingRequiredEnv(): string[] {
  return REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
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
