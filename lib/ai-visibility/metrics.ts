import { isDirectOrIndirectCompetitor } from "./classify";
import {
  type EntityCategory,
  type ExtractedEntity,
  type VisibilityCitation,
} from "./constants";
import {
  brandDomainVariants,
  isTargetBrandEntity,
  type BrandIdentity,
} from "./entities";
import { entityNormalizedKey } from "./resolve";
import {
  brandMentionedInResponseBody,
  isAnalysisPromptLeak,
} from "./validate-entities";

export type EntityMetricsRow = {
  name: string;
  canonicalName: string;
  domain: string | null;
  category: EntityCategory;
  categoryConfidence: number | null;
  categoryJustification: string | null;
  mentionCount: number;
  recommendationCount: number;
  citationCount: number;
  negativeCount: number;
  mentionRate: number | null;
  recommendationRate: number | null;
  citationRate: number | null;
};

export type CampaignMetrics = {
  analysisVersion: string;
  validResponses: number;
  failedResponses: number;
  mentionCount: number;
  recommendationCount: number;
  domainCitationCount: number;
  mentionRate: number | null;
  recommendationRate: number | null;
  domainCitationRate: number | null;
  /** Toutes les entités non-cible avec observations indépendantes. */
  entities: EntityMetricsRow[];
  /** Sous-ensemble concurrents (directs + indirects) — compat UI. */
  competitors: EntityMetricsRow[];
  sampleSizeNote: string;
};

function rate(count: number, denom: number): number | null {
  return denom > 0 ? Number((count / denom).toFixed(4)) : null;
}

/**
 * Formules GEO 1.1 (dénominateur = réponses completed uniquement) :
 * - mentionRate         = réponses où la marque est nommée dans le corps / valid
 * - recommendationRate  = réponses avec recommandation explicite de la marque / valid
 * - domainCitationRate  = réponses avec URL du domaine dans les sources / valid
 *
 * Une réponse compte au plus 1 fois par métrique et par entité.
 * citation_only n’augmente pas le taux de mention corps.
 * recommendation et mention sont indépendants (une reco implique aussi une présence,
 * mais citation_only reste séparé).
 */
