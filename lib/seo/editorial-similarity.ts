import { jaccardSimilarity, normalizeText, tokenize } from "./normalize";
import { compareTitleSimilarity } from "./similarity";
import type { RawOpportunityCandidate } from "./types";

export type EditorialSimilarity = {
  score: number;
  reason: string;
  titleScore: number;
  angleScore: number;
  intentScore: number;
};

/**
 * Similarité éditoriale : titres + angles + intentions.
 * Deux titres différents sur le même problème sont signalés.
 */
export function compareEditorialSimilarity(
  left: {
    title: string;
    subject?: string | null;
    angle?: string | null;
    searchIntent?: string | null;
  },
  right: {
    title: string;
    subject?: string | null;
    angle?: string | null;
    searchIntent?: string | null;
  }
): EditorialSimilarity {
  const leftProbe = `${left.title} ${left.subject ?? ""}`.trim();
  const rightProbe = `${right.title} ${right.subject ?? ""}`.trim();
  const titleMatch = compareTitleSimilarity(leftProbe, rightProbe);

  const angleMatch =
    left.angle && right.angle
      ? compareTitleSimilarity(left.angle, right.angle)
      : { score: 0, reason: "Angle manquant" };

  const intentMatch =
    left.searchIntent && right.searchIntent
      ? compareTitleSimilarity(left.searchIntent, right.searchIntent)
      : { score: 0, reason: "Intention manquante" };

  const leftProblem = `${left.subject ?? ""} ${left.angle ?? ""} ${left.searchIntent ?? ""}`;
  const rightProblem = `${right.subject ?? ""} ${right.angle ?? ""} ${right.searchIntent ?? ""}`;
  const problemTokens = jaccardSimilarity(
    tokenize(leftProblem),
    tokenize(rightProblem)
  );
  const titleProblem = jaccardSimilarity(
    tokenize(`${left.title} ${left.subject ?? ""}`),
    tokenize(`${right.title} ${right.subject ?? ""}`)
  );

  const blended =
    titleMatch.score * 0.4 +
    Math.max(angleMatch.score, problemTokens) * 0.35 +
    Math.max(intentMatch.score, titleProblem) * 0.25;

  const combined = Math.max(
    titleMatch.score,
    blended,
    problemTokens >= 0.4
      ? Math.max(0.55, (titleProblem + problemTokens) / 2)
      : 0,
    titleProblem >= 0.5 ? titleProblem : 0
  );

  let reason = titleMatch.reason;
  if (combined >= 0.55 && titleMatch.score < 0.55 && problemTokens >= 0.4) {
    reason =
      "Même problème / angle éditorial malgré des titres différents";
  } else if (angleMatch.score >= 0.7 && intentMatch.score >= 0.55) {
    reason = "Intention et angle très proches";
  } else if (titleProblem >= 0.5) {
    reason = `Similarité sujet/titre (${Math.round(titleProblem * 100)} %)`;
  }

  return {
    score: Number(combined.toFixed(3)),
    reason,
    titleScore: titleMatch.score,
    angleScore: angleMatch.score,
    intentScore: intentMatch.score,
  };
}

export type BatchDedupeResult = {
  kept: RawOpportunityCandidate[];
  dropped: Array<{
    candidate: RawOpportunityCandidate;
    similarTo: string;
    score: number;
    reason: string;
  }>;
};

/**
 * Évite plusieurs articles quasi identiques dans une même recherche.
 * Ne retire pas les sujets complémentaires (score < 0.62).
 */
export function dedupeCandidateBatch(
  candidates: RawOpportunityCandidate[],
  threshold = 0.62
): BatchDedupeResult {
  const kept: RawOpportunityCandidate[] = [];
  const dropped: BatchDedupeResult["dropped"] = [];

  for (const candidate of candidates) {
    let duplicateOf: { title: string; score: number; reason: string } | null =
      null;
    for (const existing of kept) {
      const match = compareEditorialSimilarity(candidate, existing);
      if (match.score >= threshold) {
        duplicateOf = {
          title: existing.title,
          score: match.score,
          reason: match.reason,
        };
        break;
      }
    }
    if (duplicateOf) {
      dropped.push({
        candidate,
        similarTo: duplicateOf.title,
        score: duplicateOf.score,
        reason: duplicateOf.reason,
      });
      continue;
    }
    kept.push(candidate);
  }

  return { kept, dropped };
}

export function isAmbiguousEditorialPair(score: number): boolean {
  return score >= 0.45 && score < 0.62;
}

export function nearlyIdenticalText(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}
