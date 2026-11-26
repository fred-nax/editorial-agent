/**
 * V7.16.1 — rate-limit login + DB-003 sur migtest.
 * Aucun appel OpenAI / CMS distant.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { WORKSPACE_IDS } from "../lib/workspace/constants";
import {
  assertLoginAttemptAllowed,
  buildLoginBucketKey,
  purgeExpiredLoginAttempts,
  recordLoginAttempt,
} from "../lib/auth/login-rate-limit";
import { recordOpenAiUsageEvent } from "../lib/openai-usage-tracker";

const PREFIX = "v7161_sec_";

function createDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL requis (migtest uniquement).");
  }
  if (!url.includes("migtest")) {
    throw new Error(
      `Refus d’écrire hors base de test (URL=${url.replace(/:[^:@/]+@/, ":***@")}).`
    );
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
}

describe("V7.16.1 — AuthLoginAttempt + DB-003 (migtest)", () => {
  const db = createDb();
  const genWp = `${PREFIX}gen_wp`;
  const genWf = `${PREFIX}gen_wf`;
  const login = `${PREFIX}admin@example.com`;
  const ip = "203.0.113.50";

  before(async () => {
    process.env.ALLOW_MIGTEST_DATABASE = "1";
    await db.authLoginAttempt.deleteMany({
      where: { loginKey: { startsWith: PREFIX } },
    });
    await db.openAiUsageEvent.deleteMany({
      where: { generationId: { startsWith: PREFIX } },
    });
    await db.articleGeneration.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });

    await db.articleGeneration.create({
      data: {
        id: genWp,
        workspaceId: WORKSPACE_IDS.wordpress,
        subject: "V7161 WP",
        status: "completed",
      },
    });
    await db.articleGeneration.create({
      data: {
        id: genWf,
        workspaceId: WORKSPACE_IDS.webflow,
        subject: "V7161 WF",
        status: "completed",
      },
    });
  });

  after(async () => {
    await db.openAiUsageEvent.deleteMany({
      where: { generationId: { startsWith: PREFIX } },
    });
    await db.articleGeneration.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.authLoginAttempt.deleteMany({
      where: { loginKey: { startsWith: PREFIX } },
    });
    await db.$disconnect();
  });

  it("AUTH-001 — bloque après seuil puis expire", async () => {
    const config = {
      maxAttempts: 3,
      windowMs: 60_000,
      lockoutMs: 200,
    };
    for (let i = 0; i < 3; i++) {
      await recordLoginAttempt({
        ipAddress: ip,
        login,
        success: false,
      });
    }
    const blocked = await assertLoginAttemptAllowed({
      ipAddress: ip,
      login,
      config,
    });
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.message);

    await new Promise((r) => setTimeout(r, 250));
    const afterLock = await assertLoginAttemptAllowed({
      ipAddress: ip,
      login,
      config: { ...config, windowMs: 1 },
      now: new Date(),
    });
    // Fenêtre courte + lockout écoulé ⇒ autorisé (pas de ban permanent).
    assert.equal(afterLock.allowed, true);

    const purged = await purgeExpiredLoginAttempts({
      olderThanMs: 1,
      now: new Date(Date.now() + 3_600_000),
    });
    assert.ok(purged >= 0);
    assert.equal(
      buildLoginBucketKey(ip, login),
      `${ip}|${login}`
    );
  });

  it("DB-003 — refuse generationId d’un autre workspace", async () => {
    const cross = await recordOpenAiUsageEvent({
      workspaceId: WORKSPACE_IDS.wordpress,
      operationType: "article_generation",
      idempotencyKey: `${PREFIX}cross`,
      endpoint: "agents.sessions",
      generationId: genWf,
      completeness: "unknown",
    });
    assert.equal(cross.recorded, false);
    assert.match(String(cross.error), /hors workspace/);

    const ok = await recordOpenAiUsageEvent({
      workspaceId: WORKSPACE_IDS.wordpress,
      operationType: "article_generation",
      idempotencyKey: `${PREFIX}ok`,
      endpoint: "agents.sessions",
      generationId: genWp,
      completeness: "unknown",
      estimatedCostUsd: null,
    });
    assert.equal(ok.recorded, true);
  });
});