export function computeCampaignMetrics(input: {
  analysisVersion: string;
  brand: BrandIdentity;
  responses: Array<{
    status: "completed" | "failed" | "pending";
    /** Corps de réponse — requis pour valider les mentions marque (GEO 1.1.4). */
    responseText?: string | null;
    citations: VisibilityCitation[];
    entities: ExtractedEntity[];
  }>;
}): CampaignMetrics {
  const valid = input.responses.filter((item) => item.status === "completed");
  const failed = input.responses.filter((item) => item.status === "failed");
  const domains = brandDomainVariants(input.brand);
  const denom = valid.length;

  let mentionCount = 0;
  let recommendationCount = 0;
  let domainCitationCount = 0;

  const entityMap = new Map<
    string,
    {
      name: string;
      canonicalName: string;
      domain: string | null;
      category: EntityCategory;
      categoryConfidence: number | null;
      categoryJustification: string | null;
      mentionCount: number;
      recommendationCount: number;
      citationCount: number;
      negativeCount: number;
    }
  >();

  for (const response of valid) {
    const text = response.responseText ?? "";
    const brandInBody =
      text.length > 0
        ? brandMentionedInResponseBody(input.brand, text)
        : null;

    const targetEntities = response.entities.filter((entity) => {
      if (!isTargetBrandEntity(entity, input.brand)) {
        return false;
      }
      if (entity.mentionKind === "citation_only") {
        return false;
      }
      if (isAnalysisPromptLeak(entity.excerpt)) {
        return false;
      }
      // Preuve corps si texte disponible ; sinon rejeter excerpts contaminés déjà filtrés
      if (brandInBody === false) {
        return false;
      }
      return true;
    });

    const bodyMention = targetEntities.some(
      (entity) =>
        entity.mentionKind === "mention" ||
        entity.mentionKind === "recommendation" ||
        entity.mentionKind === "negative"
    );
    if (bodyMention) {
      mentionCount += 1;
    }
    if (
      targetEntities.some((entity) => entity.mentionKind === "recommendation")
    ) {
      recommendationCount += 1;
    }

    const cited = response.citations.some((citation) => {
      const domain = (citation.domain ?? "").toLowerCase();
      return domains.some(
        (alias) => domain === alias || domain.endsWith(`.${alias}`)
      );
    });
    // Citation domaine = sources URL uniquement (pas via mention corps)
    if (cited) {
      domainCitationCount += 1;
    }

    const seenMention = new Set<string>();
    const seenReco = new Set<string>();
    const seenCitation = new Set<string>();
    const seenNegative = new Set<string>();

    for (const entity of response.entities) {
      if (isTargetBrandEntity(entity, input.brand)) {
        continue;
      }
      const key = entityNormalizedKey(entity.name);
      if (!key) {
        continue;
      }
      const current = entityMap.get(key) ?? {
        name: entity.name,
        canonicalName: entity.name,
        domain: entity.domain ?? null,
        category: entity.category,
        categoryConfidence: entity.categoryConfidence ?? null,
        categoryJustification: entity.categoryJustification ?? null,
        mentionCount: 0,
        recommendationCount: 0,
        citationCount: 0,
        negativeCount: 0,
      };

      // Observations indépendantes
      if (
        (entity.mentionKind === "mention" ||
          entity.mentionKind === "recommendation") &&
        !seenMention.has(key)
      ) {
        current.mentionCount += 1;
        seenMention.add(key);
      }
      if (entity.mentionKind === "recommendation" && !seenReco.has(key)) {
        current.recommendationCount += 1;
        seenReco.add(key);
      }
      if (entity.mentionKind === "citation_only" && !seenCitation.has(key)) {
        current.citationCount += 1;
        seenCitation.add(key);
      }
      if (entity.mentionKind === "negative" && !seenNegative.has(key)) {
        current.negativeCount += 1;
        seenNegative.add(key);
        // Une négative compte aussi comme présence (mention) si pas déjà
        if (!seenMention.has(key)) {
          current.mentionCount += 1;
          seenMention.add(key);
        }
      }

      // Préfère une catégorie plus précise si déjà connue
      if (
        current.category === "unknown" &&
        entity.category !== "unknown"
      ) {
        current.category = entity.category;
        current.categoryConfidence = entity.categoryConfidence ?? null;
        current.categoryJustification =
          entity.categoryJustification ?? null;
      }
      if (!current.domain && entity.domain) {
        current.domain = entity.domain;
      }
      entityMap.set(key, current);
    }
  }

  const entities = [...entityMap.values()]
    .map((item) => ({
      ...item,
      mentionRate: rate(item.mentionCount, denom),
      recommendationRate: rate(item.recommendationCount, denom),
      citationRate: rate(item.citationCount, denom),
    }))
    .sort(
      (a, b) =>
        b.mentionCount + b.recommendationCount + b.citationCount -
        (a.mentionCount + a.recommendationCount + a.citationCount)
    );

  const competitors = entities.filter((item) =>
    isDirectOrIndirectCompetitor(item.category)
  );

  return {
    analysisVersion: input.analysisVersion,
    validResponses: denom,
    failedResponses: failed.length,
    mentionCount,
    recommendationCount,
    domainCitationCount,
    mentionRate: rate(mentionCount, denom),
    recommendationRate: rate(recommendationCount, denom),
    domainCitationRate: rate(domainCitationCount, denom),
    entities: entities.slice(0, 80),
    competitors: competitors.slice(0, 40),
    sampleSizeNote: `Échantillon : ${denom} réponse(s) valide(s) sur ${input.responses.length}. Méthode ${input.analysisVersion}. Pas une mesure exhaustive ChatGPT.`,
  };
}

/**
 * Titres éditoriaux naturels — ne dump pas le sujet brut dans un gabarit cassé.
 * Cause racine GEO 1.0 : `Comment choisir un prestataire pour « ${subject} » ?`
 * produisait des formulations artificielles (et chiffes hors contexte si sujet sale).
 */
/**
 * Titres par intention — pas d’interpolation brute du sujet
 * (évite « Combien coûte un Agents IA … pour une PME pour une PME »).
 */
export function buildNaturalEditorialTitle(input: {
  kind: "provider_choice" | "criteria" | "cost" | "security" | "comparison";
  subject: string;
  brandName?: string;
  competitorName?: string;
}): string {
  const topic = detectEditorialTopic(input.subject);

  switch (input.kind) {
    case "provider_choice":
      return topic === "ai_agents"
        ? "Comment choisir un prestataire spécialisé dans les agents IA ?"
        : `Comment choisir un prestataire spécialisé dans ${topicLabel(topic, input.subject)} ?`;
    case "criteria":
      return topic === "ai_agents"
        ? "Quels critères pour sélectionner une agence de développement d’agents IA ?"
        : `Quels critères pour sélectionner un prestataire sur ${topicLabel(topic, input.subject)} ?`;
    case "cost":
      return topic === "ai_agents"
        ? "Combien coûte un agent IA sur mesure pour une PME ?"
        : `Combien coûte une solution de ${topicLabel(topic, input.subject)} pour une PME ?`;
    case "security":
      return topic === "ai_agents"
        ? "Quels risques de sécurité anticiper lors du déploiement d’un agent IA ?"
        : `Quels risques de sécurité anticiper pour ${topicLabel(topic, input.subject)} ?`;
    case "comparison":
      if (input.brandName && input.competitorName) {
        return `${input.brandName} et ${input.competitorName} : quels angles de différenciation ?`;
      }
      return topic === "ai_agents"
        ? "Quelles alternatives comparer pour un agent IA sur mesure ?"
        : `Quelles alternatives comparer pour ${topicLabel(topic, input.subject)} ?`;
    default:
      return "Opportunité éditoriale à valider";
  }
}

