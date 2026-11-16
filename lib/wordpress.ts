import {
  resolveWordPressConfig,
  type WordPressConfig,
} from "@/lib/settings/app-settings";
import { fetchWordPressNoRedirect } from "@/lib/settings/wp-url";

export type WordPressDraftInput = {
  title: string;
  content: string;
  excerpt?: string;
  slug?: string;
  meta_title?: string;
  meta_description?: string;
  categoryIds?: number[];
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
};

type WordPressPostResponse = {
  id: number;
  status: string;
  title?: {
    rendered?: string;
  };
  link?: string;
  categories?: number[];
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

/**
 * Création brouillon + Slim SEO.
 * Le statut WordPress est toujours forcé à draft.
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
  }: WordPressDraftInput,
  credentials?: WordPressConfig
): Promise<WordPressDraftResult> {
  const wp = await resolveCredentials(credentials);

  const payload = {
    title,
    content,
    excerpt,
    slug,
    status: "draft" as const,
    categories: categoryIds,
    meta: {
      slim_seo: {
        title: meta_title,
        description: meta_description,
      },
    },
  };

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

  return {
    success: true,
    post_id: data.id,
    status: data.status,
    title: data.title?.rendered ?? title,
    link: data.link ?? "",
    categories: data.categories ?? categoryIds,
    meta_title,
    meta_description,
  };
}
