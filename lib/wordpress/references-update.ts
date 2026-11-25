/**
 * Mise à jour ciblée catégories / auteur d’un brouillon WordPress.
 * Ne touche jamais title, content, slug, excerpt, SEO, image, statut publish.
 */

import type { WordPressConfig } from "@/lib/settings/app-settings";
import { fetchWordPressNoRedirect } from "@/lib/settings/wp-url";

function authHeader(username: string, appPassword: string): string {
  return `Basic ${Buffer.from(`${username}:${appPassword}`).toString("base64")}`;
}

export type WordPressPostSnapshot = {
  id: number;
  status: string;
  categories: number[];
  author: number | null;
  title: string;
  link: string;
};

type WpPostResponse = {
  id?: number;
  status?: string;
  categories?: number[];
  author?: number;
  title?: { rendered?: string };
  link?: string;
};

export class WordPressDraftUpdateError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "WordPressDraftUpdateError";
    this.code = code;
    this.status = status;
  }
}

export async function fetchWordPressPostForRefs(
  credentials: WordPressConfig,
  postId: number
): Promise<WordPressPostSnapshot> {
  const response = await fetchWordPressNoRedirect(
    `${credentials.url.replace(/\/$/, "")}/wp-json/wp/v2/posts/${postId}?context=edit`,
    {
      method: "GET",
      headers: {
        Authorization: authHeader(credentials.username, credentials.appPassword),
        Accept: "application/json",
      },
    }
  );
  const data = (await response.json()) as WpPostResponse;
  if (!response.ok) {
    throw new WordPressDraftUpdateError(
      `Lecture WordPress HTTP ${response.status}.`,
      "WP_READ_FAILED",
      response.status
    );
  }
  const id = Number(data.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new WordPressDraftUpdateError(
      "Réponse WordPress invalide.",
      "WP_INVALID"
    );
  }
  return {
    id,
    status: typeof data.status === "string" ? data.status : "unknown",
    categories: Array.isArray(data.categories)
      ? data.categories.filter((n) => Number.isInteger(n) && n > 0)
      : [],
    author:
      typeof data.author === "number" && data.author > 0 ? data.author : null,
    title: data.title?.rendered?.trim() || "",
    link: typeof data.link === "string" ? data.link : "",
  };
}

export function assertWordPressDraftEditable(snapshot: WordPressPostSnapshot): void {
  const status = snapshot.status.toLowerCase();
  if (status === "publish" || status === "private" || status === "future") {
    throw new WordPressDraftUpdateError(
      "Les articles publiés, privés ou planifiés ne peuvent pas être modifiés ici.",
      "NOT_DRAFT",
      409
    );
  }
  if (status === "trash" || status === "archived") {
    throw new WordPressDraftUpdateError(
      "Ce contenu WordPress n’est plus un brouillon modifiable.",
      "NOT_DRAFT",
      409
    );
  }
  if (status !== "draft" && status !== "auto-draft" && status !== "pending") {
    throw new WordPressDraftUpdateError(
      `Statut WordPress « ${snapshot.status} » non autorisé pour une modification des références.`,
      "STATUS_UNCERTAIN",
      409
    );
  }
}

/**
 * PATCH ciblé categories et/ou author. Jamais status:publish.
 */
export async function patchWordPressDraftReferences(input: {
  credentials: WordPressConfig;
  postId: number;
  categoryIds?: number[] | null;
  authorId?: number | null;
  /** undefined = ne pas toucher ; null/[] = vider catégories */
}): Promise<WordPressPostSnapshot> {
  const existing = await fetchWordPressPostForRefs(
    input.credentials,
    input.postId
  );
  assertWordPressDraftEditable(existing);

  const body: Record<string, unknown> = {};
  if (input.categoryIds !== undefined) {
    body.categories = Array.isArray(input.categoryIds)
      ? [...new Set(input.categoryIds.filter((id) => Number.isInteger(id) && id > 0))]
      : [];
  }
  if (input.authorId !== undefined && input.authorId !== null) {
    if (!Number.isInteger(input.authorId) || input.authorId <= 0) {
      throw new WordPressDraftUpdateError(
        "Identifiant auteur WordPress invalide.",
        "AUTHOR_INVALID"
      );
    }
    body.author = input.authorId;
  }

  if (Object.keys(body).length === 0) {
    throw new WordPressDraftUpdateError(
      "Aucune référence catégorie/auteur à mettre à jour.",
      "EMPTY_PATCH"
    );
  }

  const response = await fetchWordPressNoRedirect(
    `${input.credentials.url.replace(/\/$/, "")}/wp-json/wp/v2/posts/${input.postId}`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(
          input.credentials.username,
          input.credentials.appPassword
        ),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  const data = (await response.json()) as WpPostResponse;
  if (!response.ok) {
    throw new WordPressDraftUpdateError(
      `WordPress a refusé la mise à jour (HTTP ${response.status}).`,
      "WP_WRITE_FAILED",
      response.status
    );
  }

  return {
    id: Number(data.id) || existing.id,
    status: typeof data.status === "string" ? data.status : existing.status,
    categories: Array.isArray(data.categories)
      ? data.categories.filter((n) => Number.isInteger(n) && n > 0)
      : existing.categories,
    author:
      typeof data.author === "number" && data.author > 0
        ? data.author
        : existing.author,
    title: data.title?.rendered?.trim() || existing.title,
    link: typeof data.link === "string" ? data.link : existing.link,
  };
}
