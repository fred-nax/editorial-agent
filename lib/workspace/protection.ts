import type { EditorialWorkspaceRecord } from "./context";
import { WorkspaceContextError } from "./errors";

/**
 * Protection transitoire V7.11.1 (avant sélecteur UI V7.11.2) :
 * - WordPress : fonctionnement historique préservé ;
 * - Webflow : modules non isolés / non implémentés → refus explicite ou empty state,
 *   jamais de données WordPress en compensation.
 */

export type WebflowModuleCapability =
  | "generation"
  | "history"
  | "dashboard"
  | "inventory"
  | "featured_image"
  | "rapprochements"
  | "opportunities"
  | "veille"
  | "analytics"
  | "topics";

/** Modules Webflow autorisés en V7.11.1 (isolation validée côté données). */
const WEBFLOW_ENABLED_MODULES = new Set<WebflowModuleCapability>([
  "generation",
  "history",
  "dashboard",
  "topics",
]);

export function isWebflowModuleEnabled(
  module: WebflowModuleCapability
): boolean {
  return WEBFLOW_ENABLED_MODULES.has(module);
}

export function assertModuleAllowedForWorkspace(
  workspace: EditorialWorkspaceRecord,
  module: WebflowModuleCapability
): void {
  if (workspace.cmsProvider === "wordpress") {
    return;
  }
  if (!isWebflowModuleEnabled(module)) {
    throw new WorkspaceContextError(
      "WORKSPACE_OPERATION_FORBIDDEN",
      `Module « ${module} » non disponible pour l’espace Webflow dans cette version (pas de données WordPress de substitution).`,
      501
    );
  }
}

/** Empty-state payload pour l’UI Webflow (Analytics sans propriété dédiée, etc.). */
export function webflowEmptyState(module: WebflowModuleCapability): {
  empty: true;
  module: WebflowModuleCapability;
  reason: string;
} {
  const reasons: Record<WebflowModuleCapability, string> = {
    generation: "Génération Webflow indisponible.",
    history: "Aucun historique Webflow.",
    dashboard: "Tableau de bord Webflow vide.",
    inventory: "Inventaire Webflow non disponible dans cette version.",
    featured_image: "Images à la une non disponibles pour Webflow.",
    rapprochements: "Rapprochements éditoriaux non disponibles pour Webflow.",
    opportunities: "Opportunités SEO Webflow non configurées.",
    veille: "Veille éditoriale Webflow non disponible.",
    analytics:
      "Analytics Webflow indisponible tant qu’aucune propriété Google dédiée n’est configurée pour cet espace.",
    topics: "File éditoriale Webflow vide.",
  };
  return {
    empty: true,
    module,
    reason: reasons[module],
  };
}
