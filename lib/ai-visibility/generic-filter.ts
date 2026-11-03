import { normalizeDomain } from "./constants";
import { entityNormalizedKey } from "./resolve";

/** Tokens descriptifs génériques (FR/EN) — pas une identité de marque à eux seuls. */
const GENERIC_TOKENS = new Set([
  "agent",
  "agents",
  "assistant",
  "assistants",
  "expert",
  "experts",
  "agence",
  "agences",
  "agency",
  "data",
  "donnee",
  "donnees",
  "solution",
  "solutions",
  "outil",
  "outils",
  "tool",
  "tools",
  "plateforme",
  "platform",
  "service",
  "services",
  "prestataire",
  "prestataires",
  "entreprise",
  "entreprises",
  "societe",
  "cabinet",
  "studio",
  "lab",
  "labs",
  "ai",
  "ia",
  "intelligence",
  "artificielle",
  "artificial",
  "digital",
  "numerique",
  "pme",
  "saas",
  "offre",
  "offres",
  "produit",
  "produits",
  "logiciel",
  "logiciels",
  "software",
  "chatbot",
  "chatbots",
  "bot",
  "bots",
  "model",
  "modele",
  "modeles",
  "systeme",
  "systemes",
  "projet",
  "projets",
  "equipe",
  "equipes",
  "client",
  "clients",
  "marche",
  "secteur",
  "metier",
  "production",
  "operationnel",
  "operationnels",
  "personnalise",
  "personnalises",
  "connecte",
  "supervise",
  "standard",
  "classique",
  "deterministe",
  "connaissance",
  "workflow",
  "workflows",
  "pilote",
  "cadre",
  "cadrage",
  "outille",
  "unique",
  "humain",
  "integre",
  "specialises",
  "specialise",
]);

const GENERIC_PHRASE_EXACT = new Set([
  "agent ia",
  "agents ia",
  "agent ai",
  "agents ai",
  "assistant ia",
  "assistants ia",
  "expert ia",
  "experts ia",
  "agence ia",
  "agences ia",
  "data ia",
  "solution ia",
  "solutions ia",
  "outil ia",
  "plateforme ia",
  "intelligence artificielle",
  "artificial intelligence",
]);

/**
 * Une expression est générique si, hors tokens IA/AI/descriptifs,
 * il ne reste aucun token distinctif d’identité.
 */
export function isGenericDescriptor(name: string): boolean {
  const key = entityNormalizedKey(name);
  if (!key) {
    return true;
  }
  if (GENERIC_PHRASE_EXACT.has(key)) {
    return true;
  }
  const tokens = key.split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }
  // Phrases produit / processus démarrant par un descripteur
  if (
    /^(?:agent|assistant|chatbot|outil|modele|workflow|pilote|automatisation)\b/.test(
      key
    )
  ) {
    return true;
  }
  const distinctive = tokens.filter((token) => !GENERIC_TOKENS.has(token));
  if (distinctive.length === 0) {
    return true;
  }
  if (distinctive.length === 1 && distinctive[0]!.length < 3) {
    return true;
  }
  return false;
}

/** Acronymes métier / techniques — pas des marques sans autre preuve. */
const BUSINESS_ACRONYMS = new Set([
  "crm",
  "erp",
  "eti",
  "tpe",
  "pme",
  "rag",
  "rpa",
  "api",
  "llm",
  "gpt",
  "ocr",
  "faq",
  "poc",
  "mfa",
  "rssi",
  "dpo",
  "kpi",
  "roi",
  "saas",
  "ged",
  "adv",
  "btp",
  "cgv",
  "rib",
  "aipd",
]);

const FR_PLACE_NAMES = new Set([
  "paris",
  "lyon",
  "marseille",
  "toulouse",
  "bordeaux",
  "nantes",
  "lille",
  "rennes",
  "nice",
  "strasbourg",
  "montpellier",
  "merignac",
  "levallois",
  "levallois perret",
  "la defense",
]);

/** Hostname / FQDN — pas un nom d’entreprise affichable. */
export function looksLikeHostname(name: string): boolean {
  const raw = name.trim().toLowerCase();
  if (!raw || /\s/.test(raw)) {
    return false;
  }
  return (
    /^[a-z0-9][a-z0-9.-]*\.(?:com|fr|io|ai|eu|net|org|co|dev|app|gov|gouv\.fr)(?:\/.*)?$/i.test(
      raw
    ) || /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(raw)
  );
}

/**
 * Morphologie FR : verbes, impératifs, noms abstraits courants — pas une marque.
 */
/** Montants / fourchettes tarifaires — pas une identité. */
export function looksLikePriceOrQuantity(name: string): boolean {
  const raw = name.trim();
  return (
    /\d[\d\s.,]*\s*(?:€|k€|euros?)/i.test(raw) ||
    /^\d[\d\s.,]*\s*[–—-]\s*\d/.test(raw) ||
    /\d+\s*[–—-]\s*\d+\s*(?:k€|€)/i.test(raw)
  );
}

