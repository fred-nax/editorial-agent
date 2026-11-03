import type { OpportunitySource } from "./types";

/**
 * Trend Intelligence SEO 1.3.1 — Source Evidence Quality.
 * Signaux observables uniquement. Aucun volume Trends / CTR inventé.
 */

/** Version de méthode — les observations antérieures restent lisibles sans recalcul. */
export const TREND_ANALYSIS_VERSION = "seo-1.3.1";

export const TREND_TYPES = [
  "emerging",
  "news",
  "evergreen",
  "unverified",
] as const;

export type TrendType = (typeof TREND_TYPES)[number];

export const TREND_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type TrendConfidence = (typeof TREND_CONFIDENCE_LEVELS)[number];

export const EDITORIAL_URGENCY_LEVELS = ["low", "medium", "high"] as const;
export type EditorialUrgency = (typeof EDITORIAL_URGENCY_LEVELS)[number];

export type SourceRelevance =
  | "direct"
  | "contextual"
  | "irrelevant"
  | "indeterminate";

export type SourceEvidenceRole =
  | "trend_evidence"
  | "documentary"
  | "excluded";

export type TrendEvidenceSource = {
  title: string;
  url: string;
  date: string | null;
  domain: string;
};

export type SourceQualification = {
  title: string;
  url: string;
  date: string | null;
  domain: string;
  relevance: SourceRelevance;
  role: SourceEvidenceRole;
  exclusionReason: string | null;
  sharedInBatch: boolean;
  specificOverlap: number;
};

export type TrendSignalsSnapshot = {
  independentDomains: number;
  totalUrls: number;
  datedSources: number;
  recent30: number;
  recent90: number;
  recent180: number;
  oldestDays: number | null;
  newestDays: number | null;
  spanDays: number | null;
  domains: string[];
  triggerHints: string[];
  themeRepetition: boolean;
  /** Preuves directes retenues pour le score. */
  admissibleSourceCount: number;
  documentarySourceCount: number;
  excludedSourceCount: number;
};

export type TrendAssessment = {
  trendType: TrendType;
  trendScore: number;
  confidence: TrendConfidence;
  justification: string;
  checkedAt: string;
  urgency: EditorialUrgency;
  signals: TrendSignalsSnapshot;
  evidenceSources: TrendEvidenceSource[];
  sourceQualifications: SourceQualification[];
  analysisVersion: string;
};

export type TrendHistoryEntry = {
  searchRunId: string | null;
  checkedAt: string;
  trendType: TrendType;
  trendScore: number;
  confidence: TrendConfidence;
  independentDomains: number;
  datedSources: number;
  recent90: number;
  analysisVersion?: string;
};

export type TrendHistoryComparison = {
  sourceCountDelta: number;
  scoreDelta: number;
  interpretation: string;
};

const TRIGGER_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(annonce|annonc[ée]|launch|lancement|released?|sortie)\b/i, label: "annonce" },
  { re: /\b(faille|cve|vuln[eé]rabilit[eé]|patch|zero[- ]?day)\b/i, label: "sécurité" },
  { re: /\b(r[eé]glement|r[eé]gulation|ai act|rgpd|conformit[eé])\b/i, label: "régulation" },
  { re: /\b(acquisition|rachat|fusion|funding|lev[eé]e de fonds)\b/i, label: "corporate" },
  { re: /\b(mise [aà] jour|update|version \d|gpt[- ]?\d|nouveau mod[eè]le)\b/i, label: "produit" },
];

/** Termes trop génériques pour prouver un angle précis. */
const GENERIC_TOKENS = new Set([
  "ia",
  "ai",
  "agent",
  "agents",
  "agentique",
  "agentiques",
  "pme",
  "pmes",
  "smb",
  "smbs",
  "entreprise",
  "entreprises",
  "company",
  "companies",
  "business",
  "solution",
  "solutions",
  "outil",
  "outils",
  "tool",
  "tools",
  "plateforme",
  "plateformes",
  "platform",
  "platforms",
  "systeme",
  "systemes",
  "system",
  "systems",
  "guide",
  "rapport",
  "report",
  "article",
  "blog",
  "fiche",
  "page",
  "index",
  "overview",
  "introduction",
  "actualite",
  "news",
  "update",
  "updates",
  "nouveau",
  "nouvelle",
  "nouveaux",
  "comment",
  "pourquoi",
  "quel",
  "quelle",
  "quels",
  "quelles",
  "pour",
  "avec",
  "dans",
  "des",
  "les",
  "une",
  "sur",
  "par",
  "aux",
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "your",
  "our",
  "every",
  "organization",
  "organisation",
  "work",
  "trend",
  "trends",
  "cheat",
  "sheet",
  "series",
]);

