import { domainByLabel, normalizeThemeLabel } from "./domains";
import {
  NAXIALIS_SERVICES,
  type OpportunityContentType,
  type RawOpportunityCandidate,
  type ScoreBreakdown,
  type ScoreContext,
} from "./types";

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(max, Math.round(value)));
}

function hashSpread(text: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash % (max + 1);
}

function specificityBonus(title: string, subject: string): number {
  const words = `${title} ${subject}`
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const generic = ["guide", "complet", "tout", "savoir", "meilleur", "ultime", "introduction"];
  const genericHits = words.filter((w) => generic.includes(w)).length;
  const specific = Math.min(6, Math.max(0, words.length - 4 - genericHits * 2));
  return specific;
}

function themeRelevance(
  candidate: RawOpportunityCandidate,
  context: ScoreContext
): {
  score: number;
  detail: string;
} {
  const theme = normalizeThemeLabel(candidate.theme);
  const domain = domainByLabel(theme);
  const text = `${candidate.title} ${candidate.subject} ${candidate.angle ?? ""}`.toLowerCase();
  let score = domain ? 14 : context.freeTopic ? 16 : 8;
  const matchedAngles: string[] = [];

  if (domain) {
    for (const angle of domain.explorationAngles) {
      const needle = angle.toLowerCase();
      if (
        text.includes(needle) ||
        needle
          .split(/\s+/)
          .every((part) => part.length < 3 || text.includes(part))
      ) {
        matchedAngles.push(angle);
      }
    }
    score += Math.min(8, matchedAngles.length * 2);
  } else if (context.freeTopic) {
    // Pertinence au sujet libre : spécificité + présence du thème dans le texte
    const themeTokens = theme.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
    const hits = themeTokens.filter((token) => text.includes(token)).length;
    score += Math.min(6, hits * 2);
  }

  score += Math.min(3, specificityBonus(candidate.title, candidate.subject) / 2);
  score = clamp(score, 25);

  return {
    score,
    detail: domain
      ? `Thème « ${theme} »${matchedAngles.length ? ` · angles ${matchedAngles.slice(0, 3).join(", ")}` : " · alignement général"} (${score}/25).`
      : context.freeTopic
        ? `Pertinence au sujet libre « ${theme} » (${score}/25) — hors catalogue Naxialis, non pénalisé.`
        : `Thématique hors catalogue principal (${score}/25).`,
  };
}

function commercialPotential(
  candidate: RawOpportunityCandidate,
  context: ScoreContext
): {
  score: number;
  detail: string;
} {
  const text =
    `${candidate.title} ${candidate.subject} ${candidate.angle ?? ""} ${candidate.searchIntent ?? ""}`.toLowerCase();
  let score = 8;
  const signals: string[] = [];

  const commercialSignals: Array<[string, number]> = [
    ["roi", 3],
    ["coût", 2],
    ["cout", 2],
    ["pme", 3],
    ["entreprise", 2],
    ["comparer", 3],
    ["choisir", 3],
    ["mettre en place", 2],
    ["devis", 3],
    ["prix", 2],
    ["productivité", 2],
    ["productivite", 2],
    ["automat", 2],
    ["migration", 2],
    ["remplacer", 2],
  ];

  for (const [needle, points] of commercialSignals) {
    if (text.includes(needle)) {
      score += points;
      signals.push(needle);
    }
  }

  if (candidate.contentType === "commercial") {
    score += 4;
    signals.push("type commercial");
  } else if (candidate.contentType === "news") {
    score -= 2;
  }

  const service = candidate.naxialisService?.trim();
  if (service) {
    const known = NAXIALIS_SERVICES.some(
      (item) => item.toLowerCase() === service.toLowerCase()
    );
    score += known ? 5 : 2;
    signals.push(known ? `service ${service}` : "service libre");
  } else if (context.freeTopic && context.researchGoal !== "commercial") {
    // Ne pas exiger un service Naxialis pour un sujet libre exploratoire.
    signals.push("potentiel commercial non établi / exploratoire");
  }

  if (context.researchGoal === "trends" && context.freeTopic) {
    score = Math.max(4, score - 3);
    signals.push("veille exploratoire");
  }
  if (context.researchGoal === "commercial") {
    score = Math.min(25, score + 2);
  }

  score += hashSpread(candidate.title, 2);
  score = clamp(score, 25);

  return {
    score,
    detail: `Potentiel commercial (problème utilisateur / intention d’achat)${
      signals.length ? ` : ${[...new Set(signals)].slice(0, 4).join(", ")}` : ""
    } (${score}/25).`,
  };
}

function intentScore(candidate: RawOpportunityCandidate): {
  score: number;
  detail: string;
} {
  const intent = candidate.searchIntent?.toLowerCase() ?? "";
  let score = intent ? 9 : 5;
  let label = intent || "non précisée";

  if (
    intent.includes("transactionnel") ||
    intent.includes("acheter") ||
    intent.includes("devis") ||
    intent.includes("comparer") ||
    intent.includes("choisir")
  ) {
    score = 18;
  } else if (
    intent.includes("mettre en place") ||
    intent.includes("comment") ||
    intent.includes("guide") ||
    intent.includes("tutoriel")
  ) {
    score = 15;
  } else if (intent.includes("informatif") || intent.includes("définition")) {
    score = 9;
  } else if (intent.includes("actualité") || intent.includes("news")) {
    score = 11;
  }

  if (candidate.contentType === "commercial") {
    score = Math.min(20, score + 2);
  }
  if (candidate.angle && candidate.angle.length > 40) {
    score = Math.min(20, score + 1);
  }

  score = clamp(score, 20);
  return {
    score,
    detail: `Intention « ${label.slice(0, 80)} » (${score}/20).`,
  };
}

