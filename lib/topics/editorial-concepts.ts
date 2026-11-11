import { normalizeText, tokenize } from "@/lib/seo/normalize";

/**
 * Termes contextuels faibles : utiles en combinaison, insuffisants seuls
 * pour un « sujet proche » ou un « doublon probable ».
 */
export const WEAK_CONTEXT_TERMS = new Set([
  "securite",
  "securiser",
  "securise",
  "securisee",
  "risque",
  "risques",
  "danger",
  "dangers",
  "menace",
  "menaces",
  "faille",
  "failles",
  "vulnerabilite",
  "vulnerabilites",
  "entreprise",
  "entreprises",
  "pme",
  "pmes",
  "donnees",
  "donnee",
  "data",
  "confidentialite",
  "protection",
  "proteger",
  "protege",
  "outil",
  "outils",
  "solution",
  "solutions",
  "guide",
  "methode",
  "methodes",
  "pratique",
  "pratiques",
  "bonne",
  "bonnes",
  "analyse",
  "article",
  "sujet",
  "usage",
  "usages",
  "technologie",
  "numerique",
  "digital",
  "web",
  "site",
  "sites",
  "environnement",
  "critique",
  "critiques",
  "comprendre",
  "comment",
  "pourquoi",
  "nouveau",
  "nouvelle",
  "alerte",
]);

/** Domaines éditoriaux souples (multi-label possible). */
export const EDITORIAL_DOMAINS = [
  "ai_security",
  "ai_automation",
  "web_security",
  "wordpress",
  "web_dev_api",
  "seo_geo",
  "saas_tools",
  "php_runtime",
] as const;

export type EditorialDomain = (typeof EDITORIAL_DOMAINS)[number];

type ConceptDef = {
  id: string;
  /** Formes textuelles (déjà normalisables). */
  forms: string[];
  domains: EditorialDomain[];
  /** Poids relatif du concept (1 = standard). */
  weight: number;
};

/**
 * Dictionnaire léger de concepts techniques / composés.
 * Maintenable : ajouter une forme = reconnaître un synonyme.
 */
export const TECHNICAL_CONCEPTS: ConceptDef[] = [
  {
    id: "gen_ai",
    forms: [
      "ia generative",
      "intelligence artificielle generative",
      "generative ai",
      "genai",
      "gen ai",
    ],
    domains: ["ai_security", "ai_automation"],
    weight: 1.4,
  },
  {
    id: "ai_security",
    forms: [
      "securite de l ia",
      "securite de lia",
      "securite ia",
      "securite des modeles",
      "securite des llm",
      "securite des agents ia",
      "ai security",
      "llm security",
    ],
    domains: ["ai_security"],
    weight: 1.5,
  },
  {
    id: "llm",
    forms: [
      "llm",
      "llms",
      "large language model",
      "large language models",
      "modele de langage",
      "modeles de langage",
      "grand modele de langage",
      "grands modeles de langage",
    ],
    domains: ["ai_security", "ai_automation"],
    weight: 1.3,
  },
  {
    id: "ai_agent",
    forms: [
      "agent ia",
      "agents ia",
      "agent intelligent",
      "agents intelligents",
      "ai agent",
      "ai agents",
      "agent openai",
    ],
    domains: ["ai_security", "ai_automation"],
    weight: 1.4,
  },
  {
    id: "rag",
    forms: [
      "rag",
      "retrieval augmented generation",
      "generation augmentee par retrieval",
      "recherche documentaire ia",
    ],
    domains: ["ai_security", "ai_automation"],
    weight: 1.3,
  },
  {
    id: "chatgpt",
    forms: ["chatgpt", "chat gpt", "gpt"],
    domains: ["ai_automation", "ai_security", "saas_tools"],
    weight: 1.2,
  },
  {
    id: "owasp_llm",
    forms: ["owasp llm", "owasp llm top", "llm top 10"],
    domains: ["ai_security"],
    weight: 1.4,
  },
  {
    id: "ai_generic",
    forms: [
      "intelligence artificielle",
      "artificial intelligence",
      "machine learning",
      "apprentissage automatique",
    ],
    domains: ["ai_automation", "ai_security"],
    weight: 0.9,
  },
  {
    id: "wordpress_security",
    forms: [
      "securite wordpress",
      "wordpress securite",
      "cybersécurité wordpress",
      "cybersecurite wordpress",
      "session wordpress",
      "sessions wordpress",
    ],
    domains: ["wordpress", "web_security"],
    weight: 1.3,
  },
  {
    id: "wordpress_api",
    forms: [
      "api wordpress",
      "wordpress rest",
      "rest api wordpress",
      "api rest wordpress",
      "wordpress headless",
      "headless wordpress",
    ],
    domains: ["wordpress", "web_dev_api"],
    weight: 1.4,
  },
  {
    id: "wordpress",
    forms: ["wordpress", "woocommerce"],
    domains: ["wordpress"],
    weight: 1.1,
  },
  {
    id: "php_security",
    forms: [
      "securite php",
      "php securite",
      "faille php",
      "failles php",
      "vulnerabilite php",
      "session php",
      "sessions php",
      "php session",
    ],
    domains: ["php_runtime", "web_security"],
    weight: 1.4,
  },
  {
    id: "php",
    forms: ["php"],
    domains: ["php_runtime", "web_dev_api"],
    weight: 1.2,
  },
  {
    id: "web_api",
    forms: ["api rest", "rest api", "api headless", "securiser une api"],
    domains: ["web_dev_api"],
    weight: 1.1,
  },
  {
    id: "seo_geo",
    forms: ["seo", "geo", "referencement", "search engine"],
    domains: ["seo_geo"],
    weight: 1.1,
  },
];

