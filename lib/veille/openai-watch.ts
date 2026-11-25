import { assertLiveWatchAllowed, type VeilleSearchClient } from "./search";
import { countryByCode } from "./verify";
import type { VeilleQuery } from "./types";
import {
  countWebSearchCallsInResponse,
  parseResponsesUsage,
} from "@/lib/openai-usage-parse";
import { recordResponsesApiUsage } from "@/lib/openai-usage-tracker";

export type WebSearchToolConfig = {
  type: "web_search";
  search_context_size: "medium";
  user_location?: {
    type: "approximate";
    country: string;
    timezone: string;
  };
};

/**
 * Build the OpenAI web_search tool options for a veille zone.
 * International (INT_EN) omits user_location so the search is not pinned to one country.
 * US and existing ISO countries pass an approximate user_location.
 */
export function buildWebSearchToolConfig(query: VeilleQuery): WebSearchToolConfig {
  const zone = countryByCode(query.country);
  const tool: WebSearchToolConfig = {
    type: "web_search",
    search_context_size: "medium",
  };
  if (!zone || zone.searchScope === "international") {
    return tool;
  }
  tool.user_location = {
    type: "approximate",
    country: zone.code,
    timezone: zone.timezone,
  };
  return tool;
}

export function createOpenAiWatchClient(workspaceId: string): VeilleSearchClient {
  const frozenWorkspaceId = workspaceId.trim();
  return {
    async search(input, query: VeilleQuery) {
      assertLiveWatchAllowed();
      const { getOpenAIClient } = await import("@/lib/openai");
      const openai = await getOpenAIClient();
      const model = "gpt-5.6-terra";
      let response: unknown;
      try {
        response = await openai.responses.create({
          model,
          tools: [buildWebSearchToolConfig(query)],
          include: ["web_search_call.action.sources"],
          input,
        });
      } catch (error) {
        // Échec local après tentative : pas de usage retournée → rien à enregistrer.
        throw error;
      }

      const usage = parseResponsesUsage(response);
      const webSearchCallCount = countWebSearchCallsInResponse(response);
      const responseId = usage?.responseId ?? `veille:${Date.now()}`;
      await recordResponsesApiUsage({
        workspaceId: frozenWorkspaceId,
        operationType: "editorial_watch",
        idempotencyKey: `veille:search:${responseId}`,
        operationKey: responseId,
        model,
        status: "succeeded",
        usage,
        webSearchCallCount,
      });

      return response;
    },
  };
}
