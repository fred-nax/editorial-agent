/**
 * Parse sécurisé d’une Response fetch pour les APIs JSON du module GEO.
 * Ne traite jamais une erreur / corps vide comme une liste valide.
 */
export async function readApiJson<T extends Record<string, unknown>>(
  response: Response
): Promise<
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string }
> {
  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text();
  const trimmed = raw.trim();

  if (!trimmed) {
    return {
      ok: false,
      status: response.status,
      error: `Réponse API vide (HTTP ${response.status}). Vérifiez que le serveur local expose /api/ai-visibility (pas une image Docker obsolète).`,
    };
  }

  if (!contentType.includes("application/json")) {
    return {
      ok: false,
      status: response.status,
      error: `Réponse non JSON (HTTP ${response.status}, Content-Type: ${contentType || "absent"}).`,
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(trimmed) as unknown;
  } catch {
    return {
      ok: false,
      status: response.status,
      error: `JSON invalide (HTTP ${response.status}).`,
    };
  }

  if (!data || typeof data !== "object") {
    return {
      ok: false,
      status: response.status,
      error: `Payload API invalide (HTTP ${response.status}).`,
    };
  }

  const record = data as T & { error?: string };
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error:
        typeof record.error === "string" && record.error.trim()
          ? record.error
          : `Erreur API HTTP ${response.status}.`,
    };
  }

  return { ok: true, status: response.status, data: record };
}
