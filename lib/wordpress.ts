import {
  resolveWordPressConfig,
  resolveWpSeoPlugin,
  type WordPressConfig,
} from "@/lib/settings/app-settings";
import { fetchWordPressNoRedirect } from "@/lib/settings/wp-url";
import {
  buildSeoRestMeta,
  verifySeoRestMeta,
  type WpSeoPlugin,
} from "@/lib/wordpress-seo";

export type WordPressDraftInput = {
  title: string;
  content: string;
  excerpt?: string;
  slug?: string;
  meta_title?: string;
  meta_description?: string;
  categoryIds?: number[];
  /**
   * Auteur WP explicite — uniquement si attribution autorisée.
   * Absent = comportement historique (compte API).
   */
  authorId?: number;
};

export type WordPressDraftResult = {
  success: true;
  post_id: number;
  status: string;
  title: string;
  link: string;
  categories: number[];
  meta_title: string;
  meta_description: string;
  /** Plugin SEO utilisé pour ce brouillon. */
  seo_plugin: WpSeoPlugin;
  /** true si les métadonnées SEO ont été vérifiées en lecture après écriture. */
  seo_persisted: boolean;
  /** Message d’échec SEO distinct — le brouillon WordPress est conservé. */
  seo_error: string | null;
};

type WordPressPostResponse = {
  id: number;
  status: string;
  title?: {
    rendered?: string;
  };
  link?: string;
  categories?: number[];
  meta?: Record<string, unknown>;
};

function authHeader(username: string, appPassword: string): string {
  const token = Buffer.from(`${username}:${appPassword}`).toString("base64");
  return `Basic ${token}`;
}

async function resolveCredentials(
  override?: WordPressConfig
): Promise<WordPressConfig> {
  if (override) {
    return override;
  }
  const config = await resolveWordPressConfig();
  if (!config) {
    throw new Error("WordPress non configuré.");
  }
  return config;
}

async function fetchPostMetaForVerify(
  wp: WordPressConfig,
  postId: number
): Promise<Record<string, unknown> | null> {
  const response = await fetchWordPressNoRedirect(
    `${wp.url}/wp-json/wp/v2/posts/${postId}?context=edit`,
    {
      method: "GET",
      headers: {
        Authorization: authHeader(wp.username, wp.appPassword),
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as WordPressPostResponse;
  return data.meta && typeof data.meta === "object" ? data.meta : null;
}

/**
 * Création brouillon WordPress + métadonnées SEO via adaptateur (Slim SEO / Yoast).
 * Le statut WordPress est toujours forcé à draft.
 * En cas d’échec SEO après création, le brouillon est conservé (pas de suppression / pas de doublon).
 * @param credentials Snapshot de connexion (génération en cours) — optionnel.
 */
export async function createWordPressDraft(
  {
    title,
    content,
    excerpt = "",
    slug = "",
    meta_title = "",
    meta_description = "",
    categoryIds = [],
    authorId,
  }: WordPressDraftInput,
  credentials?: WordPressConfig
): Promise<WordPressDraftResult> {
  const wp = await resolveCredentials(credentials);
  const seoPlugin = await resolveWpSeoPlugin();
  const seoFields = { meta_title, meta_description };
  const adapter = buildSeoRestMeta(seoPlugin, seoFields);

  const payload: Record<string, unknown> = {
    title,
    content,
    excerpt,
    slug,
    status: "draft" as const,
    categories: categoryIds,
  };

  if (
    typeof authorId === "number" &&
    Number.isInteger(authorId) &&
    authorId > 0
  ) {
    payload.author = authorId;
  }

  if (adapter.restMeta) {
    payload.meta = adapter.restMeta;
  }

  const response = await fetchWordPressNoRedirect(
    `${wp.url}/wp-json/wp/v2/posts`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(wp.username, wp.appPassword),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = (await response.json()) as WordPressPostResponse;

  if (!response.ok) {
    throw new Error(
      `WordPress error ${response.status}: ${JSON.stringify(data)}`
    );
  }

  // Vérification distincte — ne pas supprimer ni recréer le brouillon.
  let seoPersisted = false;
  let seoError: string | null = null;

  try {
    const metaFromCreate =
      data.meta && typeof data.meta === "object" ? data.meta : null;
    let verify = verifySeoRestMeta(seoPlugin, metaFromCreate, seoFields);

    if (!verify.persisted) {
      const metaFromGet = await fetchPostMetaForVerify(wp, data.id);
      verify = verifySeoRestMeta(seoPlugin, metaFromGet, seoFields);
    }

    seoPersisted = verify.persisted;
    seoError = verify.error;
  } catch (error) {
    seoPersisted = false;
    seoError =
      error instanceof Error
        ? error.message
        : "Vérification des métadonnées SEO impossible.";
  }

  return {
    success: true,
    post_id: data.id,
    status: data.status,
    title: data.title?.rendered ?? title,
    link: data.link ?? "",
    categories: data.categories ?? categoryIds,
    meta_title,
    meta_description,
    seo_plugin: seoPlugin,
    seo_persisted: seoPersisted,
    seo_error: seoError,
  };
}
