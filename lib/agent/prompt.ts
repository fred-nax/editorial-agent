import type { InternalLinkPlan } from "./internal-links/types";
import { formatInternalLinksForPrompt } from "./internal-links/plan";

export function buildArticlePrompt(
  subject: string,
  linkPlan?: InternalLinkPlan | null
): string {
  const linkingBlock = linkPlan
    ? formatInternalLinksForPrompt(linkPlan)
    : `
Maillage interne :
- intégrer des liens internes pertinents vers Naxialis uniquement s'ils sont explicitement fournis ailleurs dans ce message ;
- ne jamais inventer d'URL.
`;

  return `
Crée un article complet pour le blog Naxialis sur :

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
- ne pas ajouter automatiquement "NAXIALIS" au meta title sauf si cela reste pertinent et sous 60 caractères ;
- ne pas dupliquer exactement le titre WordPress si une variante SEO plus efficace est possible ;
- intégrer naturellement le sujet principal ;
- éviter le keyword stuffing ;
- la meta description doit expliquer clairement le bénéfice du contenu et encourager le clic sans formulation excessive.

${linkingBlock}

Ne considère pas la tâche terminée avant que create_wordpress_draft ait été appelée.
`;
}
