/**
 * Client HTTP Webflow Data API V2 — lecture seule (V7.10.0).
 * Utilise fetch natif. Aucun endpoint write / live / publish / delete.
 */

import {
  mapWebflowHttpStatus,
  WebflowApiError,
} from "@/lib/webflow/errors";
import { WEBFLOW_API_BASE } from "@/lib/webflow/types";

const DEFAULT_TIMEOUT_MS = 15_000;

export type WebflowClientOptions = {
  apiToken: string;
  timeoutMs?: number;
  /** Injecté pour les tests. */
  fetchImpl?: typeof fetch;
};

export type WebflowRequestOptions = {
  method?: "GET";
  path: string;
  query?: Record<string, string | undefined>;
};

/** Garde-fou : chemins d’écriture / publication refusés côté client. */
const FORBIDDEN_PATH_PATTERN =
  /\/(live|publish|items|fields)(\/|$)/i;

export function assertWebflowReadOnlyPath(path: string): void {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  // Autoriser GET collections/{id} (détails + champs) ; interdire items / live / publish / fields mutations.
  if (
    /\/(live|publish)(\/|$)/i.test(normalized) ||
    /\/items(\/|$)/i.test(normalized) ||
    /\/fields(\/|$)/i.test(normalized)
  ) {
    throw new WebflowApiError(
      "bad_request",
      "Opération Webflow d’écriture ou de publication refusée dans cette version."
    );
  }
  // Silence unused in some builds
  void FORBIDDEN_PATH_PATTERN;
}

export function createWebflowClient(options: WebflowClientOptions) {
  const token = options.apiToken.trim();
  if (!token || token.length < 8 || token.length > 512) {
    throw new WebflowApiError(
      "unauthorized",
      "Token API Webflow manquant ou invalide."
    );
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(req: WebflowRequestOptions): Promise<T> {
    if (req.method && req.method !== "GET") {
      throw new WebflowApiError(
        "bad_request",
        "Seules les requêtes GET Webflow sont autorisées dans cette version."
      );
    }
    assertWebflowReadOnlyPath(req.path);

    const url = new URL(
      req.path.startsWith("http")
        ? req.path
        : `${WEBFLOW_API_BASE}${req.path.startsWith("/") ? "" : "/"}${req.path}`
    );
    if (req.query) {
      for (const [key, value] of Object.entries(req.query)) {
        if (value) {
          url.searchParams.set(key, value);
        }
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw mapWebflowHttpStatus(
          response.status,
          response.headers.get("retry-after")
        );
      }

      try {
        return (await response.json()) as T;
      } catch {
        throw new WebflowApiError(
          "invalid_response",
          "Réponse Webflow illisible (JSON attendu)."
        );
      }
    } catch (error) {
      if (error instanceof WebflowApiError) {
        throw error;
      }
      if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        (error as { name: string }).name === "AbortError"
      ) {
        throw new WebflowApiError(
          "timeout",
          "Délai d’attente dépassé lors de l’appel Webflow."
        );
      }
      throw new WebflowApiError(
        "network",
        "Impossible de joindre l’API Webflow."
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return { request };
}

export type WebflowClient = ReturnType<typeof createWebflowClient>;
