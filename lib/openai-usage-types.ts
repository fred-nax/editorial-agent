export const OPENAI_USAGE_OPERATION_TYPES = [
  "article_generation",
  "web_search",
  "image_generation",
  "image_alt",
  "editorial_watch",
  "editorial_watch_suggestions",
  "seo_opportunity",
  "title_suggestion",
  "editorial_similarity",
] as const;

export type OpenAiUsageOperationType =
  (typeof OPENAI_USAGE_OPERATION_TYPES)[number];

export type OpenAiUsageCompleteness =
  | "complete"
  | "partial"
  | "unknown"
  | "zero";

export type OpenAiUsageStatus = "succeeded" | "failed" | "partial";
