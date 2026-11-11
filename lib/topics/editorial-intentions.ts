import { normalizeText } from "@/lib/seo/normalize";

/**
 * Familles d’intention éditoriale (multi-label possible).
 * Détection déterministe à partir du titre / extrait / sujet — pas du contenu intégral.
 */
export const EDITORIAL_INTENTIONS = [
  "security_risks",
  "privacy_data",
  "comparison_ranking",
  "tutorial_deploy",
  "automation_productivity",
  "news_announcement",
  "cost_budget",
  "governance_compliance",
] as const;

export type EditorialIntention = (typeof EDITORIAL_INTENTIONS)[number];

type IntentionDef = {
  id: EditorialIntention;
  /** Expressions multi-mots (prioritaires) et tokens distinctifs. */
  phrases: string[];
  tokens: string[];
};

/**
 * Signaux d’intention : un seul mot générique (ex. « sécurité » isolé hors contexte
 * technique) ne doit pas suffire — on exige phrase ou combinaison de tokens.
 */
const INTENTION_DEFS: IntentionDef[] = [
  {
    id: "security_risks",
    phrases: [
      "securite de l ia",
      "securite des modeles",
      "securite des llm",
      "securite des agents",
      "risques de l ia",
      "risques de lia",
      "surface d attaque",
      "surfaces d attaque",
      "injection de prompt",
      "prompt injection",
    ],
    tokens: [
      "vulnerabilite",
      "vulnerabilites",
      "faille",
      "failles",
      "attaque",
      "attaques",
      "menace",
      "menaces",
      "exploit",
      "mitigation",
      "mitigations",
      "owasp",
      "cybersecurite",
      "hardening",
    ],
  },
  {
    id: "privacy_data",
    phrases: [
      "protection des donnees",
      "donnees sensibles",
      "donnees personnelles",
      "vie privee",
    ],
    tokens: [
      "confidentialite",
      "privacy",
      "rgpd",
      "gdpr",
      "exposition",
      "exposer",
    ],
  },
  {
    id: "comparison_ranking",
    phrases: [
      "classement des",
      "comparatif des",
      "meilleures ia",
      "meilleur modele",
    ],
    tokens: [
      "classement",
      "comparatif",
      "comparer",
      "versus",
      "vs",
      "benchmark",
      "benchmarks",
      "top",
    ],
  },
  {
    id: "tutorial_deploy",
    phrases: [
      "comment deployer",
      "comment integrer",
      "methode en",
      "guide pratique",
      "pas a pas",
    ],
    tokens: [
      "deployer",
      "deploiement",
      "installer",
      "installation",
      "integrer",
      "integration",
      "tutoriel",
      "tutorial",
      "etapes",
      "checklist",
    ],
  },
  {
    id: "automation_productivity",
    phrases: ["gains de productivite", "automatiser les"],
    tokens: [
      "automatisation",
      "automatiser",
      "productivite",
      "workflow",
      "workflows",
      "efficacite",
    ],
  },
  {
    id: "news_announcement",
    phrases: [
      "nouveau modele",
      "nouvelle version",
      "ce que change",
      "vient de sortir",
    ],
    tokens: [
      "annonce",
      "nouveaute",
      "nouveautes",
      "lancement",
      "release",
      "changelog",
      "astra",
    ],
  },
  {
    id: "cost_budget",
    phrases: ["couts de", "budget ia", "retour sur investissement"],
    tokens: ["cout", "couts", "tarif", "tarifs", "prix", "budget", "roi"],
  },
  {
    id: "governance_compliance",
    phrases: [
      "gouvernance de l ia",
      "gouvernance ia",
      "conformite reglementaire",
    ],
    tokens: [
      "gouvernance",
      "conformite",
      "compliance",
      "reglementation",
      "politique",
      "politiques",
      "cadre",
    ],
  },
];

/** Intentions réellement complémentaires (maillage), pas conflictuelles. */
export const RELATED_INTENTION_PAIRS: Array<
  [EditorialIntention, EditorialIntention]
> = [
  ["security_risks", "privacy_data"],
  ["security_risks", "governance_compliance"],
  ["privacy_data", "governance_compliance"],
  ["tutorial_deploy", "automation_productivity"],
  ["news_announcement", "comparison_ranking"],
];

function padded(normalized: string): string {
  return ` ${normalized} `;
}

function hasPhrase(normalized: string, phrase: string): boolean {
  const needle = normalizeText(phrase).trim();
  if (!needle) {
    return false;
  }
  return padded(normalized).includes(` ${needle} `);
}

function hasToken(normalized: string, token: string): boolean {
  const needle = normalizeText(token).trim();
  if (!needle) {
    return false;
  }
  return padded(normalized).includes(` ${needle} `);
}

