import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/google/crypto";
import {
  GOOGLE_OAUTH_SCOPES,
  refreshAccessToken,
  type GoogleTokenResponse,
} from "@/lib/google/oauth";
import { logError } from "@/lib/logger";
import { WORKSPACE_IDS } from "@/lib/workspace";

const CONNECTION_ID = "default";

/**
 * Connexion OAuth globale + sélection de propriétés pour un espace.
 * V7.11.1 : défaut WordPress (historique). Webflow → empty tant que non configuré.
 */
export async function getGoogleConnection(
  workspaceId: string = WORKSPACE_IDS.wordpress
) {
  const connection = await db.googleConnection.findUnique({
    where: { id: CONNECTION_ID },
    include: {
      selections: {
        where: { workspaceId },
        take: 1,
      },
    },
  });
  if (!connection) {
    return null;
  }
  const { selections, ...rest } = connection;
  return {
    ...rest,
    selection: selections[0] ?? null,
  };
}

export async function upsertGoogleTokens(input: {
  tokens: GoogleTokenResponse;
  email?: string | null;
  sub?: string | null;
  keepExistingRefresh?: string | null;
}): Promise<void> {
  const refresh =
    input.tokens.refresh_token ?? input.keepExistingRefresh ?? null;
  if (!refresh && !input.keepExistingRefresh) {
    // Premier consentement doit fournir un refresh_token (prompt=consent).
  }
  const expiresAt = new Date(
    Date.now() + Math.max(60, input.tokens.expires_in || 3600) * 1000
  );
  const scopes = input.tokens.scope || GOOGLE_OAUTH_SCOPES.join(" ");

  await db.googleConnection.upsert({
    where: { id: CONNECTION_ID },
    create: {
      id: CONNECTION_ID,
      googleAccountEmail: input.email ?? null,
      googleAccountSub: input.sub ?? null,
      accessTokenEncrypted: encryptSecret(input.tokens.access_token),
      refreshTokenEncrypted: refresh ? encryptSecret(refresh) : null,
      tokenExpiresAt: expiresAt,
      scopes,
      status: "connected",
      lastError: null,
    },
    update: {
      googleAccountEmail: input.email ?? undefined,
      googleAccountSub: input.sub ?? undefined,
      accessTokenEncrypted: encryptSecret(input.tokens.access_token),
      ...(refresh
        ? { refreshTokenEncrypted: encryptSecret(refresh) }
        : {}),
      tokenExpiresAt: expiresAt,
      scopes,
      status: "connected",
      lastError: null,
    },
  });

  await db.googlePropertySelection.upsert({
    where: { workspaceId: WORKSPACE_IDS.wordpress },
    create: {
      id: CONNECTION_ID,
      workspaceId: WORKSPACE_IDS.wordpress,
      connectionId: CONNECTION_ID,
    },
    update: {},
  });
}

export async function markGoogleConnectionError(message: string): Promise<void> {
  await db.googleConnection
    .update({
      where: { id: CONNECTION_ID },
      data: { status: "error", lastError: message.slice(0, 500) },
    })
    .catch(() => undefined);
}

export async function deleteGoogleConnection(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
}> {
  const existing = await db.googleConnection.findUnique({
    where: { id: CONNECTION_ID },
  });
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  if (existing) {
    try {
      accessToken = decryptSecret(existing.accessTokenEncrypted);
    } catch {
      accessToken = null;
    }
    if (existing.refreshTokenEncrypted) {
      try {
        refreshToken = decryptSecret(existing.refreshTokenEncrypted);
      } catch {
        refreshToken = null;
      }
    }
    await db.googleConnection.delete({ where: { id: CONNECTION_ID } });
  }
  return { accessToken, refreshToken };
}

/** Retourne un access_token valide, en renouvelant si besoin. */
export async function getValidAccessToken(): Promise<string> {
  const connection = await db.googleConnection.findUnique({
    where: { id: CONNECTION_ID },
  });
  if (!connection) {
    throw new Error("Aucune connexion Google.");
  }
  if (connection.status === "revoked") {
    throw new Error("Connexion Google révoquée.");
  }

  const expiresAt = connection.tokenExpiresAt?.getTime() ?? 0;
  const stillValid = expiresAt - Date.now() > 60_000;
  if (stillValid) {
    return decryptSecret(connection.accessTokenEncrypted);
  }

  if (!connection.refreshTokenEncrypted) {
    await markGoogleConnectionError("Jeton Google expiré sans refresh_token.");
    throw new Error("Jeton Google expiré. Reconnectez Google.");
  }

  try {
    const refreshToken = decryptSecret(connection.refreshTokenEncrypted);
    const tokens = await refreshAccessToken(refreshToken);
    await upsertGoogleTokens({
      tokens,
      email: connection.googleAccountEmail,
      sub: connection.googleAccountSub,
      keepExistingRefresh: refreshToken,
    });
    return tokens.access_token;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Renouvellement Google impossible.";
    logError("google-oauth", "refresh failed", { message });
    await markGoogleConnectionError(message);
    throw new Error(message);
  }
}

export async function savePropertySelection(input: {
  workspaceId?: string;
  gscPropertyUrl?: string | null;
  gscPropertyType?: string | null;
  gscPermissionLevel?: string | null;
  ga4AccountId?: string | null;
  ga4PropertyId?: string | null;
  ga4PropertyName?: string | null;
}): Promise<void> {
  const workspaceId = input.workspaceId?.trim() || WORKSPACE_IDS.wordpress;
  await db.googlePropertySelection.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      connectionId: CONNECTION_ID,
      gscPropertyUrl: input.gscPropertyUrl ?? null,
      gscPropertyType: input.gscPropertyType ?? null,
      gscPermissionLevel: input.gscPermissionLevel ?? null,
      ga4AccountId: input.ga4AccountId ?? null,
      ga4PropertyId: input.ga4PropertyId ?? null,
      ga4PropertyName: input.ga4PropertyName ?? null,
    },
    update: {
      ...(input.gscPropertyUrl !== undefined
        ? { gscPropertyUrl: input.gscPropertyUrl }
        : {}),
      ...(input.gscPropertyType !== undefined
        ? { gscPropertyType: input.gscPropertyType }
        : {}),
      ...(input.gscPermissionLevel !== undefined
        ? { gscPermissionLevel: input.gscPermissionLevel }
        : {}),
      ...(input.ga4AccountId !== undefined
        ? { ga4AccountId: input.ga4AccountId }
        : {}),
      ...(input.ga4PropertyId !== undefined
        ? { ga4PropertyId: input.ga4PropertyId }
        : {}),
      ...(input.ga4PropertyName !== undefined
        ? { ga4PropertyName: input.ga4PropertyName }
        : {}),
    },
  });
}
