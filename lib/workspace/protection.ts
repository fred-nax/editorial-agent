import type { EditorialWorkspaceRecord } from "./context";
import { WorkspaceContextError } from "./errors";

/**
 * Capacités par espace (V7.11.2) :
 * - WordPress : fonctionnement historique préservé ;
 * - Webflow : modules isolés autorisés ; modules dépendant d’un inventaire /
 *   Google / images non implémentés → refus explicite ou empty state,
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

/** Modules Webflow autorisés (isolation données validée). */
const WEBFLOW_ENABLED_MODULES = new Set<WebflowModuleCapability>([
  "generation",
  "history",
  "dashboard",
  "topics",
  "veille",
  "inventory",
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
    inventory:
      "Inventaire CMS Webflow : synchronisez la collection configurée. Aucun inventaire WordPress n’est réutilisé.",
    featured_image:
      "Images à la une non disponibles pour Webflow dans cette version.",
    rapprochements:
      "Rapprochements éditoriaux (inventaire WordPress) non disponibles pour Webflow.",
    opportunities:
      "Opportunités SEO Webflow indisponibles : l’inventaire et le maillage Webflow ne sont pas encore implémentés. Les thématiques et opportunités WordPress ne sont pas injectées.",
    veille:
      "Veille éditoriale Webflow sans corpus WordPress — configurations et historique isolés par espace.",
    analytics:
      "Analytics Webflow indisponible tant qu’aucune propriété Google dédiée n’est configurée pour cet espace. Les statistiques WordPress ne sont pas affichées.",
    topics: "File éditoriale Webflow vide.",
  };
  return {
    empty: true,
    module,
    reason: reasons[module],
  };
}
