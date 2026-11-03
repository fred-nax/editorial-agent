import { db } from "../../db";
import { logInfo } from "../../logger";
import { loadPublishedCatalog } from "./catalog";
import { selectInternalLinks, type SelectOptions } from "./select";
import type { InternalLinkPlan } from "./types";

/**
 * Construit le plan de maillage pour un sujet à partir de l'inventaire publié.
 */
export async function buildInternalLinkPlan(
  subject: string,
  options: SelectOptions = {}
): Promise<InternalLinkPlan> {
  const { entries, stale } = await loadPublishedCatalog();

  let recentUrls = options.recentUrls;
  if (!recentUrls) {
    recentUrls = await loadRecentInternalUrlsHint();
  }

  const plan = selectInternalLinks(subject, entries, {
    ...options,
    recentUrls,
  });
  plan.catalogStale = stale;

  logInfo("internal-links", "plan built", {
    subject: subject.slice(0, 120),
    catalogSize: plan.catalogSize,
    catalogStale: stale ? 1 : 0,
    themes: plan.themes.join(","),
    selectedCount: plan.selected.length,
    selectedUrls: plan.selected.map((item) => item.url).join(" | "),
    selectedScores: plan.selected
      .map((item) => Math.round(item.score * 100))
      .join(","),
    rejectedTop: plan.rejected
      .slice(0, 5)
      .map((item) => `${item.title.slice(0, 40)}:${Math.round(item.score * 100)}`)
      .join(" | "),
  });

  return plan;
}

/**
 * Indice de diversification soft : titres/sujets récents (pas d'historique de liens stocké).
 * On récupère les URLs WP des dernières générations complétées comme proxy faible.
 */
async function loadRecentInternalUrlsHint(): Promise<string[]> {
  const recent = await db.articleGeneration.findMany({
    where: { status: "completed", wpUrl: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { wpUrl: true },
  });
  return recent
    .map((row) => row.wpUrl)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
}

export function formatInternalLinksForPrompt(plan: InternalLinkPlan): string {
  if (plan.selected.length === 0) {
    return `
Maillage interne :
- Aucune destination interne suffisamment pertinente n'a été trouvée pour ce sujet.
- N'ajoute AUCUN lien interne vers naxialis.com.
- Ne invente aucune URL.
`;
  }

  const lines = plan.selected.map((item, index) => {
    const anchors = item.suggestedAnchors
      .map((anchor) => `"${anchor}"`)
      .join(", ");
    const sections = item.suggestedSections.join(" ; ");
    return `${index + 1}. ${item.title}
   URL autorisée : ${item.url}
   Pertinence : ${item.justification}
   Relation : ${item.relation}
   Sections possibles : ${sections}
   Ancres possibles : ${anchors}`;
  });

  return `
Maillage interne (obligatoire — destinations AUTORISÉES uniquement) :

Tu ne dois utiliser QUE les URL ci-dessous pour tout lien interne Naxialis.
N'invente aucune URL. Tu peux choisir d'utiliser 0 à ${Math.min(4, plan.selected.length)} de ces liens.
Place chaque lien dans un paragraphe où il apporte une information complémentaire réelle.
Ancres descriptives et variées — interdits : « cliquez ici », « consultez notre article » répété, piles de liens en conclusion.
Pas de doublon d'URL. Pas de lien commercial hors contexte.

Destinations autorisées :
${lines.join("\n")}
`;
}