const SECURITY_TOKENS = new Set([
  "securite",
  "security",
  "secure",
  "securing",
  "cve",
  "vuln",
  "vulnerabilite",
  "vulnerability",
  "owasp",
  "faille",
  "patch",
  "threat",
  "cyber",
]);

const ROI_TOKENS = new Set([
  "roi",
  "retour",
  "investissement",
  "indicateur",
  "indicateurs",
  "kpi",
  "kpis",
  "rentabilite",
  "cout",
  "couts",
  "cost",
  "costs",
  "value",
  "mesure",
  "mesurer",
  "measurement",
]);

/** Tokens courts mais discriminants (sinon filtrés par longueur > 3). */
const SHORT_SIGNIFICANT_TOKENS = new Set([
  "roi",
  "kpi",
  "cve",
  "mcp",
  "api",
  "seo",
  "geo",
  "crm",
  "erp",
  "b2b",
  "llm",
  "rag",
]);

export function extractSourceDomain(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host;
  } catch {
    return "";
  }
}

/**
 * Normalise une date de publication. Accepte YYYY-MM-DD ou ISO.
 * Ne dérive jamais une date depuis une URL. Rejette les futures incohérentes.
 */
export function normalizeSourceDate(
  value: string | null | undefined,
  now: Date = new Date()
): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let isoCandidate = trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    isoCandidate = `${trimmed}T12:00:00.000Z`;
  } else if (!/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    // Formats non ISO stricts refusés (pas d’invention / parse floue)
    return null;
  }

  const ts = Date.parse(isoCandidate);
  if (!Number.isFinite(ts)) {
    return null;
  }
  if (ts > now.getTime() + 2 * 24 * 60 * 60 * 1000) {
    return null;
  }
  // Conserve YYYY-MM-DD pour les dates calendaires
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return new Date(ts).toISOString();
}

function ageDays(ts: number, now: Date): number {
  return (now.getTime() - ts) / (1000 * 60 * 60 * 24);
}

function normalizeToken(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function tokenizeSpecificTerms(text: string): string[] {
  const tokens = normalizeToken(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (token) =>
        !GENERIC_TOKENS.has(token) &&
        (token.length > 3 || SHORT_SIGNIFICANT_TOKENS.has(token))
    );
  return [...new Set(tokens)].slice(0, 24);
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) {
      count += 1;
    }
  }
  return count;
}

function hasAny(tokens: Set<string>, bag: Set<string>): boolean {
  for (const token of tokens) {
    if (bag.has(token)) {
      return true;
    }
  }
  return false;
}

/**
 * Qualifie la pertinence d’une source pour un angle précis.
 * Utilise uniquement titre / métadonnées fournies — jamais le domaine seul.
 */
export function qualifySourceRelevance(input: {
  opportunityTitle: string;
  opportunitySubject: string;
  opportunityAngle?: string | null;
  sourceTitle: string;
}): { relevance: SourceRelevance; specificOverlap: number; reason: string | null } {
  const angleText = [
    input.opportunityAngle,
    input.opportunityTitle,
    input.opportunitySubject,
  ]
    .filter(Boolean)
    .join(" ");
  const opportunityTokens = new Set(tokenizeSpecificTerms(angleText));
  const sourceTokens = new Set(tokenizeSpecificTerms(input.sourceTitle));

  if (opportunityTokens.size === 0 || sourceTokens.size === 0) {
    return {
      relevance: "indeterminate",
      specificOverlap: 0,
      reason:
        "Informations insuffisantes pour juger la pertinence (titre trop générique).",
    };
  }

  const overlap = overlapCount(opportunityTokens, sourceTokens);

  // Incohérence d’angle (ex. sécurité vs ROI)
  const angleIsRoi = hasAny(opportunityTokens, ROI_TOKENS);
  const angleIsSecurity = hasAny(opportunityTokens, SECURITY_TOKENS);
  const sourceIsRoi = hasAny(sourceTokens, ROI_TOKENS);
  const sourceIsSecurity = hasAny(sourceTokens, SECURITY_TOKENS);

  if (angleIsRoi && sourceIsSecurity && !sourceIsRoi && overlap < 2) {
    return {
      relevance: "irrelevant",
      specificOverlap: overlap,
      reason:
        "Source orientée sécurité, sans chevauchement suffisant avec l’angle ROI.",
    };
  }
  if (angleIsSecurity && sourceIsRoi && !sourceIsSecurity && overlap < 2) {
    return {
      relevance: "irrelevant",
      specificOverlap: overlap,
      reason:
        "Source orientée ROI / coûts, sans chevauchement suffisant avec l’angle sécurité.",
    };
  }

  if (overlap >= 2) {
    return { relevance: "direct", specificOverlap: overlap, reason: null };
  }
  if (overlap === 1) {
    return {
      relevance: "contextual",
      specificOverlap: overlap,
      reason:
        "Un seul terme spécifique en commun — utile en documentation, insuffisant comme preuve de tendance.",
    };
  }

  return {
    relevance: "irrelevant",
    specificOverlap: 0,
    reason: "Aucun terme spécifique commun avec l’angle éditorial.",
  };
}

