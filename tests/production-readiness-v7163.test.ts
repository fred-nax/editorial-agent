import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  isAuthTrustProxyEnabled,
  resolveClientIpFromHeaders,
} from "../lib/auth/client-ip";
import { missingAuthUrlInProduction } from "../lib/env-check";

function read(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("V7.16.3 — production readiness", () => {
  it("INFRA-001 — drop GEO absent du dépôt et du dockerignore", () => {
    assert.equal(
      existsSync(
        path.join(
          process.cwd(),
          "prisma/migrations/20261103173400_drop_ai_visibility_monitor"
        )
      ),
      false
    );
    const dockerignore = read(".dockerignore");
    assert.match(dockerignore, /drop_ai_visibility_monitor/);
    const start = read("scripts/docker-start.mjs");
    assert.match(start, /drop_ai_visibility_monitor/);
    assert.match(start, /ALLOW_MIGTEST_DATABASE/);
  });

  it("healthchecks publics minimaux + middleware", () => {
    assert.match(read("app/api/health/live/route.ts"), /status:\s*"live"/);
    assert.match(read("app/api/health/ready/route.ts"), /status:\s*"ready"/);
    assert.doesNotMatch(read("app/api/health/ready/route.ts"), /DATABASE_URL/);
    const mw = read("middleware.ts");
    assert.match(mw, /\/api\/health\/live/);
    assert.match(mw, /\/api\/health\/ready/);
  });

  it("AUTH-002 — proxy IP non trusté par défaut ; AUTH_URL prod", () => {
    assert.equal(isAuthTrustProxyEnabled({}), false);
    const spoof = resolveClientIpFromHeaders(
      new Headers({ "x-forwarded-for": "1.2.3.4" }),
      {}
    );
    assert.equal(spoof.ip, "unknown");
    const trusted = resolveClientIpFromHeaders(
      new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }),
      { AUTH_TRUST_PROXY: "1" } as NodeJS.ProcessEnv
    );
    assert.equal(trusted.ip, "9.9.9.9");
    assert.equal(
      missingAuthUrlInProduction({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
      "AUTH_URL (ou NEXTAUTH_URL)"
    );
  });

  it("sécurité HTTP — headers Next config", () => {
    const cfg = read("next.config.ts");
    assert.match(cfg, /X-Content-Type-Options/);
    assert.match(cfg, /X-Frame-Options/);
    assert.match(cfg, /Strict-Transport-Security/);
  });

  it("WS-003 — routes id critiques scopées workspace", () => {
    const files = [
      "app/api/articles/[id]/route.ts",
      "app/api/topics/[id]/route.ts",
      "app/api/opportunities/[id]/route.ts",
      "app/api/custom-themes/[id]/route.ts",
      "app/api/research-configs/[id]/route.ts",
    ];
    for (const file of files) {
      const src = read(file);
      assert.match(
        src,
        /workspaceWhere|workspaceId:\s*workspace\.id/,
        `${file} sans scope workspace`
      );
      assert.doesNotMatch(
        src,
        /findUnique\(\s*\{\s*where:\s*\{\s*id\s*\}/,
        `${file} findUnique({where:{id}}) sans workspace`
      );
    }
    // Veille : store Prisma construit avec workspace.id (pas findUnique id nu).
    const veille = read("app/api/veille/searches/[id]/route.ts");
    assert.match(veille, /prismaWatchHistoryStore\(workspace\.id\)/);
  });

  it("scripts backup/restore refusent la base principale", () => {
    const restore = read("scripts/backup/restore-via-docker.mjs");
    assert.match(restore, /naxialis_agent/);
    assert.match(restore, /CONFIRM_RESTORE/);
    assert.match(restore, /dumpSha256/);
    const backup = read("scripts/backup/backup-via-docker.mjs");
    assert.match(backup, /DATABASE_NAME_GUARD/);
  });

  it("compose validate isolé ne publie pas postgres publiquement hors localhost", () => {
    const compose = read("docker-compose.validate.yml");
    assert.match(compose, /naxialis_agent_validate/);
    assert.match(compose, /127\.0\.0\.1:55432/);
    assert.match(compose, /127\.0\.0\.1:4300/);
    assert.doesNotMatch(compose, /naxialis_agent"/);
  });
});
