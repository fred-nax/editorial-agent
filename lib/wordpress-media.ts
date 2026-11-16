import {
  resolveWordPressConfig,
  type WordPressConfig,
} from "@/lib/settings/app-settings";
import {
  fetchWordPressNoRedirect,
  WordPressUrlError,
} from "@/lib/settings/wp-url";

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

async function getWp(): Promise<WordPressConfig> {
  const config = await resolveWordPressConfig();
  if (!config) {
    throw new WordPressMediaError("WordPress non configuré.", 503);
  }
  return config;
}

function getWpAuthHeader(wp: WordPressConfig): string {
  const token = Buffer.from(`${wp.username}:${wp.appPassword}`).toString(
    "base64"
  );
  return `Basic ${token}`;
}

function wpUrl(wp: WordPressConfig, path: string): string {
  return `${wp.url.replace(/\/$/, "")}${path}`;
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
  const wp = await getWp();
  let response: Response;
  try {
    response = await fetchWordPressNoRedirect(
      wpUrl(wp, `/wp-json/wp/v2/posts/${postId}?context=edit`),
      {
        method: "GET",
        headers: { Authorization: getWpAuthHeader(wp) },
        cache: "no-store",
      }
    );
  } catch (error) {
    if (error instanceof WordPressUrlError) {
      throw new WordPressMediaError(error.message, error.status);
    }
    throw error;
  }
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
  const wp = await getWp();
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  let response: Response;
  try {
    response = await fetchWordPressNoRedirect(wpUrl(wp, "/wp-json/wp/v2/media"), {
      method: "POST",
      headers: {
        Authorization: getWpAuthHeader(wp),
        "Content-Type": input.mimeType,
        "Content-Disposition": `attachment; filename="${safeName}"`,
      },
      body: new Uint8Array(input.bytes),
    });
  } catch (error) {
    if (error instanceof WordPressUrlError) {
      throw new WordPressMediaError(error.message, error.status);
    }
    throw error;
  }

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
  const wp = await getWp();
  let response: Response;
  try {
    response = await fetchWordPressNoRedirect(
      wpUrl(wp, `/wp-json/wp/v2/media/${mediaId}`),
      {
        method: "POST",
        headers: {
          Authorization: getWpAuthHeader(wp),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ alt_text: altText }),
      }
    );
  } catch (error) {
    if (error instanceof WordPressUrlError) {
      throw new WordPressMediaError(error.message, error.status);
    }
    throw error;
  }

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
  const wp = await getWp();
  let response: Response;
  try {
    response = await fetchWordPressNoRedirect(
      wpUrl(wp, `/wp-json/wp/v2/posts/${postId}`),
      {
        method: "POST",
        headers: {
          Authorization: getWpAuthHeader(wp),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ featured_media: mediaId }),
      }
    );
  } catch (error) {
    if (error instanceof WordPressUrlError) {
      throw new WordPressMediaError(error.message, error.status);
    }
    throw error;
  }

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
