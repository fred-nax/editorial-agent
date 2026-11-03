export type ServiceStatus = {
  label: string;
  configured: boolean;
};

/**
 * Indicateurs booléens uniquement. Aucune valeur secrète n'est renvoyée.
 * À n'utiliser que depuis des Server Components.
 */
export function getServiceStatuses(): ServiceStatus[] {
  const openaiConfigured = Boolean(
    process.env.OPENAI_API_KEY && process.env.OPENAI_AGENT_ID
  );
  const wordpressConfigured = Boolean(
    process.env.WP_URL &&
      process.env.WP_USERNAME &&
      process.env.WP_APP_PASSWORD
  );
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const authConfigured = Boolean(
    process.env.AUTH_SECRET &&
      process.env.ADMIN_EMAIL &&
      process.env.ADMIN_PASSWORD_HASH
  );

  return [
    { label: "OpenAI", configured: openaiConfigured },
    { label: "WordPress", configured: wordpressConfigured },
    { label: "PostgreSQL", configured: databaseConfigured },
    { label: "Authentification", configured: authConfigured },
  ];
}