/** Concepts liés (pas identiques) — utiles pour le complémentaire. */
export const RELATED_CONCEPT_PAIRS: Array<[string, string]> = [
  ["gen_ai", "llm"],
  ["gen_ai", "chatgpt"],
  ["gen_ai", "ai_security"],
  ["llm", "ai_security"],
  ["llm", "owasp_llm"],
  ["ai_agent", "ai_security"],
  ["ai_agent", "gen_ai"],
  ["rag", "ai_security"],
  ["rag", "gen_ai"],
  ["chatgpt", "ai_security"],
  ["wordpress", "wordpress_api"],
  ["wordpress", "wordpress_security"],
  ["php", "php_security"],
  ["wordpress_api", "web_api"],
];

export type ExtractedConcepts = {
  conceptIds: string[];
  domains: EditorialDomain[];
  /** Tokens non faibles restants (hors concepts déjà capturés). */
  distinctiveTokens: string[];
  /** Tokens faibles détectés (sécurité, risque…). */
  weakTokens: string[];
  normalized: string;
};

function padded(normalized: string): string {
  return ` ${normalized} `;
}

function conceptPresent(normalized: string, form: string): boolean {
  const needle = normalizeText(form).trim();
  if (!needle) {
    return false;
  }
  if (needle.includes(" ")) {
    return padded(normalized).includes(` ${needle} `);
  }
  // Token isolé (ex. php, rag, llm, ia)
  if (needle.length <= 3) {
    return padded(normalized).includes(` ${needle} `);
  }
  return (
    padded(normalized).includes(` ${needle} `) ||
    padded(normalized).includes(` ${needle}-`) ||
    padded(normalized).includes(`-${needle} `)
  );
}

