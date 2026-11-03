import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }

  return value;
}

export const env = {
  OPENAI_API_KEY: requireEnv("OPENAI_API_KEY"),
  OPENAI_AGENT_ID: requireEnv("OPENAI_AGENT_ID"),
  WP_URL: requireEnv("WP_URL"),
  WP_USERNAME: requireEnv("WP_USERNAME"),
  WP_APP_PASSWORD: requireEnv("WP_APP_PASSWORD"),
};