export function looksLikeFrenchFunctionWord(name: string): boolean {
  const key = entityNormalizedKey(name);
  if (!key) {
    return false;
  }
  if (FR_PLACE_NAMES.has(key)) {
    return true;
  }
  if (key.includes(" ")) {
    // Impératifs / formes « Donnez-lui »
    if (/^(?:donnez|utilisez|testez|gardez|selectionnez)\b/.test(key)) {
      return true;
    }
    return false;
  }
  // Impératif pluriel / forme en -ez (Utilisez, Testez, Sélectionnez…)
  if (/^[a-z]{3,}ez$/.test(key) && key.length >= 5) {
    return true;
  }
  // Infinitifs fréquents
  if (
    /^(?:analyser|mettre|piloter|repondre|repond|rediger|realiser|reduire|resumer|synthetiser|traduire|traiter|verifier|reperer|utiliser|tester|garder|donner|exister|convenir)$/.test(
      key
    )
  ) {
    return true;
  }
  if (
    /(?:er|ir)$/.test(key) &&
    key.length >= 6 &&
    !/(?:ier|power|center|master|partner|tower|paper|water|order|layer)$/.test(
      key
    )
  ) {
    // Heuristique : infinitif FR capitalisé (Analyser, Traiter) — pas SharePoint/etc.
    return true;
  }
  if (
    /re$/.test(key) &&
    key.length >= 6 &&
    /^(?:repondre|mettre|etre|faire|dire|lire|ecrire|suivre|vivre|ouvrir|couvrir)/.test(
      key
    )
  ) {
    return true;
  }
  // Noms abstraits / pluriels métier
  if (
    /(?:tion|sion|ment|ance|ence|ique|isme|ites?|eurs?|euses?|istes?)$/.test(
      key
    ) &&
    key.length >= 6
  ) {
    return true;
  }
  if (
    /^(?:taches|budgets|volumes?|seuils|regles|risques?|operations?|statuts?|vigilances?|repartitions?|approbations?|assistances?|decisions?|controles?|cadres?|raccourcis?|preuves?|listes?|points?|montants?|delais?|usages?|messages?)$/.test(
      key
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Mot / titre markdown / acronyme métier sans identité démontrable.
 * Structurelle — pas seulement une stop-list de marques.
 */
export function isLexicalNoiseName(name: string): boolean {
  const key = entityNormalizedKey(name);
  if (!key) {
    return true;
  }
  if (looksLikeHostname(name)) {
    return true;
  }
  if (looksLikePriceOrQuantity(name)) {
    return true;
  }
  if (isGenericDescriptor(name)) {
    return true;
  }
  if (looksLikeFrenchFunctionWord(name)) {
    return true;
  }
  // En-têtes / totaux de tableau
  if (/^(?:total|sous total|montant|prix|cout|coût)$/i.test(key)) {
    return true;
  }
  const tokens = key.split(" ").filter(Boolean);
  if (tokens.length === 1) {
    const token = tokens[0]!;
    if (BUSINESS_ACRONYMS.has(token)) {
      return true;
    }
    if (GENERIC_TOKENS.has(token)) {
      return true;
    }
    const noiseSingles = new Set([
      "support",
      "comment",
      "avant",
      "apres",
      "information",
      "informations",
      "validation",
      "formation",
      "recommandation",
      "option",
      "besoin",
      "niveau",
      "processus",
      "pertinent",
      "conseil",
      "votre",
      "devis",
      "classer",
      "usages",
      "usage",
      "message",
      "admin",
      "administratif",
      "administration",
      "analyse",
      "budget",
      "cadres",
      "cadre",
      "impact",
      "gestion",
      "marketing",
      "finance",
      "relation",
      "recherche",
      "protection",
      "direction",
      "conception",
      "construction",
      "gouvernance",
      "automatisation",
      "developpement",
      "integration",
      "integrations",
      "conversation",
      "instructions",
      "exemples",
      "points",
      "montant",
      "montants",
      "delai",
      "delais",
      "quand",
      "quelles",
      "quels",
      "quelques",
      "pendant",
      "contrairement",
      "autrement",
      "attention",
      "annonce",
      "atelier",
      "audit",
      "formule",
      "faible",
      "forte",
      "moyen",
      "ordre",
      "poste",
      "preuves",
      "informatique",
      "convient",
      "copilote",
      "entrainement",
      "repetitif",
      "existe t il",
      "peut il",
      "peut on",
      "donnez lui",
    ]);
    if (noiseSingles.has(token)) {
      return true;
    }
  }
  // Questions / formes interrogatives
  if (/^(?:existe|peut)[- ]/.test(key) || / t il$/.test(key)) {
    return true;
  }
  return false;
}

/**
 * Nom d’organisation distinctif (structure) — pas concurrent par défaut.
 * Pas de règle « mot capitalisé ≥ 6 lettres ».
 */
export function isDistinctiveOrganizationName(name: string): boolean {
  if (isLexicalNoiseName(name) || isGenericDescriptor(name)) {
    return false;
  }
  if (looksLikeHostname(name)) {
    return false;
  }
  const raw = name.trim();
  const key = entityNormalizedKey(raw);

  // IA Infinity / AI Foo
  if (/^(?:IA|AI)\s+[A-ZÉÈÊÀÂÎÔÙÇ0-9]/i.test(raw)) {
    return true;
  }
  // Revolve IA / LUXIA Agents
  if (/\s+(?:IA|AI|Agents?|Labs?|Agency|Studio)\s*$/i.test(raw)) {
    return true;
  }
  // Marque inventée type Tensoria / Quadia / SystemIA
  if (/^[A-ZÉÈÊÀÂÎÔÙÇ][A-Za-zÉÈÊÀÂÎÔÙÇéèêàâîôùç]{2,}(?:ia|ai)$/i.test(raw)) {
    return true;
  }
  // ALL CAPS marque (GENIAL, IBM) : ≥3 lettres, voyelle, hors acronymes métier
  if (
    /^[A-Z]{3,12}$/.test(raw) &&
    /[AEIOUY]/.test(raw) &&
    !BUSINESS_ACRONYMS.has(key)
  ) {
    return true;
  }
  // PascalCase / camelBrand (SharePoint, WhatsApp, YouTube)
  if (/^[A-ZÉÈÊÀÂÎÔÙÇ][a-zéèêàâîôùç]+[A-ZÉÈÊÀÂÎÔÙÇ]/.test(raw)) {
    return true;
  }
  // Forme marque Latin : Majuscule + lettres, hors morphologie FR (min 5, hors Totaux courts)
  if (
    /^[A-ZÉÈÊÀÂÎÔÙÇ][A-Za-zÉÈÊÀÂÎÔÙÇéèêàâîôùç0-9&-]{3,40}$/.test(raw) &&
    !looksLikeFrenchFunctionWord(raw) &&
    !BUSINESS_ACRONYMS.has(key) &&
    raw.length >= 5 &&
    !/^(?:Total|Sous-Total)$/i.test(raw)
  ) {
    return true;
  }
  // Multi-mots type « Google Workspace », « Microsoft 365 », « CIBLER SAS »
  if (isCapitalizedBrandPhrase(raw, key)) {
    return true;
  }
  return false;
}

function isCapitalizedBrandPhrase(raw: string, key: string): boolean {
  if (looksLikePriceOrQuantity(raw)) {
    return false;
  }
  if (
    /^(?:agent|assistant|chatbot|outil|modele|workflow|pilote|automatisation|modèle)\b/i.test(
      raw
    )
  ) {
    return false;
  }
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) {
    return false;
  }
  const tokens = key.split(" ").filter(Boolean);
  const distinctive = tokens.filter((t) => !GENERIC_TOKENS.has(t));
  if (distinctive.length === 0) {
    return false;
  }
  // Au moins un token alphabétique « propre » (pas un montant)
  const alphaDistinctive = distinctive.filter((t) => /[a-z]{3,}/i.test(t));
  if (
    alphaDistinctive.length === 0 ||
    alphaDistinctive.every((t) => looksLikeFrenchFunctionWord(t) || t.length < 3)
  ) {
    return false;
  }
  // Majorité des mots capitalisés / sigles ; un token numérique type « 365 » OK en appoint
  const properish = words.filter(
    (w) => /^[A-ZÉÈÊÀÂÎÔÙÇ]/.test(w) || /^[A-Z]{2,}$/.test(w)
  );
  const hasDigitToken = words.some((w) => /^\d/.test(w));
  if (hasDigitToken && properish.length === 0) {
    return false;
  }
  return properish.length >= Math.ceil(words.length * 0.5);
}

/**
 * Indices d’identité vérifiable (pas une liste de concurrents).
 */
export function hasVerifiableIdentitySignals(input: {
  name: string;
  domain?: string | null;
  excerpt?: string | null;
  previouslyValidated?: boolean;
}): boolean {
  if (input.previouslyValidated) {
    return true;
  }
  if (looksLikeHostname(input.name) || isLexicalNoiseName(input.name)) {
    return false;
  }
  if (isGenericDescriptor(input.name)) {
    return false;
  }
  if (isDistinctiveOrganizationName(input.name)) {
    return true;
  }
  // Domaine réel + nom déjà non-bruit → preuve d’identité entreprise
  if (
    input.domain &&
    normalizeDomain(input.domain).includes(".") &&
    !looksLikeFrenchFunctionWord(input.name)
  ) {
    return true;
  }
  return false;
}
