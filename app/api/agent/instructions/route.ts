import { NextResponse } from "next/server";
import {
  handleGetAgentInstructions,
  handlePostAgentInstructions,
} from "@/lib/agent/instructions";
import { createConfiguredAgentClient } from "@/lib/agent/openai-agent-config";
import { resolveOpenAiConfig } from "@/lib/settings/app-settings";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

function respond(result: { status: number; body: { error?: string } }) {
  if (result.status >= 500) {
    logError("agent-instructions", "request failed", { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}

async function resolveAgentContext() {
  const config = await resolveOpenAiConfig();
  if (!config) {
    return null;
  }
  return {
    agentId: config.agentId,
    client: createConfiguredAgentClient(config.agentId),
  };
}

export async function GET(request: Request) {
  const session = await requireAuth();
  const context = await resolveAgentContext();
  if (!context) {
    return NextResponse.json(
      { error: "OpenAI non configuré." },
      { status: 503 }
    );
  }
  const result = await handleGetAgentInstructions(request, {
    authenticated: Boolean(session?.user),
    agentId: context.agentId,
    client: context.client,
  });
  return respond(result);
}

export async function POST(request: Request) {
  const session = await requireAuth();
  const context = await resolveAgentContext();
  if (!context) {
    return NextResponse.json(
      { error: "OpenAI non configuré." },
      { status: 503 }
    );
  }
  const result = await handlePostAgentInstructions(request, {
    authenticated: Boolean(session?.user),
    agentId: context.agentId,
    client: context.client,
  });
  return respond(result);
}
