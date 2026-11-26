/**
 * Recette AUTH-001 isolée (migtest) — ne touche pas le bucket admin réel.
 * Aucun appel HTTP vers le serveur utilisateur :4000.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveClientIpFromHeaders } from "../lib/auth/client-ip";
import {
  assertLoginAttemptAllowed,
  buildLoginBucketKey,
  normalizeLoginKey,
  recordLoginAttempt,
  readLoginRateLimitConfig,
} from "../lib/auth/login-rate-limit";
import { readFileSync } from "node:fs";

const PREFIX = "v7161_recipe_";
const FAKE_LOGIN = `${PREFIX}nobody@example.invalid`;
const FAKE_IP = "198.51.100.77";

function createDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url?.includes("migtest")) {
    throw new Error("DATABASE_URL migtest requis pour la recette AUTH-001.");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
}

describe("Recette V7.16.1 AUTH-001 (migtest isolé)", () => {
  const db = createDb();
  const config = { maxAttempts: 5, windowMs: 120_000, lockoutMs: 300 };

  before(async () => {
    process.env.ALLOW_MIGTEST_DATABASE = "1";
    await db.authLoginAttempt.deleteMany({
      where: { loginKey: { startsWith: PREFIX } },
    });
  });

  after(async () => {
    await db.authLoginAttempt.deleteMany({
      where: { loginKey: { startsWith: PREFIX } },
    });
    await db.$disconnect();
  });

  it("bloque après dépassement du seuil (tentatives incorrectes)", async () => {
    for (let i = 0; i < 5; i++) {
      await recordLoginAttempt({
        ipAddress: FAKE_IP,
        login: FAKE_LOGIN,
        success: false,
      });
    }
    const blocked = await assertLoginAttemptAllowed({
      ipAddress: FAKE_IP,
      login: FAKE_LOGIN,
      config,
    });
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.message);
  });

  it("expire le blocage puis autorise une nouvelle tentative", async () => {
    await new Promise((r) => setTimeout(r, 350));
    const after = await assertLoginAttemptAllowed({
      ipAddress: FAKE_IP,
      login: FAKE_LOGIN,
      config,
    });
    assert.equal(after.allowed, true);
    assert.equal(after.remainingAttempts, config.maxAttempts);
  });

  it("enregistre un succès après expiration sans bloquer", async () => {
    await recordLoginAttempt({
      ipAddress: FAKE_IP,
      login: FAKE_LOGIN,
      success: true,
    });
    const ok = await assertLoginAttemptAllowed({
      ipAddress: FAKE_IP,
      login: FAKE_LOGIN,
      config,
    });
    assert.equal(ok.allowed, true);
  });

  it("ignore X-Forwarded-For falsifié sans AUTH_TRUST_PROXY", () => {
    const spoofed = resolveClientIpFromHeaders(
      new Headers({ "x-forwarded-for": "203.0.113.9" }),
      { AUTH_TRUST_PROXY: "0" } as NodeJS.ProcessEnv
    );
    assert.equal(spoofed.ip, "unknown");
  });

  it("accepte XFF seulement si AUTH_TRUST_PROXY=1", () => {
    const trusted = resolveClientIpFromHeaders(
      new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }),
      { AUTH_TRUST_PROXY: "1" } as NodeJS.ProcessEnv
    );
    assert.equal(trusted.ip, "203.0.113.9");
  });

  it("isole les buckets par login (pas d’énumération croisée)", async () => {
    const other = `${PREFIX}other@example.invalid`;
    for (let i = 0; i < 5; i++) {
      await recordLoginAttempt({
        ipAddress: FAKE_IP,
        login: other,
        success: false,
      });
    }
    const otherBlocked = await assertLoginAttemptAllowed({
      ipAddress: FAKE_IP,
      login: other,
      config,
    });
    assert.equal(otherBlocked.allowed, false);

    const fresh = `${PREFIX}fresh@example.invalid`;
    const freshOk = await assertLoginAttemptAllowed({
      ipAddress: FAKE_IP,
      login: fresh,
      config,
    });
    assert.equal(freshOk.allowed, true);
  });

  it("concurrence : N échecs simultanés atteignent le seuil", async () => {
    const login = `${PREFIX}concurrent@example.invalid`;
    const ip = "198.51.100.88";
    await Promise.all(
      Array.from({ length: 5 }, () =>
        recordLoginAttempt({ ipAddress: ip, login, success: false })
      )
    );
    const decision = await assertLoginAttemptAllowed({
      ipAddress: ip,
      login,
      config,
    });
    assert.equal(decision.allowed, false);
    const count = await db.authLoginAttempt.count({
      where: {
        bucketKey: buildLoginBucketKey(ip, normalizeLoginKey(login)),
        success: false,
      },
    });
    assert.equal(count, 5);
  });

  it("persistance après « redémarrage » (nouveau client Prisma)", async () => {
    const login = `${PREFIX}persist@example.invalid`;
    const ip = "198.51.100.99";
    for (let i = 0; i < 5; i++) {
      await recordLoginAttempt({ ipAddress: ip, login, success: false });
    }
    const db2 = createDb();
    try {
      const still = await db2.authLoginAttempt.count({
        where: {
          bucketKey: buildLoginBucketKey(ip, normalizeLoginKey(login)),
          success: false,
        },
      });
      assert.equal(still, 5);
      // Le limiteur lit la même table → blocage survit au redémarrage process.
      const decision = await assertLoginAttemptAllowed({
        ipAddress: ip,
        login,
        config,
      });
      assert.equal(decision.allowed, false);
    } finally {
      await db2.$disconnect();
    }
  });

  it("authorize couvre le callback Credentials ; loginAction ne double-compte pas", () => {
    const auth = readFileSync("auth.ts", "utf8");
    const action = readFileSync("app/login/actions.ts", "utf8");
    assert.match(auth, /async authorize\(credentials,\s*request\)/);
    assert.match(auth, /assertLoginAttemptAllowed/);
    assert.match(auth, /recordLoginAttempt/);
    assert.doesNotMatch(action, /recordLoginAttempt/);
    assert.match(action, /assertLoginAttemptAllowed/);
    const defaults = readLoginRateLimitConfig({});
    assert.equal(defaults.maxAttempts, 10);
  });

  it("ne cible jamais le bucket admin réel (préfixe recipe)", async () => {
    const adminish = await db.authLoginAttempt.count({
      where: {
        AND: [
          { loginKey: { startsWith: PREFIX } },
          { loginKey: { contains: "admin@" } },
        ],
      },
    });
    assert.equal(adminish, 0);
  });
});
