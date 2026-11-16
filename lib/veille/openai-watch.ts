import { assertLiveWatchAllowed, type VeilleSearchClient } from "./search";
import { countryByCode } from "./verify";
import type { VeilleQuery } from "./types";

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

export function createOpenAiWatchClient(): VeilleSearchClient {
  return {
    async search(input, query: VeilleQuery) {
      assertLiveWatchAllowed();
      const { getOpenAIClient } = await import("@/lib/openai");
      const openai = await getOpenAIClient();
      return openai.responses.create({
        model: "gpt-5.6-terra",
        tools: [buildWebSearchToolConfig(query)],
        include: ["web_search_call.action.sources"],
        input,
      });
    },
  };
}
