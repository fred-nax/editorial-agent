/** Comparaison pure titres / slugs — sans accès base. */
import {
  jaccardSimilarity,
  normalizeText,
  slugify,
  tokenize,
} from "./normalize";

export function compareTitleSimilarity(
  left: string,
  right: string
): { score: number; reason: string } {
  const leftNorm = normalizeText(left);
  const rightNorm = normalizeText(right);
  const leftSlug = slugify(left);
  const rightSlug = slugify(right);

  if (leftNorm === rightNorm || leftSlug === rightSlug) {
    return { score: 1, reason: "Titre / slug identique après normalisation" };
  }

  if (
    leftNorm.includes(rightNorm) ||
    rightNorm.includes(leftNorm) ||
    leftSlug.includes(rightSlug) ||
    rightSlug.includes(leftSlug)
  ) {
    return { score: 0.85, reason: "Inclusion forte du titre ou du slug" };
  }

  const tokenScore = jaccardSimilarity(tokenize(left), tokenize(right));
  if (tokenScore >= 0.55) {
    return {
      score: tokenScore,
      reason: `Similarité lexicale élevée (${Math.round(tokenScore * 100)} %)`,
    };
  }
  if (tokenScore >= 0.35) {
    return {
      score: tokenScore,
      reason: `Similarité lexicale modérée (${Math.round(tokenScore * 100)} %)`,
    };
  }

  return { score: tokenScore, reason: "Peu de recouvrement lexical" };
}