function detectTriggers(text: string): string[] {
  const found: string[] = [];
  for (const pattern of TRIGGER_PATTERNS) {
    if (pattern.re.test(text) && !found.includes(pattern.label)) {
      found.push(pattern.label);
    }
  }
  return found;
}

/**
 * Déduplique les URLs par domaine (1 domaine = 1 entrée).
 */
export function dedupeSourcesByDomain(
  sources: OpportunitySource[] | null | undefined
): TrendEvidenceSource[] {
  if (!Array.isArray(sources)) {
    return [];
  }
  const byDomain = new Map<string, TrendEvidenceSource>();
  const now = new Date();
  for (const source of sources) {
    if (!source?.url || !/^https?:\/\//i.test(source.url)) {
      continue;
    }
    const domain = extractSourceDomain(source.url);
    if (!domain) {
      continue;
    }
    const date = normalizeSourceDate(source.date ?? null, now);
    const evidence: TrendEvidenceSource = {
      title: (source.title || domain).slice(0, 200),
      url: source.url.slice(0, 500),
      date,
      domain,
    };
    const existing = byDomain.get(domain);
    if (!existing) {
      byDomain.set(domain, evidence);
      continue;
    }
    const existingTs = existing.date ? Date.parse(existing.date) : NaN;
    const nextTs = evidence.date ? Date.parse(evidence.date) : NaN;
    if (
      Number.isFinite(nextTs) &&
      (!Number.isFinite(existingTs) || nextTs > existingTs)
    ) {
      byDomain.set(domain, evidence);
    }
  }
  return [...byDomain.values()];
}

function classifyTrendType(input: {
  independentDomains: number;
  datedSources: number;
  recent30: number;
  recent90: number;
  spanDays: number | null;
  triggerHints: string[];
  contentType?: string | null;
  admissibleSourceCount: number;
}): TrendType {
  const {
    independentDomains,
    datedSources,
    recent30,
    recent90,
    spanDays,
    triggerHints,
    contentType,
    admissibleSourceCount,
  } = input;

  if (admissibleSourceCount < 1 || independentDomains < 2 || datedSources === 0) {
    return "unverified";
  }

  if (
    recent30 >= 1 &&
    recent90 >= 1 &&
    (triggerHints.length > 0 || contentType === "news") &&
    (spanDays == null || spanDays <= 45)
  ) {
    return "news";
  }

  if (
    recent90 >= 2 &&
    independentDomains >= 2 &&
    (spanDays == null || spanDays <= 180)
  ) {
    return "emerging";
  }

  if (
    datedSources >= 2 &&
    spanDays != null &&
    spanDays >= 180 &&
    recent90 <= 1
  ) {
    return "evergreen";
  }

  if (contentType === "evergreen" && datedSources >= 2 && recent90 === 0) {
    return "evergreen";
  }

  if (recent90 >= 1 && independentDomains >= 2) {
    return "emerging";
  }

  return "unverified";
}

