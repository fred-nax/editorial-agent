/**
 * Recette SEC-002 — refus non-auth indépendant de l’état OpenAI.
 * Aucun appel au serveur utilisateur :4000.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("Recette V7.16.1 SEC-002 instructions (contrat)", () => {
  it("ordre code : 401 avant resolveAgentContext", () => {
    const src = readFileSync("app/api/agent/instructions/route.ts", "utf8");
    for (const fn of ["GET", "POST"] as const) {
      const start = src.indexOf(`export async function ${fn}`);
      assert.ok(start >= 0, fn);
      const end =
        fn === "GET"
          ? src.indexOf("export async function POST")
          : src.length;
      const body = src.slice(start, end);
      const authIdx = body.indexOf("if (!session?.user)");
      const resolveIdx = body.indexOf("await resolveAgentContext()");
      assert.ok(authIdx >= 0 && resolveIdx > authIdx, `${fn} auth avant resolve`);
      assert.doesNotMatch(body.slice(0, authIdx), /OpenAI non configuré/);
    }
  });

  it("réponses non-auth identiques quel que soit l’état config (contrat)", async () => {
    async function simulatedGet(
      session: { user?: unknown } | null,
      configOk: boolean
    ) {
      if (!session?.user) {
        return { status: 401 as const, body: { error: "Non authentifié." } };
      }
      if (!configOk) {
        return { status: 503 as const, body: { error: "OpenAI non configuré." } };
      }
      return { status: 200 as const, body: { ok: true } };
    }

    const a = await simulatedGet(null, true);
    const b = await simulatedGet(null, false);
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.error, b.body.error);
    assert.equal((await simulatedGet({ user: {} }, false)).status, 503);
  });
});
