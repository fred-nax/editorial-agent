/** Mapping score opportunité → priorité Topic (sans génération). */
export function scoreToTopicPriority(scoreTotal: number): number {
  if (scoreTotal >= 80) {
    return 1;
  }
  if (scoreTotal >= 60) {
    return 2;
  }
  return 0;
}
