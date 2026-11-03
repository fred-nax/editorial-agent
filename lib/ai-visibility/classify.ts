import {
  categoryToLegacyKind,
  type EntityCategory,
  type ExtractedEntity,
  type MentionKind,
} from "./constants";
import {
  brandNameVariants,
  type BrandIdentity,
} from "./brand-identity";
import { isGenericDescriptor } from "./generic-filter";
import {
  entityNormalizedKey,
  expandAliasKeys,
  matchesAlias,
  resolveIdentity,
  resolveParentKey,
} from "./resolve";

/**
 * Classification GEO 1.1.3 — règles locales, sans inventer d’infos entreprise.
 * Concurrent direct : uniquement concurrents déclarés (ou correction manuelle).
 * En cas de doute → unknown.
 */

type ClassificationResult = {
  category: EntityCategory;
  confidence: number;
  justification: string;
};

/** Organismes / dispositifs publics — pas spécifiques à une marque cliente. */
const INSTITUTION_KEYS = new Set([
  "bpifrance",
  "anssi",
  "cnil",
  "insee",
  "dinum",
  "france travail",
  "pole emploi",
  "urssaf",
  "dgfip",
  "ministere",
  "commission europeenne",
  "union europeenne",
  "ocde",
  "onu",
  "unesco",
  "afnor",
  "ademe",
  "france num",
  "france numerique",
]);

const SOFTWARE_KEYS = new Set([
  "gemini",
  "chatgpt",
  "openai",
  "claude",
  "copilot",
  "slack",
  "microsoft",
  "microsoft 365",
  "office 365",
  "azure",
  "microsoft azure",
  "microsoft teams",
  "salesforce",
  "hubspot",
  "notion",
  "zapier",
  "n8n",
  "make",
  "zendesk",
  "intercom",
  "shopify",
  "wordpress",
  "woocommerce",
  "google workspace",
  "google cloud",
  "aws",
  "amazon web services",
  "azure openai",
  "langchain",
  "langgraph",
  "pinecone",
  "huggingface",
  "hugging face",
  "midjourney",
  "stable diffusion",
  "perplexity",
  "anthropic",
  "sharepoint",
  "whatsapp",
  "pennylane",
  "ibm",
]);

const INFORMATION_SOURCE_KEYS = new Set([
  "wikipedia",
  "wikimedia",
  "les echos",
  "le monde",
  "frenchweb",
  "siecle digital",
  "journal du net",
  "zdnet",
  "01net",
  "techcrunch",
  "harvard business review",
  "mckinsey",
  "eur lex",
  "eurlex",
  "ai act",
  "ai act service desk",
]);

const INFORMATION_SOURCE_DOMAINS = [
  "wikipedia.org",
  "wikimedia.org",
  "legifrance.gouv.fr",
  "service-public.fr",
  "europa.eu",
  "eur-lex.europa.eu",
];

const INSTITUTION_DOMAIN_SUFFIXES = [".gouv.fr", ".gov", ".edu"];

const PROVIDER_NAME_HINTS =
  /\b(agence|agency|studio|cabinet|consulting|conseil|prestataire|freelance|labs?|solutions?)\b/i;

const SOFTWARE_CONTEXT_HINTS =
  /\b(logiciel|software|plateforme|platform|outil|tool|saas|suite|app(lication)?|api)\b/i;

const INSTITUTION_CONTEXT_HINTS =
  /\b(organisme|institution|administration|minist[eè]re|r[eé]gulateur|association|dispositif\s+public)\b/i;

const RECOMMENDATION_HINTS =
  /(recommand(e|ons|é|ée|és|ées)?|conseill(e|ons|é|ée)?|optez pour|je\s+vous\s+(conseille|recommande)|meilleur(e)?\s+(choix|option|agence|prestataire)|parmi\s+les\s+(meilleur|options))/i;

const NEGATIVE_HINTS =
  /(éviter|eviter|déconseill|deconseill|mauvais(e)?\s+(choix|option)|ne\s+pas\s+(choisir|retenir)|à\s+éviter|a\s+eviter)/i;

