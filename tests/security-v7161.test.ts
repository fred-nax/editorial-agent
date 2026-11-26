import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { isPrivateOrReservedIp } from "../lib/settings/wp-url";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("V7.16.1 SEC — auth order, SSRF, gitignore, session", () => {
  it("SEC-002 — instructions refuse avant resolve OpenAI", () => {
    const src = read("app/api/agent/instructions/route.ts");
    const getFn = src.indexOf("export async function GET");
    const getBody = src.slice(getFn, src.indexOf("export async function POST"));
    const authIdx = getBody.indexOf("if (!session?.user)");
    const resolveIdx = getBody.indexOf("await resolveAgentContext()");
    assert.ok(authIdx >= 0, "garde session absente");
    assert.ok(resolveIdx > authIdx, "auth avant resolveAgentContext");
    assert.match(src, /status: 401/);
    assert.doesNotMatch(
      getBody.slice(0, authIdx),
      /OpenAI non configuré/
    );
  });

  it("SEC-004 — .gitignore couvre .env.local", () => {
    const gi = read(".gitignore");
    assert.match(gi, /^\.env\.\*$/m);
    assert.match(gi, /^!\.env\.example$/m);
  });

  it("SEC-001 — session maxAge explicite", () => {
    const auth = read("auth.ts");
    assert.match(auth, /maxAge:/);
    assert.match(auth, /updateAge:/);
  });

  it("AUTH-003 — middleware protège /api avec exceptions", () => {
    const mw = read("middleware.ts");
    assert.match(mw, /\/api\/auth/);
    assert.match(mw, /google\/sync\/cron/);
    assert.match(mw, /status: 401/);
    assert.match(mw, /matcher:\s*\[\s*"\/api\/:path\*"/);
  });

  it("SEC-005 — IPv4-mappées privées refusées", () => {
    assert.equal(isPrivateOrReservedIp("::ffff:127.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("::ffff:10.0.0.5"), true);
    assert.equal(isPrivateOrReservedIp("::ffff:192.168.1.10"), true);
    assert.equal(isPrivateOrReservedIp("8.8.8.8"), false);
  });

  it("SEC-005 — fetchWordPressNoRedirect revalide l’URL", () => {
    const src = read("lib/settings/wp-url.ts");
    const fn = src.indexOf("export async function fetchWordPressNoRedirect");
    const body = src.slice(fn, fn + 400);
    assert.match(body, /assertSafeWordPressUrlResolved/);
  });

  it("AUTH-005 — dummy bcrypt si email inconnu", () => {
    const auth = read("auth.ts");
    assert.match(auth, /DUMMY_PASSWORD_HASH/);
  });

  it("AUTH-001 — rate-limit dans authorize (pas seulement loginAction)", () => {
    const auth = read("auth.ts");
    assert.match(auth, /async authorize\(credentials,\s*request\)/);
    assert.match(auth, /assertLoginAttemptAllowed/);
    assert.match(auth, /recordLoginAttempt/);
    const action = read("app/login/actions.ts");
    // Pas de double comptage : l’action ne fait que le pré-contrôle UX.
    assert.doesNotMatch(action, /recordLoginAttempt/);
  });
});

describe("V7.16.1 AI-006 — idempotence draft", () => {
  it("refuse un second create_*_draft dans la même session", () => {
    const src = read("lib/agent/run-session.ts");
    assert.match(src, /idempotent_replay/);
    assert.match(src, /cms_draft_uncertain/);
    assert.match(src, /retry_create_forbidden/);
  });
});