function scoreFromSignals(signals: TrendSignalsSnapshot): number {
  let score = 0;

  // Indépendance des preuves directes (max 30)
  if (signals.independentDomains >= 3) {
    score += 30;
  } else if (signals.independentDomains === 2) {
    score += 18;
  } else if (signals.independentDomains === 1) {
    score += 6;
  }

  // Dates fiables parmi les preuves (max 15)
  if (signals.admissibleSourceCount > 0) {
    const datedRatio = signals.datedSources / Math.max(1, signals.independentDomains);
    score += Math.round(Math.min(1, datedRatio) * 15);
  }

  // Récence vérifiée (max 25)
  if (signals.recent90 >= 3) {
    score += 25;
  } else if (signals.recent90 === 2) {
    score += 18;
  } else if (signals.recent90 === 1) {
    score += 10;
  }

  // Ultra-récent (max 10)
  if (signals.recent30 >= 2) {
    score += 10;
  } else if (signals.recent30 === 1) {
    score += 6;
  }

  // Corroboration multi-sources pertinentes (max 10)
  if (signals.themeRepetition) {
    score += 10;
  }

  // Déclencheur (max 10)
  score += Math.min(10, signals.triggerHints.length * 5);

  return Math.max(0, Math.min(100, score));
}

function confidenceFromSignals(
  signals: TrendSignalsSnapshot,
  trendType: TrendType
): TrendConfidence {
  if (
    trendType === "unverified" ||
    signals.independentDomains < 2 ||
    signals.datedSources === 0 ||
    signals.admissibleSourceCount < 1
  ) {
    return "low";
  }
  if (
    signals.independentDomains >= 3 &&
    signals.datedSources >= 2 &&
    signals.recent90 >= 2
  ) {
    return "high";
  }
  return "medium";
}

function urgencyFromAssessment(
  trendType: TrendType,
  trendScore: number,
  recent30: number
): EditorialUrgency {
  if (trendType === "news" && recent30 >= 1 && trendScore >= 55) {
    return "high";
  }
  if (trendType === "emerging" && trendScore >= 50) {
    return "medium";
  }
  if (trendType === "news" && trendScore >= 40) {
    return "medium";
  }
  return "low";
}

function buildJustification(input: {
  trendType: TrendType;
  signals: TrendSignalsSnapshot;
  confidence: TrendConfidence;
}): string {
  const { trendType, signals, confidence } = input;
  const parts: string[] = [];

  parts.push(
    `${signals.admissibleSourceCount} preuve(s) directe(s) · ${signals.documentarySourceCount} documentaire(s) · ${signals.excludedSourceCount} exclue(s).`
  );
  parts.push(
    `${signals.independentDomains} domaine(s) indépendant(s) retenus (${signals.totalUrls} URL brutes).`
  );
  parts.push(
    `${signals.datedSources} preuve(s) datée(s) · ${signals.recent30} < 30 j · ${signals.recent90} < 90 j.`
  );

  if (signals.triggerHints.length > 0) {
    parts.push(`Indices d’événement : ${signals.triggerHints.join(", ")}.`);
  }
  if (signals.themeRepetition) {
    parts.push("Corroboration : plusieurs publications indépendantes directement pertinentes.");
  }

  switch (trendType) {
    case "news":
      parts.push("Qualifié actualité ponctuelle (concentration récente + déclencheur).");
      break;
    case "emerging":
      parts.push("Qualifié tendance émergente (preuves récentes indépendantes et pertinentes).");
      break;
    case "evergreen":
      parts.push("Qualifié evergreen (preuves pertinentes étalées, peu de concentration récente).");
      break;
    default:
      parts.push(
        "Tendance non démontrée : preuves directes insuffisantes, non datées, trop anciennes ou hors angle."
      );
  }

  parts.push(
    `Confiance ${confidence} — score sur preuves admissibles (${TREND_ANALYSIS_VERSION}), pas un volume de recherche.`
  );
  return parts.join(" ");
}

function normalizeBatchUrlCounts(
  value: Record<string, number> | Map<string, number> | undefined
): Map<string, number> {
  if (!value) {
    return new Map();
  }
  if (value instanceof Map) {
    return value;
  }
  return new Map(Object.entries(value));
}

/**
 * Analyse les sources d’une opportunité et produit une qualification de tendance.
 * Seules les sources à pertinence « direct » alimentent les signaux de tendance.
 */
