import { env } from "./env";

export type WordPressPostSnapshot = {
  id: number;
  status: string;
  featured_media: number;
  link: string;
};

export type WordPressMediaSnapshot = {
  id: number;
  source_url: string;
  alt_text: string;
  mime_type: string;
};

export class WordPressMediaError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "WordPressMediaError";
    this.status = status;
  }
}

function getWpAuthHeader(): string {
  const token = Buffer.from(
    `${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`
  ).toString("base64");
  return `Basic ${token}`;
}

function wpUrl(path: string): string {
  return `${env.WP_URL.replace(/\/$/, "")}${path}`;
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new WordPressMediaError("Réponse WordPress invalide.", 502);
  }
}

/** Lit un post WordPress (statut + featured_media). */
export async function fetchWordPressPost(
  postId: number
): Promise<WordPressPostSnapshot> {
  const response = await fetch(
    wpUrl(`/wp-json/wp/v2/posts/${postId}?context=edit`),
    {
      method: "GET",
      headers: { Authorization: getWpAuthHeader() },
      cache: "no-store",
    }
  );
  const data = await readJson<{
    id?: number;
    status?: string;
    featured_media?: number;
    link?: string;
    code?: string;
    message?: string;
  }>(response);

  if (!response.ok || typeof data.id !== "number") {
    throw new WordPressMediaError(
      "Impossible de lire l’article WordPress.",
      response.status === 404 ? 404 : 502
    );
  }

  return {
    id: data.id,
    status: data.status ?? "unknown",
    featured_media:
      typeof data.featured_media === "number" ? data.featured_media : 0,
    link: data.link ?? "",
  };
}

export async function uploadWordPressMedia(input: {
  bytes: Buffer;
  filename: string;
  mimeType: string;
  altText?: string | null;
}): Promise<WordPressMediaSnapshot> {
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const response = await fetch(wpUrl("/wp-json/wp/v2/media"), {
    method: "POST",
    headers: {
      Authorization: getWpAuthHeader(),
      "Content-Type": input.mimeType,
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
    body: new Uint8Array(input.bytes),
  });

  const data = await readJson<{
    id?: number;
    source_url?: string;
    alt_text?: string;
    mime_type?: string;
  }>(response);

  if (!response.ok || typeof data.id !== "number") {
    throw new WordPressMediaError(
      "Échec du téléversement du média WordPress.",
      response.status >= 400 && response.status < 500 ? response.status : 502
    );
  }

  const media: WordPressMediaSnapshot = {
    id: data.id,
    source_url: data.source_url ?? "",
    alt_text: data.alt_text ?? "",
    mime_type: data.mime_type ?? input.mimeType,
  };

  if (input.altText?.trim()) {
    try {
      await updateWordPressMediaAltText(media.id, input.altText.trim());
      media.alt_text = input.altText.trim();
    } catch {
      // Le média est créé : l’ALT pourra être repris ensuite.
    }
  }

  return media;
}

export async function updateWordPressMediaAltText(
  mediaId: number,
  altText: string
): Promise<void> {
  const response = await fetch(wpUrl(`/wp-json/wp/v2/media/${mediaId}`), {
    method: "POST",
    headers: {
      Authorization: getWpAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ alt_text: altText }),
  });

  if (!response.ok) {
    throw new WordPressMediaError(
      "Impossible d’enregistrer le texte ALT WordPress.",
      502
    );
  }
}

/**
 * Associe une image à la une à un brouillon.
 * Ne transmet jamais status: publish.
 */
export async function setWordPressFeaturedMedia(
  postId: number,
  mediaId: number
): Promise<WordPressPostSnapshot> {
  const response = await fetch(wpUrl(`/wp-json/wp/v2/posts/${postId}`), {
    method: "POST",
    headers: {
      Authorization: getWpAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ featured_media: mediaId }),
  });

  const data = await readJson<{
    id?: number;
    status?: string;
    featured_media?: number;
    link?: string;
  }>(response);

  if (!response.ok || typeof data.id !== "number") {
    throw new WordPressMediaError(
      "Impossible d’associer l’image à la une.",
      502
    );
  }

  return {
    id: data.id,
    status: data.status ?? "unknown",
    featured_media:
      typeof data.featured_media === "number" ? data.featured_media : 0,
    link: data.link ?? "",
  };
}
