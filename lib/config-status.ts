import {
  getPublicAppSettings,
  resolveOpenAiConfig,
  resolveWordPressConfig,
} from "@/lib/settings/app-settings";
import { getGoogleConnection } from "@/lib/google/connection";
import { isGoogleOAuthConfigured } from "@/lib/google/oauth";

export type ServiceHealthStatus =
  | "configured"
  | "not_configured"
  | "connected"
  | "error";

export type ServiceStatus = {
  label: string;
  status: ServiceHealthStatus;
  detail?: string | null;
};

/**
 * État des services sans sondes externes systématiques.
 * « Connecté » réservé aux cas où un état live est déjà connu (ex. Google OAuth).
 */
export async function getServiceStatuses(): Promise<ServiceStatus[]> {
  const openai = await resolveOpenAiConfig();
  const wordpress = await resolveWordPressConfig();
  const settings = await getPublicAppSettings().catch(() => null);

  const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());
  const authConfigured = Boolean(
    process.env.AUTH_SECRET?.trim() &&
      process.env.ADMIN_EMAIL?.trim() &&
      process.env.ADMIN_PASSWORD_HASH?.trim()
  );

  let googleStatus: ServiceHealthStatus = "not_configured";
  let googleDetail: string | null = null;
  if (isGoogleOAuthConfigured()) {
    try {
      const connection = await getGoogleConnection();
      if (connection?.status === "connected") {
        googleStatus = "connected";
        googleDetail = connection.googleAccountEmail;
      } else if (connection?.status === "error") {
        googleStatus = "error";
        googleDetail = connection.lastError;
      } else {
        googleStatus = "configured";
      }
    } catch {
      googleStatus = "configured";
    }
  }

  return [
    {
      label: "OpenAI",
      status: openai ? "configured" : "not_configured",
      detail: openai
        ? `Agent ${openai.agentId} (${openai.agentIdSource})`
        : null,
    },
    {
      label: "WordPress",
      status: wordpress ? "configured" : "not_configured",
      detail: wordpress ? wordpress.url : null,
    },
    {
      label: "PostgreSQL",
      status: databaseConfigured ? "configured" : "not_configured",
      detail: settings ? null : null,
    },
    {
      label: "Authentification",
      status: authConfigured ? "configured" : "not_configured",
    },
    {
      label: "Google GSC / GA4",
      status: googleStatus,
      detail: googleDetail,
    },
  ];
}

/** Compatibilité synchrone (env uniquement) — préférer getServiceStatuses(). */
export function getServiceStatusesSync(): Array<{
  label: string;
  configured: boolean;
}> {
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
  const googleConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY &&
      (process.env.AUTH_URL || process.env.NEXTAUTH_URL)
  );

  return [
    { label: "OpenAI", configured: openaiConfigured },
    { label: "WordPress", configured: wordpressConfigured },
    { label: "PostgreSQL", configured: databaseConfigured },
    { label: "Authentification", configured: authConfigured },
    { label: "Google (GSC / GA4)", configured: googleConfigured },
  ];
}
