export const MAX_INSTRUCTION_LENGTH = 100_000;

const FORBIDDEN_BODY_KEYS = [
  "id",
  "agentId",
  "agent_id",
  "model",
  "tools",
  "reasoning",
  "metadata",
  "name",
  "service_tier",
  "text",
  "multi_agent",
] as const;

export class EditorialAgentRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EditorialAgentRequestError";
    this.status = status;
  }
}

export type AgentConfigRecord = {
  id: string;
  name: string | null;
  instructions: string | null;
  updated_at: number;
  model: string;
  tools: unknown;
  reasoning: unknown;
  service_tier: string;
  text: unknown;
  multi_agent: unknown;
  metadata: { [key: string]: string };
};

export type EditorialAgentView = {
  id: string;
  name: string | null;
  instructions: string;
  updatedAt: string | null;
};

export type AgentConfigClient = {
  retrieve: (agentId: string) => Promise<AgentConfigRecord>;
  updateInstructions: (agentId: string, instructions: string) => Promise<void>;
};

export function agentConfigFingerprint(agent: AgentConfigRecord): string {
  return JSON.stringify({
    model: agent.model,
    name: agent.name,
    tools: agent.tools,
    reasoning: agent.reasoning,
    service_tier: agent.service_tier,
    text: agent.text,
    multi_agent: agent.multi_agent,
    metadata: agent.metadata,
  });
}

export function toEditorialAgentView(agent: AgentConfigRecord): EditorialAgentView {
  const updatedAt =
    Number.isFinite(agent.updated_at) && agent.updated_at > 0
      ? new Date(agent.updated_at * 1000).toISOString()
      : null;

  return {
    id: agent.id,
    name: agent.name,
    instructions: agent.instructions ?? "",
    updatedAt,
  };
}

export function rejectForeignAgentFields(
  body: Record<string, unknown>
): EditorialAgentRequestError | null {
  for (const key of FORBIDDEN_BODY_KEYS) {
    if (key in body) {
      return new EditorialAgentRequestError(
        "Seul le texte des instructions peut être envoyé.",
        400
      );
    }
  }
  return null;
}

export function validateInstructions(
  value: unknown
): { ok: true; instructions: string } | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: "Les instructions doivent être un texte." };
  }
  if (value.trim().length === 0) {
    return { ok: false, error: "Les instructions ne peuvent pas être vides." };
  }
  if (value.length > MAX_INSTRUCTION_LENGTH) {
    return {
      ok: false,
      error: `Les instructions ne peuvent pas dépasser ${MAX_INSTRUCTION_LENGTH} caractères.`,
    };
  }
  return { ok: true, instructions: value };
}

export function safeOpenAiFailure(error: unknown): EditorialAgentRequestError {
  if (error instanceof EditorialAgentRequestError) {
    return error;
  }

  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 0;

  if (status === 401 || status === 403) {
    return new EditorialAgentRequestError(
      "OpenAI a refusé la requête. Vérifiez la configuration serveur.",
      502
    );
  }
  if (status === 404) {
    return new EditorialAgentRequestError(
      "L’agent configuré est introuvable.",
      502
    );
  }
  if (status === 429) {
    return new EditorialAgentRequestError(
      "OpenAI limite temporairement les requêtes. Réessayez dans un moment.",
      503
    );
  }

  return new EditorialAgentRequestError(
    "Impossible de synchroniser les instructions de l’agent.",
    502
  );
}

export function assertLiveAgentAccessAllowed(): void {
  const automated =
    process.env.NODE_ENV === "test" ||
    process.env.npm_lifecycle_event === "test" ||
    process.argv.includes("--test") ||
    process.execArgv.includes("--test");

  if (automated) {
    throw new EditorialAgentRequestError(
      "Les tests automatisés ne contactent pas l’agent OpenAI.",
      409
    );
  }
}

export type AgentInstructionDeps = {
  authenticated: boolean;
  agentId: string;
  client: AgentConfigClient;
};