function detectEditorialTopic(
  subject: string
): "ai_agents" | "generic" {
  const normalized = subject
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (
    /\bagents?\b/.test(normalized) &&
    /\b(ia|ai|intelligence artificielle)\b/.test(normalized)
  ) {
    return "ai_agents";
  }
  return "generic";
}

function topicLabel(topic: "ai_agents" | "generic", subject: string): string {
  if (topic === "ai_agents") {
    return "les agents IA";
  }
  let value = subject.trim();
  value = value.replace(/^[«»"']?\s*\d+\s+/, "");
  value = value.replace(/^[«»"']+|["'«»]+$/g, "").trim();
  value = value.replace(/\?+$/, "").trim();
  // Retire redondance « pour une? PME »
  value = value.replace(/\s+pour\s+(une?\s+)?pme\s*$/i, "").trim();
  if (value.length > 60) {
    value = `${value.slice(0, 57).trim()}…`;
  }
  return value || "ce sujet";
}

export function buildEditorialHints(input: {
  brandName: string;
  subject: string;
  metrics: CampaignMetrics;
  questions: string[];
}): Array<{
  title: string;
  rationale: string;
  relatedQuestions: string[];
}> {
  const hints: Array<{
    title: string;
    rationale: string;
    relatedQuestions: string[];
  }> = [];
  const seenTitles = new Set<string>();

  const push = (
    title: string,
    rationale: string,
    relatedQuestions: string[]
  ) => {
    const key = title.toLowerCase();
    if (seenTitles.has(key)) {
      return;
    }
    seenTitles.add(key);
    hints.push({ title, rationale, relatedQuestions });
  };

  if (
    input.metrics.validResponses >= 3 &&
    (input.metrics.mentionRate ?? 1) < 0.35
  ) {
    push(
      buildNaturalEditorialTitle({
        kind: "provider_choice",
        subject: input.subject,
      }),
      `${input.brandName} est peu mentionné (${Math.round((input.metrics.mentionRate ?? 0) * 100)} % sur ${input.metrics.validResponses} réponses). Opportunité éditoriale potentielle — validation manuelle requise avant file Topic.`,
      input.questions.slice(0, 3)
    );
    push(
      buildNaturalEditorialTitle({
        kind: "criteria",
        subject: input.subject,
      }),
      "Angle critères de choix pour structurer une page utile aux prospects.",
      input.questions.slice(0, 2)
    );
  }

  if (
    input.metrics.validResponses >= 3 &&
    (input.metrics.recommendationRate ?? 1) < 0.2
  ) {
    push(
      buildNaturalEditorialTitle({ kind: "cost", subject: input.subject }),
      `Recommandations faibles (${Math.round((input.metrics.recommendationRate ?? 0) * 100)} %). Un contenu décisionnel (coût / ROI) peut aider — validation manuelle requise.`,
      input.questions.slice(0, 3)
    );
    push(
      buildNaturalEditorialTitle({
        kind: "security",
        subject: input.subject,
      }),
      "Angle risques / sécurité souvent demandé dans les intentions d’achat B2B.",
      input.questions.slice(0, 2)
    );
  }

  // Comparatif nominatif UNIQUEMENT si concurrent direct étayé
  for (const competitor of input.metrics.competitors.slice(0, 3)) {
    if (
      competitor.category !== "direct_competitor" ||
      competitor.mentionCount < 2
    ) {
      continue;
    }
    push(
      buildNaturalEditorialTitle({
        kind: "comparison",
        subject: input.subject,
        brandName: input.brandName,
        competitorName: competitor.canonicalName || competitor.name,
      }),
      `${competitor.canonicalName || competitor.name} apparaît comme concurrent direct dans ${competitor.mentionCount} réponse(s). Comparatif à évaluer (pas de création auto Topic).`,
      input.questions.slice(0, 2)
    );
  }

  return hints.slice(0, 5);
}

/** Comparabilité de deux campagnes (avertissement si paramètres différents). */
export function areCampaignsComparable(
  left: {
    analysisVersion: string;
    model: string;
    questionCount: number;
    repetitions: number;
    subject: string;
  },
  right: {
    analysisVersion: string;
    model: string;
    questionCount: number;
    repetitions: number;
    subject: string;
  }
): { comparable: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (left.analysisVersion !== right.analysisVersion) {
    warnings.push("Versions d’analyse différentes.");
  }
  if (left.model !== right.model) {
    warnings.push("Modèles IA différents.");
  }
  if (left.questionCount !== right.questionCount) {
    warnings.push("Nombre de questions différent.");
  }
  if (left.repetitions !== right.repetitions) {
    warnings.push("Répétitions différentes.");
  }
  if (left.subject.trim().toLowerCase() !== right.subject.trim().toLowerCase()) {
    warnings.push("Sujets différents.");
  }
  return { comparable: warnings.length === 0, warnings };
}