export function assessTrendSignals(input: {
  title: string;
  subject: string;
  angle?: string | null;
  contentType?: string | null;
  sources?: OpportunitySource[] | null;
  now?: Date;
  /** Fréquences d’URL dans le lot de recherche (détection de réutilisation). */
  batchUrlCounts?: Record<string, number> | Map<string, number>;
}): TrendAssessment {
  const now = input.now ?? new Date();
  const rawSources = Array.isArray(input.sources) ? input.sources : [];
  const totalUrls = rawSources.length;
  const batchCounts = normalizeBatchUrlCounts(input.batchUrlCounts);

  // Dédup URL exacte pour qualification (conserve la 1re occurrence)
  const seenUrls = new Set<string>();
  const uniqueSources: OpportunitySource[] = [];
  for (const source of rawSources) {
    if (!source?.url || !/^https?:\/\//i.test(source.url)) {
      continue;
    }
    const key = source.url.trim();
    if (seenUrls.has(key)) {
      continue;
    }
    seenUrls.add(key);
    uniqueSources.push(source);
  }

  const qualifications: SourceQualification[] = [];
  for (const source of uniqueSources) {
    const domain = extractSourceDomain(source.url);
    const date = normalizeSourceDate(source.date ?? null, now);
    const judged = qualifySourceRelevance({
      opportunityTitle: input.title,
      opportunitySubject: input.subject,
      opportunityAngle: input.angle,
      sourceTitle: source.title || "",
    });
    const sharedInBatch = (batchCounts.get(source.url) ?? 1) > 1;

    let role: SourceEvidenceRole;
    let exclusionReason: string | null = judged.reason;

    if (judged.relevance === "direct") {
      role = "trend_evidence";
      exclusionReason = null;
      if (sharedInBatch) {
        // Conservée comme preuve si directe — la réutilisation est signalée seulement.
        exclusionReason = null;
      }
    } else if (
      judged.relevance === "contextual" ||
      judged.relevance === "indeterminate"
    ) {
      role = "documentary";
      exclusionReason =
        judged.reason ??
        "Conservée comme documentation, exclue des preuves de tendance.";
    } else {
      role = "excluded";
      exclusionReason =
        judged.reason ?? "Exclue : hors angle éditorial.";
    }

    if (sharedInBatch && role !== "trend_evidence") {
      exclusionReason = [
        exclusionReason,
        "URL également citée sur d’autres opportunités du même lot.",
      ]
        .filter(Boolean)
        .join(" ");
    }

    qualifications.push({
      title: (source.title || domain).slice(0, 200),
      url: source.url.slice(0, 500),
      date,
      domain,
      relevance: judged.relevance,
      role,
      exclusionReason,
      sharedInBatch,
      specificOverlap: judged.specificOverlap,
    });
  }

  const trendEvidence = qualifications.filter((item) => item.role === "trend_evidence");
  const documentary = qualifications.filter((item) => item.role === "documentary");
  const excluded = qualifications.filter((item) => item.role === "excluded");

  // Indépendance : 1 domaine parmi les preuves directes
  const byDomain = new Map<string, SourceQualification>();
  for (const item of trendEvidence) {
    if (!item.domain) {
      continue;
    }
    const existing = byDomain.get(item.domain);
    if (!existing) {
      byDomain.set(item.domain, item);
      continue;
    }
    const existingTs = existing.date ? Date.parse(existing.date) : NaN;
    const nextTs = item.date ? Date.parse(item.date) : NaN;
    if (
      Number.isFinite(nextTs) &&
      (!Number.isFinite(existingTs) || nextTs > existingTs)
    ) {
      byDomain.set(item.domain, item);
    }
  }
  const independentEvidence = [...byDomain.values()];
  const domains = independentEvidence.map((item) => item.domain).sort();

  let datedSources = 0;
  let recent30 = 0;
  let recent90 = 0;
  let recent180 = 0;
  let oldestDays: number | null = null;
  let newestDays: number | null = null;

  for (const source of independentEvidence) {
    if (!source.date) {
      continue;
    }
    const ts = Date.parse(
      source.date.length === 10 ? `${source.date}T12:00:00.000Z` : source.date
    );
    if (!Number.isFinite(ts)) {
      continue;
    }
    datedSources += 1;
    const age = ageDays(ts, now);
    if (oldestDays == null || age > oldestDays) {
      oldestDays = age;
    }
    if (newestDays == null || age < newestDays) {
      newestDays = age;
    }
    if (age <= 30) recent30 += 1;
    if (age <= 90) recent90 += 1;
    if (age <= 180) recent180 += 1;
  }

  const spanDays =
    oldestDays != null && newestDays != null
      ? Math.max(0, oldestDays - newestDays)
      : null;

  const triggerHints = detectTriggers(
    `${input.title} ${input.subject} ${input.angle ?? ""} ${trendEvidence
      .map((e) => e.title)
      .join(" ")}`
  );

  // Corroboration = ≥2 domaines avec preuve directe (plus de bonus sur 1 mot commun)
  const themeRepetition = independentEvidence.length >= 2;

  const signals: TrendSignalsSnapshot = {
    independentDomains: independentEvidence.length,
    totalUrls,
    datedSources,
    recent30,
    recent90,
    recent180,
    oldestDays: oldestDays != null ? Math.round(oldestDays) : null,
    newestDays: newestDays != null ? Math.round(newestDays) : null,
    spanDays: spanDays != null ? Math.round(spanDays) : null,
    domains,
    triggerHints,
    themeRepetition,
    admissibleSourceCount: trendEvidence.length,
    documentarySourceCount: documentary.length,
    excludedSourceCount: excluded.length,
  };

  const trendType = classifyTrendType({
    independentDomains: signals.independentDomains,
    datedSources: signals.datedSources,
    recent30: signals.recent30,
    recent90: signals.recent90,
    spanDays: signals.spanDays,
    triggerHints,
    contentType: input.contentType,
    admissibleSourceCount: signals.admissibleSourceCount,
  });

  const trendScore = scoreFromSignals(signals);
  const confidence = confidenceFromSignals(signals, trendType);
  const urgency = urgencyFromAssessment(trendType, trendScore, signals.recent30);
  const checkedAt = now.toISOString();

  return {
    trendType,
    trendScore,
    confidence,
    justification: buildJustification({ trendType, signals, confidence }),
    checkedAt,
    urgency,
    signals,
    evidenceSources: independentEvidence.map((item) => ({
      title: item.title,
      url: item.url,
      date: item.date,
      domain: item.domain,
    })),
    sourceQualifications: qualifications,
    analysisVersion: TREND_ANALYSIS_VERSION,
  };
}