/**
 * Heuristique sécurité : « sécurité » / « risques » ne comptent que s’ils
 * coexistent avec un ancrage IA / technique. Ignore les négations courtes
 * (« sans focus sécurité », « sans risque »).
 */
function securityHeuristic(normalized: string): boolean {
  const withoutNegation = padded(normalized)
    .replace(/ sans (?:\w+ ){0,3}(securite|securiser|risque|risques) /g, " ")
    .replace(/\s+/g, " ");
  const hasSecurityWord =
    / securite | securiser | risque | risques /.test(withoutNegation);
  if (!hasSecurityWord) {
    return false;
  }

  const techAnchor =
    hasToken(normalized, "ia") ||
    hasToken(normalized, "llm") ||
    hasToken(normalized, "agent") ||
    hasToken(normalized, "agents") ||
    hasToken(normalized, "modele") ||
    hasToken(normalized, "modeles") ||
    hasToken(normalized, "chatgpt") ||
    hasToken(normalized, "rag") ||
    hasToken(normalized, "api") ||
    hasToken(normalized, "wordpress") ||
    hasToken(normalized, "php") ||
    hasPhrase(normalized, "intelligence artificielle");
  return techAnchor;
}

export function extractEditorialIntentions(text: string): EditorialIntention[] {
  const normalized = normalizeText(text);
  const found = new Set<EditorialIntention>();

  for (const def of INTENTION_DEFS) {
    let hit = false;
    for (const phrase of def.phrases) {
      if (hasPhrase(normalized, phrase)) {
        hit = true;
        break;
      }
    }
    if (!hit) {
      let tokenHits = 0;
      for (const token of def.tokens) {
        if (hasToken(normalized, token)) {
          tokenHits += 1;
          if (tokenHits >= 1 && def.id !== "security_risks") {
            // Un token fort distinctif suffit (vulnérabilité, classement, RGPD…).
            hit = true;
            break;
          }
          if (tokenHits >= 1 && def.id === "security_risks") {
            hit = true;
            break;
          }
        }
      }
    }
    if (hit) {
      found.add(def.id);
    }
  }

  if (securityHeuristic(normalized)) {
    found.add("security_risks");
  }

  return EDITORIAL_INTENTIONS.filter((id) => found.has(id));
}

export function sharedIntentions(
  left: EditorialIntention[],
  right: EditorialIntention[]
): EditorialIntention[] {
  const rightSet = new Set(right);
  return left.filter((id) => rightSet.has(id));
}

export function intentionsAreRelated(
  left: EditorialIntention,
  right: EditorialIntention
): boolean {
  if (left === right) {
    return true;
  }
  return RELATED_INTENTION_PAIRS.some(
    ([a, b]) => (a === left && b === right) || (a === right && b === left)
  );
}

export function relatedIntentionPairs(
  left: EditorialIntention[],
  right: EditorialIntention[]
): Array<[EditorialIntention, EditorialIntention]> {
  const pairs: Array<[EditorialIntention, EditorialIntention]> = [];
  for (const a of left) {
    for (const b of right) {
      if (a === b) {
        continue;
      }
      if (intentionsAreRelated(a, b)) {
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

export function intentionOverlapScore(
  left: EditorialIntention[],
  right: EditorialIntention[]
): {
  shared: EditorialIntention[];
  related: Array<[EditorialIntention, EditorialIntention]>;
  score: number;
  aligned: boolean;
  complementaryBridge: boolean;
} {
  const shared = sharedIntentions(left, right);
  const related = relatedIntentionPairs(left, right);
  let score = 0;
  score += Math.min(0.28, shared.length * 0.14);
  // Pont complémentaire (ex. sécurité ↔ confidentialité) doit peser assez
  // pour atteindre le seuil complementaryMin avec un objet technique lié.
  score += Math.min(0.24, related.length * 0.12);
  return {
    shared,
    related,
    score: Math.min(1, score),
    aligned: shared.length > 0,
    complementaryBridge: shared.length > 0 || related.length > 0,
  };
}

export function intentionLabel(id: EditorialIntention): string {
  const labels: Record<EditorialIntention, string> = {
    security_risks: "les risques et la sécurité",
    privacy_data: "la confidentialité des données",
    comparison_ranking: "la comparaison ou le classement d’outils",
    tutorial_deploy: "le déploiement ou l’intégration",
    automation_productivity: "l’automatisation et la productivité",
    news_announcement: "une actualité produit",
    cost_budget: "les coûts et le budget",
    governance_compliance: "la gouvernance et la conformité",
  };
  return labels[id];
}
