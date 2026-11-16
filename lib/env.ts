import "dotenv/config";

/**
 * Lecture synchrone des fallbacks process.env (sans PostgreSQL).
 * Préférer `resolveRuntimeConnections()` / `resolveOpenAiConfig()` /
 * `resolveWordPressConfig()` pour la configuration effective (DB > env).
 *
 * Les getters lèvent une erreur si la variable d’environnement est absente —
 * utile pour les scripts / tests live qui s’appuient uniquement sur `.env`.
 */

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }

  return value;
}

export const env = {
  get OPENAI_API_KEY(): string {
    return requireEnv("OPENAI_API_KEY");
  },
  get OPENAI_AGENT_ID(): string {
    return requireEnv("OPENAI_AGENT_ID");
  },
  get WP_URL(): string {
    return requireEnv("WP_URL");
  },
  get WP_USERNAME(): string {
    return requireEnv("WP_USERNAME");
  },
  get WP_APP_PASSWORD(): string {
    return requireEnv("WP_APP_PASSWORD");
  },
};