export function extractEditorialConcepts(text: string): ExtractedConcepts {
  const normalized = normalizeText(text);
  const conceptIds: string[] = [];
  const domains = new Set<EditorialDomain>();
  const matchedSpans: string[] = [];

  for (const concept of TECHNICAL_CONCEPTS) {
    let hit = false;
    for (const form of concept.forms) {
      if (conceptPresent(normalized, form)) {
        hit = true;
        matchedSpans.push(normalizeText(form));
        break;
      }
    }
    if (hit) {
      conceptIds.push(concept.id);
      for (const domain of concept.domains) {
        domains.add(domain);
      }
    }
  }

  // Heuristique IA courte : « ia » seule, hors PHP/WordPress pur.
  if (
    !conceptIds.includes("ai_generic") &&
    !conceptIds.includes("gen_ai") &&
    padded(normalized).includes(" ia ")
  ) {
    conceptIds.push("ai_generic");
    domains.add("ai_automation");
    domains.add("ai_security");
  }

  const tokens = tokenize(normalized);
  const weakTokens = tokens.filter((token) => WEAK_CONTEXT_TERMS.has(token));
  const distinctiveTokens = tokens.filter((token) => {
    if (WEAK_CONTEXT_TERMS.has(token)) {
      return false;
    }
    // Évite de recompter les tokens déjà couverts par un concept composé.
    for (const span of matchedSpans) {
      if (span.split(" ").includes(token)) {
        return false;
      }
    }
    return token.length > 2;
  });

  return {
    conceptIds: [...new Set(conceptIds)],
    domains: [...domains],
    distinctiveTokens: [...new Set(distinctiveTokens)],
    weakTokens: [...new Set(weakTokens)],
    normalized,
  };
}

export function conceptsAreRelated(leftId: string, rightId: string): boolean {
  if (leftId === rightId) {
    return true;
  }
  return RELATED_CONCEPT_PAIRS.some(
    ([a, b]) =>
      (a === leftId && b === rightId) || (a === rightId && b === leftId)
  );
}

export function sharedConceptIds(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((id) => rightSet.has(id));
}

export function relatedConceptPairs(
  left: string[],
  right: string[]
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const a of left) {
    for (const b of right) {
      if (a === b) {
        continue;
      }
      if (conceptsAreRelated(a, b)) {
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

export function sharedDomains(
  left: EditorialDomain[],
  right: EditorialDomain[]
): EditorialDomain[] {
  const rightSet = new Set(right);
  return left.filter((domain) => rightSet.has(domain));
}

export function conceptWeight(id: string): number {
  return TECHNICAL_CONCEPTS.find((item) => item.id === id)?.weight ?? 1;
}

export function conceptLabel(id: string): string {
  const labels: Record<string, string> = {
    gen_ai: "l’IA générative",
    ai_security: "la sécurité de l’IA",
    llm: "les modèles de langage (LLM)",
    ai_agent: "les agents IA",
    rag: "le RAG",
    chatgpt: "ChatGPT",
    owasp_llm: "OWASP LLM",
    ai_generic: "l’intelligence artificielle",
    wordpress_security: "la sécurité WordPress",
    wordpress_api: "les API WordPress",
    wordpress: "WordPress",
    php_security: "la sécurité PHP",
    php: "PHP",
    web_api: "les API web",
    seo_geo: "le SEO / GEO",
  };
  return labels[id] ?? id;
}

/**
 * Domaines incompatibles pour un rapprochement « proche/doublon »
 * sans concept technique partagé ou transversal explicite.
 */
export function domainsConflictWithoutBridge(
  left: EditorialDomain[],
  right: EditorialDomain[]
): boolean {
  const L = new Set(left);
  const R = new Set(right);
  const leftAi = L.has("ai_security") || L.has("ai_automation");
  const rightAi = R.has("ai_security") || R.has("ai_automation");
  const leftPhpWeb =
    L.has("php_runtime") ||
    (L.has("web_security") && !L.has("ai_security") && !L.has("ai_automation"));
  const rightPhpWeb =
    R.has("php_runtime") ||
    (R.has("web_security") && !R.has("ai_security") && !R.has("ai_automation"));

  if (leftAi && rightPhpWeb && !sharedDomains(left, right).includes("wordpress")) {
    // AI vs PHP/web classique sans pont WordPress+AI
    if (!L.has("wordpress") && !R.has("wordpress")) {
      return true;
    }
  }
  if (rightAi && leftPhpWeb && !sharedDomains(left, right).includes("wordpress")) {
    if (!L.has("wordpress") && !R.has("wordpress")) {
      return true;
    }
  }
  return false;
}
