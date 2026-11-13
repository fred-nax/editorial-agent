/**
 * Lecture JSON robuste pour les fetch navigateur.
 * Évite d’exposer « Unexpected end of JSON input » à l’utilisateur.
 */
export async function parseResponseJson<T>(
  response: Response,
  fallbackError: string
): Promise<T> {
  const raw = await response.text();
  if (!raw.trim()) {
    throw new Error(
      response.ok
        ? `${fallbackError} (réponse vide).`
        : `${fallbackError} (HTTP ${response.status}, réponse vide).`
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(
      `${fallbackError} (réponse non JSON, HTTP ${response.status}).`
    );
  }

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `${fallbackError} (HTTP ${response.status}).`;
    throw new Error(message);
  }

  return payload as T;
}
