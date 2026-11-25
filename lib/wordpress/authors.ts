/**
 * Découverte auteurs WordPress + capacités d’attribution (lecture seule).
 * Aucune modification de rôles / utilisateurs distants.
 */

import type { WordPressConfig } from "@/lib/settings/app-settings";
import { fetchWordPressNoRedirect } from "@/lib/settings/wp-url";
import type {
  SyncedWpAuthorRef,
  WpAuthorCapability,
} from "@/lib/wordpress/references-types";

function authHeader(username: string, appPassword: string): string {
  return `Basic ${Buffer.from(`${username}:${appPassword}`).toString("base64")}`;
}

type WpRestUser = {
  id?: number;
  name?: string;
  slug?: string;
  capabilities?: Record<string, boolean>;
};

export type WordPressAuthorProbe = {
  apiUser: SyncedWpAuthorRef | null;
  /** Auteurs proposables pour sélection UI (selon capacité). */
  authors: SyncedWpAuthorRef[];
  /** Catalogue brut listé (peut inclure d’autres auteurs non assignables). */
  listedAuthors: SyncedWpAuthorRef[];
  capability: WpAuthorCapability;
  canAssignOthers: boolean;
  message: string;
};

function mapUser(item: WpRestUser): SyncedWpAuthorRef | null {
  const id = Number(item.id);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return {
    id,
    name:
      typeof item.name === "string" && item.name.trim()
        ? item.name.trim().slice(0, 200)
        : `Auteur ${id}`,
    slug: typeof item.slug === "string" ? item.slug.slice(0, 200) : "",
  };
}

/**
 * Interroge /users/me puis /users?who=authors (si autorisé).
 * Ne stocke jamais d’e-mail.
 */
export async function probeWordPressAuthors(
  credentials: WordPressConfig
): Promise<WordPressAuthorProbe> {
  const base = credentials.url.replace(/\/$/, "");
  const headers = {
    Authorization: authHeader(credentials.username, credentials.appPassword),
    Accept: "application/json",
  };

  let apiUser: SyncedWpAuthorRef | null = null;
  let canAssignOthers = false;

  let meRes = await fetchWordPressNoRedirect(
    `${base}/wp-json/wp/v2/users/me?context=edit`,
    { method: "GET", headers }
  );
  if (!meRes.ok) {
    meRes = await fetchWordPressNoRedirect(`${base}/wp-json/wp/v2/users/me`, {
      method: "GET",
      headers,
    });
  }

  if (meRes.ok) {
    const meData = (await meRes.json()) as WpRestUser;
    apiUser = mapUser(meData);
    const caps = meData.capabilities ?? {};
    canAssignOthers = Boolean(
      caps.edit_others_posts ||
        caps.edit_others_pages ||
        caps.promote_users ||
        caps.list_users
    );
  }

  const listedAuthors: SyncedWpAuthorRef[] = [];
  const byId = new Set<number>();
  if (apiUser) {
    listedAuthors.push(apiUser);
    byId.add(apiUser.id);
  }

  let listedOthers = false;
  const listResponse = await fetchWordPressNoRedirect(
    `${base}/wp-json/wp/v2/users?who=authors&per_page=100&page=1`,
    { method: "GET", headers }
  );

  if (listResponse.ok) {
    listedOthers = true;
    const data = (await listResponse.json()) as WpRestUser[];
    if (Array.isArray(data)) {
      for (const item of data) {
        const mapped = mapUser(item);
        if (!mapped || byId.has(mapped.id)) {
          continue;
        }
        byId.add(mapped.id);
        listedAuthors.push(mapped);
      }
    }
  }

  let capability: WpAuthorCapability = "unknown";
  let message: string;

  if (!apiUser) {
    capability = "unknown";
    message =
      "Impossible d’identifier le compte API WordPress. L’auteur restera celui du compte authentifié.";
  } else if (canAssignOthers && listedOthers && listedAuthors.length > 1) {
    capability = "can_assign";
    message =
      "Le compte API peut lister d’autres auteurs. La sélection d’un auteur distinct est proposée ; l’attribution réelle reste vérifiée à l’écriture.";
  } else if (listedOthers) {
    capability = "can_list_authors";
    message =
      "Des auteurs sont visibles, mais le rôle actuel (souvent Auteur) ne garantit pas l’attribution à un autre compte. Seul le compte API est sélectionnable pour la génération.";
  } else {
    capability = "self_only";
    message =
      "Permissions insuffisantes pour lister ou attribuer d’autres auteurs (principe de moindre privilège / rôle Auteur). L’auteur reste le compte API.";
  }

  const authors =
    capability === "can_assign"
      ? listedAuthors
      : apiUser
        ? [apiUser]
        : [];

  return {
    apiUser,
    authors,
    listedAuthors,
    capability,
    canAssignOthers: capability === "can_assign",
    message,
  };
}
