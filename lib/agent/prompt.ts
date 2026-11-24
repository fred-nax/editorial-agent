import type { CmsDestinationId } from "@/lib/cms/types";
import type { EditorialIdentity } from "@/lib/editorial/identity";
import {
  editorialPromptPhrases,
  NAXIALIS_DEFAULT_IDENTITY,
} from "@/lib/editorial/identity";
import type { InternalLinkPlan } from "./internal-links/types";
import { formatInternalLinksForPrompt } from "./internal-links/plan";

/**
 * Prompt dynamique WordPress historique — ne pas modifier le contenu
 * pour préserver le comportement de l’agent WP.
 */
function buildWordPressArticlePrompt(
  subject: string,
  linkPlan: InternalLinkPlan | null | undefined,
  identity: EditorialIdentity
): string {
  const phrases = editorialPromptPhrases(identity);
  const linkingBlock = linkPlan
    ? formatInternalLinksForPrompt(linkPlan, identity)
    : `
Maillage interne :
${phrases.linkingFallback}
- ne jamais inventer d'URL.
`;

  return `
${phrases.articleIntro}

"${subject}"

Tu dois :

- faire une recherche récente ;
- privilégier les sources officielles ;
- comprendre l'intention de recherche ;
- rédiger un article utile et concret ;
- structurer avec H2 et H3 ;
- générer la FAQ au format accordéon Tailwind prévu dans tes instructions ;
- intégrer le JSON-LD FAQ ;
- ajouter un extrait WordPress ;
- proposer un slug court ;
- générer un meta title Slim SEO ;
- générer une meta description Slim SEO ;
- appliquer strictement les règles de maillage interne ci-dessous ;
- terminer par un CTA cohérent ;
- appeler obligatoirement create_wordpress_draft.

Règles Slim SEO :

- meta_title : idéalement entre 50 et 60 caractères ;
- meta_description : idéalement entre 140 et 160 caractères ;
${phrases.metaBrandHint}
- ne pas dupliquer exactement le titre WordPress si une variante SEO plus efficace est possible ;
- intégrer naturellement le sujet principal ;
- éviter le keyword stuffing ;
- la meta description doit expliquer clairement le bénéfice du contenu et encourager le clic sans formulation excessive.

${linkingBlock}

Ne considère pas la tâche terminée avant que create_wordpress_draft ait été appelée.
`;
}

/**
 * Prompt dynamique Webflow (V7.10.1+) — exige create_webflow_draft.
 * Pas de Slim SEO / WordPress / inventaire WP.
 */
function buildWebflowArticlePrompt(
  subject: string,
  identity: EditorialIdentity
): string {
  const phrases = editorialPromptPhrases(identity);

  return `
${phrases.articleIntro}

"${subject}"

Destination CMS : Webflow (brouillon uniquement, jamais de publication).

Tu dois :

- faire une recherche récente ;
- privilégier les sources officielles ;
- comprendre l'intention de recherche ;
- rédiger un article utile et concret ;
- structurer le contenu HTML Rich Text avec H2 et H3 uniquement (aucun H1) ;
- ne pas inclure de balises script, style, iframe ni d’attributs style inline ;
- proposer un titre, un slug court (minuscules, chiffres, tirets), un extrait, un meta_title et une meta_description ;
- terminer par un CTA cohérent ;
- appeler obligatoirement l’outil create_webflow_draft avec les six paramètres requis (title, content, excerpt, slug, meta_title, meta_description).

Règles Webflow :

- le contenu HTML doit être compatible Rich Text Webflow ;
- ne jamais inventer de références CMS pour catégorie, auteur ou image ;
- ne jamais utiliser d’inventaire WordPress pour le maillage interne ;
- ne jamais inventer d’URL ;
- ne jamais appeler create_wordpress_draft ;
- ne considère pas la tâche terminée tant que create_webflow_draft n’a pas été appelée ;
- ne te contente pas de rédiger l’article en texte : tu dois créer le brouillon via create_webflow_draft.
`;
}

/**
 * Construit le prompt de génération selon la destination CMS.
 * WordPress : prompt historique inchangé.
 * Webflow : prompt dédié exigeant create_webflow_draft.
 */
export function buildArticlePrompt(
  subject: string,
  linkPlan?: InternalLinkPlan | null,
  identity: EditorialIdentity = NAXIALIS_DEFAULT_IDENTITY,
  cmsDestination: CmsDestinationId | string = "wordpress"
): string {
  if (cmsDestination === "webflow") {
    return buildWebflowArticlePrompt(subject, identity);
  }
  return buildWordPressArticlePrompt(subject, linkPlan, identity);
}