/** Exact ou préfixe lexical (« bpifrance le lab » ⊃ « bpifrance »). */
function keyMatchesDictionary(key: string, set: Set<string>): boolean {
  for (const item of expandAliasKeys(key)) {
    if (set.has(item)) {
      return true;
    }
    for (const known of set) {
      if (item === known || item.startsWith(`${known} `)) {
        return true;
      }
    }
  }
  return false;
}

function looksLikeInstitution(key: string, domain: string | null): boolean {
  if (keyMatchesDictionary(key, INSTITUTION_KEYS)) {
    return true;
  }
  if (domain) {
    const d = domain.toLowerCase();
    if (INSTITUTION_DOMAIN_SUFFIXES.some((suffix) => d.endsWith(suffix))) {
      return true;
    }
  }
  return false;
}

function looksLikeSoftware(key: string): boolean {
  if (keyMatchesDictionary(key, SOFTWARE_KEYS)) {
    return true;
  }
  if (expandAliasKeys(key).some((item) => resolveParentKey(item))) {
    return true;
  }
  return false;
}

function looksLikeInformationSource(
  key: string,
  domain: string | null
): boolean {
  if (keyMatchesDictionary(key, INFORMATION_SOURCE_KEYS)) {
    return true;
  }
  if (domain) {
    const d = domain.toLowerCase();
    if (
      INFORMATION_SOURCE_DOMAINS.some(
        (item) => d === item || d.endsWith(`.${item}`) || d.endsWith(item)
      )
    ) {
      return true;
    }
  }
  return false;
}

export function classifyEntity(input: {
  name: string;
  domain?: string | null;
  excerpt?: string | null;
  mentionKind?: MentionKind | null;
  brand: BrandIdentity;
  campaignSubject?: string | null;
}): ClassificationResult {
  const identity = resolveIdentity({
    name: input.name,
    domain: input.domain,
  });
  const key = identity.normalizedKey;
  const domain = identity.domain;
  const excerpt = input.excerpt ?? "";
  const context = `${excerpt} ${input.campaignSubject ?? ""}`;

  // Marque cible
  const brandKeys = brandNameVariants(input.brand);
  if (
    brandKeys.includes(key) ||
    matchesAlias(input.name, input.brand.aliases) ||
    (domain &&
      [input.brand.primaryDomain, ...(input.brand.domainAliases ?? [])]
        .map((item) => item.toLowerCase())
        .some((alias) => domain === alias || domain.endsWith(`.${alias}`)))
  ) {
    return {
      category: "target_brand",
      confidence: 0.95,
      justification: "Correspond à la marque analysée (nom, alias ou domaine).",
    };
  }

  // Concurrent connu déclaré sur la marque — seule voie automatique vers direct_competitor
  for (const competitor of input.brand.knownCompetitors ?? []) {
    if (entityNormalizedKey(competitor.name) === key) {
      return {
        category: "direct_competitor",
        confidence: 0.9,
        justification:
          "Listé comme concurrent connu de la marque analysée.",
      };
    }
    if (
      competitor.domain &&
      domain &&
      competitor.domain.toLowerCase() === domain
    ) {
      return {
        category: "direct_competitor",
        confidence: 0.85,
        justification:
          "Domaine correspondant à un concurrent connu déclaré.",
      };
    }
  }

  if (
    looksLikeInstitution(key, domain) ||
    (INSTITUTION_CONTEXT_HINTS.test(context) &&
      keyMatchesDictionary(key, INSTITUTION_KEYS))
  ) {
    return {
      category: "institution",
      confidence: looksLikeInstitution(key, domain) ? 0.9 : 0.7,
      justification:
        "Organisme / institution / dispositif public identifiable — pas un concurrent commercial.",
    };
  }

  if (looksLikeInformationSource(key, domain)) {
    return {
      category: "information_source",
      confidence: 0.85,
      justification: "Source documentaire, juridique ou service d’information identifiable.",
    };
  }

  if (looksLikeSoftware(key)) {
    return {
      category: "software_product",
      confidence: 0.88,
      justification:
        "Logiciel, plateforme ou produit technologique identifiable — pas un prestataire concurrent.",
    };
  }
  if (
    SOFTWARE_CONTEXT_HINTS.test(context) &&
    !PROVIDER_NAME_HINTS.test(input.name) &&
    /\b(outil|logiciel|plateforme|saas)\b/i.test(context)
  ) {
    return {
      category: "unknown",
      confidence: 0.4,
      justification:
        "Contexte logiciel détecté sans identité produit suffisamment étayée.",
    };
  }

  // Expressions génériques (« Agence IA », « Agent IA ») → jamais concurrent
  if (isGenericDescriptor(input.name)) {
    return {
      category: "other",
      confidence: 0.9,
      justification:
        "Expression descriptive générique — pas une identité de marque vérifiable.",
    };
  }

  // Prestataire plausible sans concurrent déclaré → unknown (pas de promotion auto)
  const providerName = PROVIDER_NAME_HINTS.test(input.name);
  const providerContext =
    /\b(agence|prestataire|cabinet|studio|accompagnement|int[eé]grateur)\b/i.test(
      excerpt
    );
  // Note : on n’utilise PAS le sujet de campagne seul pour inférer un concurrent
  // (évite de classer toute entité « concurrente » parce que le sujet contient « agence »).

  if (providerName || providerContext) {
    return {
      category: "unknown",
      confidence: 0.45,
      justification:
        "Indices prestataire insuffisants pour un concurrent direct — ajoutez-le aux concurrents connus ou corrigez manuellement.",
    };
  }

  // Citation seule sans corps → source info si domaine média, sinon unknown
  if (input.mentionKind === "citation_only") {
    return {
      category: looksLikeInformationSource(key, domain)
        ? "information_source"
        : "unknown",
      confidence: 0.5,
      justification:
        "Apparition limitée aux sources/citations — classification prudente.",
    };
  }

  return {
    category: "unknown",
    confidence: 0.35,
    justification:
      "Indices insuffisants pour classer comme concurrent, logiciel ou institution. UNKNOWN par prudence.",
  };
}

