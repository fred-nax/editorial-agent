import type { WorkspaceCmsProvider } from "./constants";

/** Filtre Prisma minimal pour toute lecture/écriture métier. */
export function workspaceWhere(workspaceId: string): { workspaceId: string } {
  return { workspaceId };
}

export function assertWorkspaceId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("workspaceId manquant ou invalide.");
  }
  return value.trim();
}

export function cmsProviderFromWorkspace(
  cmsProvider: string
): WorkspaceCmsProvider {
  if (cmsProvider === "wordpress" || cmsProvider === "webflow") {
    return cmsProvider;
  }
  throw new Error(`cmsProvider d’espace inconnu : ${cmsProvider}`);
}
