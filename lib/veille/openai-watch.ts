import { assertLiveWatchAllowed, type VeilleSearchClient } from "./search";
import { countryByCode } from "./verify";
import type { VeilleQuery } from "./types";

export function createOpenAiWatchClient(): VeilleSearchClient {
  return {
    async search(input, query: VeilleQuery) {
      assertLiveWatchAllowed();
      const country = countryByCode(query.country);
      const { openai } = await import("@/lib/openai");
      return openai.responses.create({
        model: "gpt-5.6-terra",
        tools: [
          {
            type: "web_search",
            search_context_size: "medium",
            user_location: {
              type: "approximate",
              country: query.country,
              timezone: country?.timezone ?? "Europe/Paris",
            },
          },
        ],
        include: ["web_search_call.action.sources"],
        input,
      });
    },
  };
}