export function classifyMentionKind(input: {
  excerpt: string | null | undefined;
  inBody: boolean;
  citationOnly: boolean;
}): MentionKind {
  if (input.citationOnly && !input.inBody) {
    return "citation_only";
  }
  const excerpt = input.excerpt ?? "";
  if (NEGATIVE_HINTS.test(excerpt) && !RECOMMENDATION_HINTS.test(excerpt)) {
    return "negative";
  }
  if (RECOMMENDATION_HINTS.test(excerpt)) {
    return "recommendation";
  }
  return "mention";
}

/**
 * Applique classification locale + legacy kind (GEO 1.1.4).
 * Les catégories d’autorité LLM (target_brand, *_competitor) sont ignorées :
 * seule classifyEntity (+ knownCompetitors / preuves) fait foi.
 * Ne remplace pas une classification manuelle (géré côté persistance).
 */
export function enrichExtractedEntity(
  entity: Omit<ExtractedEntity, "category" | "kind"> & {
    category?: EntityCategory | null;
    kind?: ExtractedEntity["kind"] | null;
  },
  brand: BrandIdentity,
  campaignSubject?: string | null
): ExtractedEntity {
  const proposed = entity.category ?? null;
  const classified = classifyEntity({
    name: entity.name,
    domain: entity.domain,
    excerpt: entity.excerpt,
    mentionKind: entity.mentionKind,
    brand,
    campaignSubject,
  });

  const authorityProposed =
    proposed === "target_brand" ||
    proposed === "direct_competitor" ||
    proposed === "indirect_competitor";

  // Toujours l’autorité locale (dictionnaires + knownCompetitors)
  const category = classified.category;
  let justification = classified.justification;
  if (authorityProposed && proposed !== classified.category) {
    justification = `${classified.justification} [Proposition ${proposed} rejetée — autorité locale.]`;
  }

  return {
    ...entity,
    rawName: entity.rawName ?? entity.name,
    category,
    categoryConfidence: classified.confidence,
    categoryJustification: justification,
    kind: categoryToLegacyKind(category),
    parentKey: resolveParentKey(entityNormalizedKey(entity.name)),
  };
}

export function isDirectOrIndirectCompetitor(
  category: EntityCategory
): boolean {
  return (
    category === "direct_competitor" || category === "indirect_competitor"
  );
}
