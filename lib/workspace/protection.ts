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
  "rapprochements",
  "opportunities",
  "featured_image",
  /// V7.14.0 — Search Console (GA4 Webflow hors périmètre).
  "analytics",
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
      "Images à la une Webflow : génération locale puis transfert Assets + association brouillon staged. Permissions assets:read/assets:write et mapping image/ALT requis. Aucune publication automatique.",
    rapprochements:
      "Rapprochements éditoriaux Webflow : synchronisez l’inventaire CMS de l’espace. Aucun inventaire WordPress n’est réutilisé.",
    opportunities:
      "Opportunités SEO Webflow : inventaire CMS et thématiques isolés. Search Console optionnelle — sans propriété dédiée, idées documentaires uniquement (pas de volumes Google inventés).",
    veille:
      "Veille éditoriale Webflow sans corpus WordPress — configurations et historique isolés par espace.",
    analytics:
      "Search Console / Google Analytics non configurés pour cet espace Webflow. Sélectionnez une propriété Google dédiée dans les paramètres — les statistiques WordPress ne sont jamais affichées ici.",
    topics: "File éditoriale Webflow vide.",
  };
  return {
    empty: true,
    module,
    reason: reasons[module],
  };
}