function timelinessScore(candidate: RawOpportunityCandidate): {
  score: number;
  detail: string;
} {
  const sources = candidate.sources ?? [];
  if (sources.length === 0) {
    return {
      score: 4,
      detail: "Aucune source documentée (4/15).",
    };
  }

  const now = Date.now();
  let dated = 0;
  let recent90 = 0;
  let recent180 = 0;
  for (const source of sources) {
    if (!source.date) {
      continue;
    }
    const ts = Date.parse(source.date);
    if (!Number.isFinite(ts)) {
      continue;
    }
    dated += 1;
    const ageDays = (now - ts) / (1000 * 60 * 60 * 24);
    if (ageDays <= 90) {
      recent90 += 1;
    }
    if (ageDays <= 180) {
      recent180 += 1;
    }
  }

  let score = 6 + Math.min(3, sources.length);
  if (recent90 >= 1) {
    score += 4;
  } else if (recent180 >= 1) {
    score += 2;
  }
  if (dated === 0) {
    score -= 2;
  }
  if (candidate.contentType === "news" && recent90 === 0) {
    score -= 3;
  }
  if (candidate.contentType === "evergreen") {
    score = Math.min(15, score + (dated > 0 ? 1 : 0));
  }

  score = clamp(score, 15);
  return {
    score,
    detail: `${sources.length} source(s), ${dated} datée(s), ${recent90} < 90 j (${score}/15).`,
  };
}

function originalityScore(
  candidate: RawOpportunityCandidate,
  context: ScoreContext
): { score: number; detail: string } {
  let score = 14;
  if (context.duplicateRisk === "high") {
    score = 2;
  } else if (context.duplicateRisk === "medium") {
    score = 6;
  } else if (context.duplicateRisk === "low") {
    score = 10;
  }

  const similarMax = context.similarMaxScore ?? 0;
  const similarCount = context.similarPostCount ?? 0;
  if (similarCount >= 3) {
    score -= 3;
  } else if (similarCount === 2) {
    score -= 2;
  }
  if (similarMax >= 0.7) {
    score -= 3;
  } else if (similarMax >= 0.5) {
    score -= 1;
  }

  const sibling = context.batchSiblingScore ?? 0;
  if (sibling >= 0.55) {
    score -= 4;
  } else if (sibling >= 0.4) {
    score -= 2;
  }

  score += Math.min(2, specificityBonus(candidate.title, candidate.subject) / 3);
  score = clamp(score, 15);

  return {
    score,
    detail: `Couverture blog (risque ${context.duplicateRisk}, max similarité ${Math.round(similarMax * 100)} %, frères lot ${Math.round(sibling * 100)} %) (${score}/15).`,
  };
}

/**
 * Score éditorial interne /100 — plus discriminant, justifications spécifiques.
 * Pas une mesure de trafic, difficulté SEO ou volume de recherche.
 */
export function scoreOpportunity(
  candidate: RawOpportunityCandidate,
  contextOrRisk: ScoreContext | "none" | "low" | "medium" | "high"
): ScoreBreakdown {
  const context: ScoreContext =
    typeof contextOrRisk === "string"
      ? { duplicateRisk: contextOrRisk }
      : contextOrRisk;

  const relevance = themeRelevance(candidate, context);
  const commercial = commercialPotential(candidate, context);
  const intent = intentScore(candidate);
  const timeliness = timelinessScore(candidate);
  const originality = originalityScore(candidate, context);
  const total =
    relevance.score +
    commercial.score +
    intent.score +
    timeliness.score +
    originality.score;

  return {
    relevance: relevance.score,
    commercial: commercial.score,
    intent: intent.score,
    timeliness: timeliness.score,
    originality: originality.score,
    total,
    rationale: {
      relevance: relevance.detail,
      commercial: commercial.detail,
      intent: intent.detail,
      timeliness: timeliness.detail,
      originality: originality.detail,
    },
  };
}

export function classifyContentType(
  value: unknown,
  candidate: Pick<RawOpportunityCandidate, "title" | "subject" | "searchIntent" | "angle">
): OpportunityContentType {
  if (value === "news" || value === "evergreen" || value === "commercial") {
    return value;
  }
  const text =
    `${candidate.title} ${candidate.subject} ${candidate.searchIntent ?? ""} ${candidate.angle ?? ""}`.toLowerCase();
  if (
    text.includes("actualité") ||
    text.includes("annonce") ||
    text.includes("nouveauté") ||
    text.includes("vient de") ||
    text.includes("2025") ||
    text.includes("2026")
  ) {
    return "news";
  }
  if (
    text.includes("comparer") ||
    text.includes("choisir") ||
    text.includes("devis") ||
    text.includes("prix") ||
    text.includes("vs ") ||
    text.includes("alternative")
  ) {
    return "commercial";
  }
  return "evergreen";
}
