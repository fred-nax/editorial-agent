import { env } from "./env";

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

function getWpAuthHeader(): string {
  const token = Buffer.from(
    `${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`
  ).toString("base64");

  return `Basic ${token}`;
}

/**
 * Création brouillon + Slim SEO.
 * Le statut WordPress est toujours forcé à draft.
 */
export async function createWordPressDraft({
  title,
  content,
  excerpt = "",
  slug = "",
  meta_title = "",
  meta_description = "",
  categoryIds = [],
}: WordPressDraftInput): Promise<WordPressDraftResult> {
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

  const response = await fetch(`${env.WP_URL}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      Authorization: getWpAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

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
