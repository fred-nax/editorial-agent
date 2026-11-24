/** Estimation locale du temps de lecture (minutes), si le mapping le prévoit. */

export function estimateReadingTimeMinutes(htmlOrText: string): number {
  const text = htmlOrText
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return 1;
  }
  const words = text.split(" ").filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