export type AgentInstructionResult = {
  status: number;
  body: { agent?: EditorialAgentView; error?: string };
};

function failureResult(error: unknown): AgentInstructionResult {
  const failure = safeOpenAiFailure(error);
  return { status: failure.status, body: { error: failure.message } };
}

export async function handleGetAgentInstructions(
  request: Request,
  deps: AgentInstructionDeps
): Promise<AgentInstructionResult> {
  if (!deps.authenticated) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  const url = new URL(request.url);
  if (
    url.searchParams.has("id") ||
    url.searchParams.has("agentId") ||
    url.searchParams.has("agent_id")
  ) {
    return {
      status: 400,
      body: { error: "Seul le texte des instructions peut être envoyé." },
    };
  }

  try {
    const agent = await loadEditorialInstructions(deps.agentId, deps.client);
    return { status: 200, body: { agent } };
  } catch (error) {
    return failureResult(error);
  }
}

export async function handlePostAgentInstructions(
  request: Request,
  deps: AgentInstructionDeps
): Promise<AgentInstructionResult> {
  if (!deps.authenticated) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { status: 400, body: { error: "Corps JSON invalide." } };
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return { status: 400, body: { error: "Corps JSON invalide." } };
  }

  const foreign = rejectForeignAgentFields(body);
  if (foreign) {
    return { status: foreign.status, body: { error: foreign.message } };
  }

  const parsed = validateInstructions(body.instructions);
  if (!parsed.ok) {
    return { status: 400, body: { error: parsed.error } };
  }

  try {
    const agent = await saveEditorialInstructions(
      deps.agentId,
      parsed.instructions,
      deps.client
    );
    return { status: 200, body: { agent } };
  } catch (error) {
    return failureResult(error);
  }
}

export async function loadEditorialInstructions(
  agentId: string,
  client: AgentConfigClient
): Promise<EditorialAgentView> {
  let agent: AgentConfigRecord;
  try {
    agent = await client.retrieve(agentId);
  } catch (error) {
    throw safeOpenAiFailure(error);
  }

  if (agent.id !== agentId) {
    throw new EditorialAgentRequestError(
      "L’agent renvoyé ne correspond pas à l’identifiant configuré.",
      502
    );
  }

  return toEditorialAgentView(agent);
}

export async function saveEditorialInstructions(
  agentId: string,
  instructions: string,
  client: AgentConfigClient
): Promise<EditorialAgentView> {
  const parsed = validateInstructions(instructions);
  if (!parsed.ok) {
    throw new EditorialAgentRequestError(parsed.error, 400);
  }

  let before: AgentConfigRecord;
  try {
    before = await client.retrieve(agentId);
  } catch (error) {
    throw safeOpenAiFailure(error);
  }

  if (before.id !== agentId) {
    throw new EditorialAgentRequestError(
      "L’agent renvoyé ne correspond pas à l’identifiant configuré.",
      502
    );
  }

  try {
    await client.updateInstructions(agentId, parsed.instructions);
  } catch (error) {
    throw safeOpenAiFailure(error);
  }

  let after: AgentConfigRecord;
  try {
    after = await client.retrieve(agentId);
  } catch (error) {
    throw safeOpenAiFailure(error);
  }

  if (after.id !== agentId) {
    throw new EditorialAgentRequestError(
      "La relecture de l’agent ne correspond pas à l’identifiant configuré.",
      502
    );
  }

  if ((after.instructions ?? "") !== parsed.instructions) {
    throw new EditorialAgentRequestError(
      "OpenAI n’a pas confirmé le texte des instructions.",
      502
    );
  }

  if (agentConfigFingerprint(before) !== agentConfigFingerprint(after)) {
    throw new EditorialAgentRequestError(
      "La mise à jour a modifié d’autres paramètres de l’agent.",
      502
    );
  }

  return toEditorialAgentView(after);
}
