import type { EditorialIdentity } from "@/lib/editorial/identity";
import {
  editorialPromptPhrases,
  NAXIALIS_DEFAULT_IDENTITY,
} from "@/lib/editorial/identity";
import type { InternalLinkPlan } from "./internal-links/types";
import { formatInternalLinksForPrompt } from "./internal-links/plan";

export function buildArticlePrompt(
  subject: string,
  linkPlan?: InternalLinkPlan | null,
  identity: EditorialIdentity = NAXIALIS_DEFAULT_IDENTITY
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