export function appendTrendHistory(
  existing: unknown,
  entry: TrendHistoryEntry,
  max = 12
): TrendHistoryEntry[] {
  const current = Array.isArray(existing)
    ? existing.filter(
        (item): item is TrendHistoryEntry =>
          !!item &&
          typeof item === "object" &&
          typeof (item as TrendHistoryEntry).checkedAt === "string" &&
          typeof (item as TrendHistoryEntry).trendScore === "number"
      )
    : [];
  return [...current, entry].slice(-max);
}

export function compareTrendHistory(
  previous: Pick<
    TrendHistoryEntry,
    "independentDomains" | "trendScore" | "checkedAt"
  > | null,
  current: Pick<
    TrendHistoryEntry,
    "independentDomains" | "trendScore" | "checkedAt"
  >
): TrendHistoryComparison {
  if (!previous) {
    return {
      sourceCountDelta: 0,
      scoreDelta: 0,
      interpretation:
        "Première observation enregistrée. Aucune évolution comparable.",
    };
  }
  const sourceCountDelta =
    current.independentDomains - previous.independentDomains;
  const scoreDelta = current.trendScore - previous.trendScore;

  let interpretation =
    "Évolution du nombre de preuves retenues et du score calculé uniquement.";
  if (sourceCountDelta > 0) {
    interpretation +=
      " Davantage de preuves indépendantes lors de cette recherche — cela ne prouve pas une hausse de popularité réelle (pas de données Trends/trafic).";
  } else if (sourceCountDelta < 0) {
    interpretation +=
      " Moins de preuves indépendantes observées — couverture ou qualification différente, pas forcément un déclin d’intérêt.";
  } else {
    interpretation += " Nombre de domaines indépendants (preuves) stable.";
  }
  if (scoreDelta !== 0) {
    interpretation += ` Score calculé : ${scoreDelta > 0 ? "+" : ""}${scoreDelta} pt.`;
  }

  return { sourceCountDelta, scoreDelta, interpretation };
}

export function isTrendType(value: unknown): value is TrendType {
  return (
    typeof value === "string" &&
    (TREND_TYPES as readonly string[]).includes(value)
  );
}

export function isEditorialUrgency(value: unknown): value is EditorialUrgency {
  return (
    typeof value === "string" &&
    (EDITORIAL_URGENCY_LEVELS as readonly string[]).includes(value)
  );
}
