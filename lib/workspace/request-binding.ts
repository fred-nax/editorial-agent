import { WorkspaceContextError } from "./errors";
import type { EditorialWorkspaceRecord } from "./context";

/** Header client pour lier une mutation à l’espace affiché dans l’onglet. */
export const WORKSPACE_REQUEST_HEADER = "x-naxialis-workspace-id";

/**
 * Vérifie que l’en-tête client (si présent) correspond à l’espace cookie actif.
 * Absent → OK (compat clients sans header). Présent mais incohérent → refus.
 */
export function assertRequestWorkspaceMatchesActive(
  request: Request,
  active: EditorialWorkspaceRecord
): void {
  const raw = request.headers.get(WORKSPACE_REQUEST_HEADER)?.trim() ?? "";
  if (!raw) {
    return;
  }
  if (raw !== active.id && raw !== active.slug) {
    throw new WorkspaceContextError(
      "WORKSPACE_MISMATCH",
      "Contexte d’espace incohérent entre l’onglet et le cookie serveur. Actualisez la page.",
      409
    );
  }
}
