import type { Agent } from "openai/resources/beta/agents/agents.js";
import {
  assertLiveAgentAccessAllowed,
  EditorialAgentRequestError,
  type AgentConfigClient,
  type AgentConfigRecord,
} from "@/lib/agent/instructions";

function toRecord(agent: Agent): AgentConfigRecord {
  return {
    id: agent.id,
    name: agent.name,
    instructions: agent.instructions,
    updated_at: agent.updated_at,
    model: agent.model,
    tools: agent.tools,
    reasoning: agent.reasoning,
    service_tier: agent.service_tier,
    text: agent.text,
    multi_agent: agent.multi_agent,
    metadata: agent.metadata,
  };
}

export function createConfiguredAgentClient(agentId: string): AgentConfigClient {
  return {
    async retrieve(requestedId) {
      assertLiveAgentAccessAllowed();
      if (requestedId !== agentId) {
        throw new EditorialAgentRequestError(
          "Identifiant d’agent refusé.",
          400
        );
      }
      const { openai } = await import("@/lib/openai");
      const agent = await openai.beta.agents.retrieve(agentId);
      return toRecord(agent);
    },
    async updateInstructions(requestedId, instructions) {
      assertLiveAgentAccessAllowed();
      if (requestedId !== agentId) {
        throw new EditorialAgentRequestError(
          "Identifiant d’agent refusé.",
          400
        );
      }
      const { openai } = await import("@/lib/openai");
      await openai.beta.agents.update(agentId, { instructions });
    },
  };
}
