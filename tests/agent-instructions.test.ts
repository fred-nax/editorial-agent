import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import {
  agentConfigFingerprint,
  assertLiveAgentAccessAllowed,
  EditorialAgentRequestError,
  handleGetAgentInstructions,
  handlePostAgentInstructions,
  MAX_INSTRUCTION_LENGTH,
  safeOpenAiFailure,
  saveEditorialInstructions,
  toEditorialAgentView,
  type AgentConfigClient,
  type AgentConfigRecord,
} from "../lib/agent/instructions";

const CONFIGURED_ID = "agent_server_configured";

function record(overrides: Partial<AgentConfigRecord> = {}): AgentConfigRecord {
  return {
    id: CONFIGURED_ID,
    name: "Naxialis Editorial",
    instructions: "Rédige en français, puis crée un brouillon.",
    updated_at: 1_700_000_000,
    model: "gpt-5.6-terra",
    tools: [
      { type: "web_search" },
      { type: "function", name: "create_wordpress_draft" },
    ],
    reasoning: { effort: "medium" },
    service_tier: "auto",
    text: { format: { type: "text" } },
    multi_agent: { enabled: false },
    metadata: { owner: "naxialis" },
    ...overrides,
  };
}

function memoryClient(initial: AgentConfigRecord) {
  let current = structuredClone(initial);
  const updates: Array<{ agentId: string; instructions: string }> = [];
  let updateError: unknown = null;
  let rewriteOnUpdate: ((agent: AgentConfigRecord, instructions: string) => AgentConfigRecord) | null =
    null;

  const client: AgentConfigClient = {
    async retrieve(agentId) {
      if (agentId !== CONFIGURED_ID) {
        return record({ id: agentId });
      }
      return structuredClone(current);
    },
    async updateInstructions(agentId, instructions) {
      updates.push({ agentId, instructions });
      if (updateError) {
        throw updateError;
      }
      current = rewriteOnUpdate
        ? rewriteOnUpdate(current, instructions)
        : {
            ...current,
            instructions,
            updated_at: current.updated_at + 60,
          };
    },
  };

  return {
    client,
    updates,
    snapshot: () => structuredClone(current),
    failUpdate(error: unknown) {
      updateError = error;
    },
    rewrite(fn: (agent: AgentConfigRecord, instructions: string) => AgentConfigRecord) {
      rewriteOnUpdate = fn;
    },
  };
}

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("instructions de l’agent éditorial", () => {
  it("affiche les instructions existantes", () => {
    const view = toEditorialAgentView(record());
    assert.equal(view.id, CONFIGURED_ID);
    assert.equal(view.name, "Naxialis Editorial");
    assert.equal(view.instructions, "Rédige en français, puis crée un brouillon.");
    assert.equal(view.updatedAt, new Date(1_700_000_000 * 1000).toISOString());
    const ui = readSource("components/EditorialAgentSettings.tsx");
    assert.match(ui, /value=\{draft\}/);
    assert.match(ui, /agent\.instructions/);
    assert.match(ui, /readOnly/);
    assert.match(ui, /Enregistrer les instructions/);
    assert.match(ui, /Annuler les modifications/);
    assert.match(ui, /Des modifications ne sont pas enregistrées/);
  });

  it("lit les instructions via le client simulé", async () => {
    const store = memoryClient(record());
    const result = await handleGetAgentInstructions(
      new Request("http://local/api/agent/instructions"),
      {
        authenticated: true,
        agentId: CONFIGURED_ID,
        client: store.client,
      }
    );
    assert.equal(result.status, 200);
    assert.equal(
      result.body.agent?.instructions,
      "Rédige en français, puis crée un brouillon."
    );
    assert.equal(store.updates.length, 0);
  });

  it("enregistre uniquement les instructions et confirme par relecture", async () => {
    const store = memoryClient(record());
    const next = "Nouvelle consigne éditoriale.\nConserver le brouillon.";
    const result = await handlePostAgentInstructions(
      new Request("http://local/api/agent/instructions", {
        method: "POST",
        body: JSON.stringify({ instructions: next }),
      }),
      {
        authenticated: true,
        agentId: CONFIGURED_ID,
        client: store.client,
      }
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.agent?.instructions, next);
    assert.equal(store.updates.length, 1);
    assert.deepEqual(store.updates[0], {
      agentId: CONFIGURED_ID,
      instructions: next,
    });
    assert.deepEqual(store.snapshot().tools, record().tools);
    assert.equal(store.snapshot().model, "gpt-5.6-terra");
    assert.equal(
      agentConfigFingerprint(store.snapshot()),
      agentConfigFingerprint(record({ instructions: next, updated_at: store.snapshot().updated_at }))
    );
  });

  it("refuse la réussite si d’autres paramètres changent", async () => {
    const store = memoryClient(record());
    store.rewrite((agent, instructions) => ({
      ...agent,
      instructions,
      model: "autre-modele",
    }));
    await assert.rejects(
      () =>
        saveEditorialInstructions(
          CONFIGURED_ID,
          "Texte valide.",
          store.client
        ),
      (error: unknown) => {
        assert.ok(error instanceof EditorialAgentRequestError);
        assert.match(error.message, /autres paramètres/);
        assert.equal(error.status, 502);
        return true;
      }
    );
  });

  it("refuse la réussite si OpenAI ne confirme pas le texte", async () => {
    const store = memoryClient(record());
    store.rewrite((agent) => ({
      ...agent,
      instructions: "texte différent",
    }));
    await assert.rejects(
      () =>
        saveEditorialInstructions(CONFIGURED_ID, "Texte envoyé.", store.client),
      /n’a pas confirmé/
    );
  });

  it("refuse l’accès non authentifié sans appeler OpenAI", async () => {
    let calls = 0;
    const client: AgentConfigClient = {
      async retrieve() {
        calls += 1;
        throw new Error("ne doit pas être appelé");
      },
      async updateInstructions() {
        calls += 1;
        throw new Error("ne doit pas être appelé");
      },
    };
    const deps = {
      authenticated: false,
      agentId: CONFIGURED_ID,
      client,
    };
    const read = await handleGetAgentInstructions(
      new Request("http://local/api/agent/instructions"),
      deps
    );
    const write = await handlePostAgentInstructions(
      new Request("http://local/api/agent/instructions", {
        method: "POST",
        body: JSON.stringify({ instructions: "Nouvelle consigne." }),
      }),
      deps
    );
    assert.equal(read.status, 401);
    assert.equal(write.status, 401);
    assert.equal(calls, 0);
  });

  it("refuse un identifiant d’agent fourni par le client", async () => {
    const store = memoryClient(record());
    const result = await handlePostAgentInstructions(
      new Request("http://local/api/agent/instructions", {
        method: "POST",
        body: JSON.stringify({
          agentId: "agent_autre",
          instructions: "Consigne.",
        }),
      }),
      {
        authenticated: true,
        agentId: CONFIGURED_ID,
        client: store.client,
      }
    );
    assert.equal(result.status, 400);
    assert.equal(store.updates.length, 0);
    const query = await handleGetAgentInstructions(
      new Request("http://local/api/agent/instructions?agent_id=agent_autre"),
      {
        authenticated: true,
        agentId: CONFIGURED_ID,
        client: store.client,
      }
    );
    assert.equal(query.status, 400);
  });

  it("masque une erreur OpenAI et n’expose pas de secret", async () => {
    const store = memoryClient(record());
    store.failUpdate({
      status: 500,
      message: "upstream failed sk-live-secret-value OPENAI_API_KEY=abc",
    });
    const result = await handlePostAgentInstructions(
      new Request("http://local/api/agent/instructions", {
        method: "POST",
        body: JSON.stringify({ instructions: "Consigne de secours." }),
      }),
      {
        authenticated: true,
        agentId: CONFIGURED_ID,
        client: store.client,
      }
    );
    assert.equal(result.status, 502);
    assert.match(result.body.error ?? "", /Impossible de synchroniser/);
    assert.doesNotMatch(result.body.error ?? "", /sk-live/);
    assert.doesNotMatch(result.body.error ?? "", /OPENAI_API_KEY/);
    assert.equal(store.snapshot().instructions, record().instructions);
    const mapped = safeOpenAiFailure({
      status: 401,
      message: "Incorrect API key sk-test",
    });
    assert.doesNotMatch(mapped.message, /sk-test/);
  });

  it("valide la taille et le contenu", async () => {
    const store = memoryClient(record());
    const empty = await handlePostAgentInstructions(
      new Request("http://local/api/agent/instructions", {
        method: "POST",
        body: JSON.stringify({ instructions: "   " }),
      }),
      {
        authenticated: true,
        agentId: CONFIGURED_ID,
        client: store.client,
      }
    );
    assert.equal(empty.status, 400);
    const huge = await handlePostAgentInstructions(
      new Request("http://local/api/agent/instructions", {
        method: "POST",
        body: JSON.stringify({ instructions: "a".repeat(MAX_INSTRUCTION_LENGTH + 1) }),
      }),
      {
        authenticated: true,
        agentId: CONFIGURED_ID,
        client: store.client,
      }
    );
    assert.equal(huge.status, 400);
    assert.equal(store.updates.length, 0);
  });

  it("n’appelle pas l’agent réel pendant les tests automatisés", () => {
    assert.equal(process.env.npm_lifecycle_event, "test");
    assert.throws(
      () => assertLiveAgentAccessAllowed(),
      (error: unknown) => {
        assert.ok(error instanceof EditorialAgentRequestError);
        assert.equal(error.status, 409);
        assert.match(error.message, /ne contactent pas/);
        return true;
      }
    );
    const live = readSource("lib/agent/openai-agent-config.ts");
    assert.match(live, /assertLiveAgentAccessAllowed\(\)/);
    assert.match(live, /beta\.agents\.retrieve\(agentId\)/);
    assert.match(live, /beta\.agents\.update\(agentId,\s*\{\s*instructions\s*\}\)/);
    assert.doesNotMatch(
      live,
      /agents\.update\([\s\S]*\b(tools|model|reasoning)\s*:/
    );
    const route = readSource("app/api/agent/instructions/route.ts");
    assert.match(route, /requireAuth/);
    assert.match(route, /env\.OPENAI_AGENT_ID/);
    assert.doesNotMatch(route, /OPENAI_API_KEY/);
    assert.doesNotMatch(route, /prisma|db\./);
    const ui = readSource("components/EditorialAgentSettings.tsx");
    assert.doesNotMatch(ui, /OPENAI_API_KEY|process\.env/);
    const session = readSource("lib/agent/run-session.ts");
    assert.match(session, /sessions\.create/);
    assert.doesNotMatch(session, /agents\.update/);
  });
});
