import { SuggestionRequestError, type SuggestionClient } from "./suggestions";
import { parseResponsesUsage } from "@/lib/openai-usage-parse";
import { recordResponsesApiUsage } from "@/lib/openai-usage-tracker";

export const VEILLE_SUGGESTION_MODEL = "gpt-5.6-terra";

const SUGGESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    suggestions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          angle: { type: "string" },
          intent: { type: "string" },
          format: {
            type: "string",
            enum: ["guide", "analyse", "comparatif", "checklist", "autre"],
          },
          rationale: { type: "string" },
        },
        required: ["title", "angle", "intent", "format", "rationale"],
      },
    },
  },
  required: ["suggestions"],
} as const;

export function assertLiveSuggestionsAllowed(): void {
  const automated =
    process.env.NODE_ENV === "test" ||
    process.env.npm_lifecycle_event === "test" ||
    process.argv.includes("--test") ||
    process.execArgv.includes("--test");
  if (automated) {
    throw new SuggestionRequestError(
      "Les tests automatisés ne contactent pas OpenAI.",
      409
    );
  }
}

export function createOpenAiSuggestionClient(
  workspaceId: string
): SuggestionClient {
  const frozenWorkspaceId = workspaceId.trim();
  return {
    async suggest(input: string) {
      assertLiveSuggestionsAllowed();
      const { getOpenAIClient } = await import("@/lib/openai");
      const openai = await getOpenAIClient();
      const response = await openai.responses.create({
        model: VEILLE_SUGGESTION_MODEL,
        input,
        text: {
          format: {
            type: "json_schema",
            name: "veille_seo_suggestions",
            strict: true,
            schema: SUGGESTION_SCHEMA,
          },
        },
      });

      const usage = parseResponsesUsage(response);
      const responseId = usage?.responseId ?? `veille-sug:${Date.now()}`;
      await recordResponsesApiUsage({
        workspaceId: frozenWorkspaceId,
        operationType: "editorial_watch_suggestions",
        idempotencyKey: `veille:suggestions:${responseId}`,
        operationKey: responseId,
        model: VEILLE_SUGGESTION_MODEL,
        status: "succeeded",
        usage,
      });

      return response;
    },
  };
}
