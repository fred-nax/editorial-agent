/**
 * Client HTTP Webflow Data API V2 (V7.10.1).
 * GET lecture + POST création d’items brouillon uniquement.
 * Interdit : live, publish, delete, PATCH, PUT.
 */

import {
  mapWebflowHttpStatus,
  WebflowApiError,
} from "@/lib/webflow/errors";
import { WEBFLOW_API_BASE } from "@/lib/webflow/types";

const DEFAULT_TIMEOUT_MS = 20_000;

export type WebflowClientOptions = {
  apiToken: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type WebflowRequestOptions = {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
};

const COLLECTION_ITEMS_PATH =
  /^\/collections\/[^/]+\/items\/?$/i;

/** Garde-fou chemins / méthodes Webflow autorisés. */
export function assertWebflowAllowedRequest(
  method: "GET" | "POST",
  path: string
): void {
  const normalized = path.startsWith("/") ? path : `/${path}`;

  if (/\/(live|publish)(\/|$)/i.test(normalized)) {
    throw new WebflowApiError(
      "bad_request",
      "Endpoints Webflow live/publish interdits."
    );
  }
  if (method === "GET") {
    return;
  }
  if (method === "POST" && COLLECTION_ITEMS_PATH.test(normalized)) {
    return;
  }
  throw new WebflowApiError(
    "bad_request",
    "Seuls GET et POST /collections/{id}/items (brouillon) sont autorisés."
  );
}

/** @deprecated alias — compat tests V7.10.0 */
export function assertWebflowReadOnlyPath(path: string): void {
  assertWebflowAllowedRequest("GET", path);
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
    const method = req.method ?? "GET";
    assertWebflowAllowedRequest(method, req.path);

    if (method === "POST") {
      const body = req.body ?? {};
      if (body.isDraft !== true || body.isArchived !== false) {
        throw new WebflowApiError(
          "bad_request",
          "Création Webflow : isDraft=true et isArchived=false sont obligatoires."
        );
      }
      if (/\/(live|publish)/i.test(req.path)) {
        throw new WebflowApiError(
          "bad_request",
          "Publication Webflow interdite."
        );
      }
    }

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
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(method === "POST"
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body: method === "POST" ? JSON.stringify(req.body ?? {}) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw mapWebflowHttpStatus(
          response.status,
          response.headers.get("retry-after")
        );
      }

      // 202 Accepted possible pour create item
      if (response.status === 204) {
        return {} as T;
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
