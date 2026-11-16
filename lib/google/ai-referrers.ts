/**
 * Classification des sources GA4 identifiables (assistants IA / organique Google).
 * Ne couvre pas AI Overviews / AI Mode (non exposés via l’API Search Console).
 */

export type TrafficSourceKey =
  | "chatgpt"
  | "perplexity"
  | "claude"
  | "gemini"
  | "copilot"
  | "other_ai"
  | "organic_google"
  | "other";

export const AI_SOURCE_KEYS: TrafficSourceKey[] = [
  "chatgpt",
  "perplexity",
  "claude",
  "gemini",
  "copilot",
  "other_ai",
];

const AI_HOST_RULES: Array<{ key: Exclude<TrafficSourceKey, "organic_google" | "other">; patterns: RegExp[] }> = [
  {
    key: "chatgpt",
    patterns: [/chatgpt\.com/i, /chat\.openai\.com/i, /openai\.com/i],
  },
  {
    key: "perplexity",
    patterns: [/perplexity\.ai/i],
  },
  {
    key: "claude",
    patterns: [/claude\.ai/i, /anthropic\.com/i],
  },
  {
    key: "gemini",
    patterns: [/gemini\.google\.com/i, /bard\.google\.com/i],
  },
  {
    key: "copilot",
    patterns: [/copilot\.microsoft\.com/i, /bing\.com\/chat/i],
  },
];

function haystack(source: string, medium: string, referrer: string): string {
  return `${source} ${medium} ${referrer}`.toLowerCase();
}

export function classifyTrafficSource(input: {
  sessionSource?: string | null;
  sessionMedium?: string | null;
  sessionSourceMedium?: string | null;
  pageReferrer?: string | null;
}): TrafficSourceKey {
  const source = (input.sessionSource ?? "").trim();
  const medium = (input.sessionMedium ?? "").trim();
  const combined =
    input.sessionSourceMedium?.trim() ||
    (source || medium ? `${source} / ${medium}` : "");
  const referrer = (input.pageReferrer ?? "").trim();
  const text = haystack(source, medium, `${combined} ${referrer}`);

  for (const rule of AI_HOST_RULES) {
    if (rule.patterns.some((re) => re.test(text))) {
      return rule.key;
    }
  }

  // Indices génériques « AI chat » sans inventer AI Overviews.
  if (
    /\b(chat\s*gpt|perplexity|claude\.ai|gemini|copilot)\b/i.test(text) ||
    (/ai/i.test(source) && /referral|organic/i.test(medium))
  ) {
    return "other_ai";
  }

  if (
    /google/i.test(source) &&
    (/organic/i.test(medium) || medium === "" || medium === "(none)")
  ) {
    return "organic_google";
  }
  if (/google\./i.test(referrer) && /organic/i.test(medium || "organic")) {
    return "organic_google";
  }

  return "other";
}

export function isAiSourceKey(key: string): boolean {
  return AI_SOURCE_KEYS.includes(key as TrafficSourceKey);
}

export function aiSourceLabel(key: string): string {
  switch (key) {
    case "chatgpt":
      return "ChatGPT";
    case "perplexity":
      return "Perplexity";
    case "claude":
      return "Claude";
    case "gemini":
      return "Gemini";
    case "copilot":
      return "Microsoft Copilot";
    case "other_ai":
      return "Autre assistant IA";
    case "organic_google":
      return "Google organique";
    default:
      return "Autre / non attribuable";
  }
}
