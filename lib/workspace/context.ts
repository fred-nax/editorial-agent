import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import {
  WORKSPACE_COOKIE_MAX_AGE_SEC,
  WORKSPACE_COOKIE_NAME,
  WORKSPACE_IDS,
  WORKSPACE_SLUGS,
  type WorkspaceCmsProvider,
} from "./constants";
import { WorkspaceContextError } from "./errors";
import { cmsProviderFromWorkspace } from "./scope";

export type EditorialWorkspaceRecord = {
  id: string;
  slug: string;
  name: string;
  cmsProvider: WorkspaceCmsProvider;
  siteUrl: string | null;
  siteLabel: string | null;
  defaultLanguage: string;
  enabled: boolean;
};

function mapWorkspace(row: {
  id: string;
  slug: string;
  name: string;
  cmsProvider: string;
  siteUrl: string | null;
  siteLabel: string | null;
  defaultLanguage: string;
  enabled: boolean;
}): EditorialWorkspaceRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    cmsProvider: cmsProviderFromWorkspace(row.cmsProvider),
    siteUrl: row.siteUrl,
    siteLabel: row.siteLabel,
    defaultLanguage: row.defaultLanguage,
    enabled: row.enabled,
  };
}

export async function listEnabledWorkspaces(): Promise<EditorialWorkspaceRecord[]> {
  const rows = await db.editorialWorkspace.findMany({
    where: { enabled: true },
    orderBy: [{ cmsProvider: "asc" }, { name: "asc" }],
  });
  return rows.map(mapWorkspace);
}

export async function getWorkspaceByIdOrSlug(
  idOrSlug: string
): Promise<EditorialWorkspaceRecord | null> {
  const key = idOrSlug.trim();
  if (!key) {
    return null;
  }
  const row = await db.editorialWorkspace.findFirst({
    where: {
      OR: [{ id: key }, { slug: key }],
    },
  });
  return row ? mapWorkspace(row) : null;
}

export async function requireWorkspace(
  idOrSlug: string
): Promise<EditorialWorkspaceRecord> {
  const workspace = await getWorkspaceByIdOrSlug(idOrSlug);
  if (!workspace) {
    throw new WorkspaceContextError(
      "WORKSPACE_NOT_FOUND",
      "Espace éditorial introuvable.",
      404
    );
  }
  if (!workspace.enabled) {
    throw new WorkspaceContextError(
      "WORKSPACE_DISABLED",
      "Espace éditorial désactivé.",
      403
    );
  }
  return workspace;
}

/**
 * Lit le cookie d’espace. Valeur = id ou slug.
 * Transitoire V7.11.1 : cookie absent → espace WordPress (préserve l’UX historique).
 * Cookie présent mais invalide → erreur explicite (pas de fallback silencieux).
 */
export async function resolveActiveWorkspaceIdFromCookie(
  cookieHeader?: string | null
): Promise<{ workspaceId: string; fromCookie: boolean; raw: string | null }> {
  let raw: string | null = null;

  if (typeof cookieHeader === "string") {
    const match = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${WORKSPACE_COOKIE_NAME}=`));
    if (match) {
      raw = decodeURIComponent(match.slice(WORKSPACE_COOKIE_NAME.length + 1).trim());
    }
  } else {
    try {
      const jar = await cookies();
      raw = jar.get(WORKSPACE_COOKIE_NAME)?.value ?? null;
    } catch {
      raw = null;
    }
  }

  if (!raw) {
    return {
      workspaceId: WORKSPACE_IDS.wordpress,
      fromCookie: false,
      raw: null,
    };
  }

  const workspace = await getWorkspaceByIdOrSlug(raw);
  if (!workspace || !workspace.enabled) {
    throw new WorkspaceContextError(
      "WORKSPACE_NOT_FOUND",
      "Cookie d’espace éditorial invalide ou désactivé.",
      400
    );
  }

  return { workspaceId: workspace.id, fromCookie: true, raw };
}

/**
 * Déduplique les résolutions d’espace dans un même rendu RSC
 * (layout + page ne refont pas 4 requêtes workspace).
 */
export const resolveActiveWorkspace = cache(
  async (
    cookieHeader?: string | null
  ): Promise<EditorialWorkspaceRecord> => {
    const resolved = await resolveActiveWorkspaceIdFromCookie(cookieHeader);
    return requireWorkspace(resolved.workspaceId);
  }
);

/** Options Set-Cookie pour mémoriser l’espace actif. */
export function buildWorkspaceCookieOptions(workspaceId: string): {
  name: string;
  value: string;
  httpOnly: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
  secure: boolean;
} {
  return {
    name: WORKSPACE_COOKIE_NAME,
    value: workspaceId,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: WORKSPACE_COOKIE_MAX_AGE_SEC,
    secure: process.env.NODE_ENV === "production",
  };
}

export function isWordPressWorkspaceSlugOrId(value: string): boolean {
  return (
    value === WORKSPACE_IDS.wordpress || value === WORKSPACE_SLUGS.wordpress
  );
}

export function isWebflowWorkspaceSlugOrId(value: string): boolean {
  return value === WORKSPACE_IDS.webflow || value === WORKSPACE_SLUGS.webflow;
}
