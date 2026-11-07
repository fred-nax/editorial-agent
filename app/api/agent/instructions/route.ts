import { NextResponse } from "next/server";
import {
  handleGetAgentInstructions,
  handlePostAgentInstructions,
} from "@/lib/agent/instructions";
import { createConfiguredAgentClient } from "@/lib/agent/openai-agent-config";
import { env } from "@/lib/env";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

function respond(result: { status: number; body: { error?: string } }) {
  if (result.status >= 500) {
    logError("agent-instructions", "request failed", { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(request: Request) {
  const session = await requireAuth();
  const result = await handleGetAgentInstructions(request, {
    authenticated: Boolean(session?.user),
    agentId: env.OPENAI_AGENT_ID,
    client: createConfiguredAgentClient(env.OPENAI_AGENT_ID),
  });
  return respond(result);
}

export async function POST(request: Request) {
  const session = await requireAuth();
  const result = await handlePostAgentInstructions(request, {
    authenticated: Boolean(session?.user),
    agentId: env.OPENAI_AGENT_ID,
    client: createConfiguredAgentClient(env.OPENAI_AGENT_ID),
  });
  return respond(result);
}
