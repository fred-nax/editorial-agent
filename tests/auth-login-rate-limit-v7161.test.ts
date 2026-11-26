import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLoginBucketKey,
  normalizeLoginKey,
  readLoginRateLimitConfig,
} from "../lib/auth/login-rate-limit";
import {
  isAuthTrustProxyEnabled,
  resolveClientIpFromHeaders,
} from "../lib/auth/client-ip";

describe("V7.16.1 AUTH-001 — rate-limit config & IP", () => {
  it("normalise le login et construit le bucket", () => {
    assert.equal(normalizeLoginKey(" Admin@Example.COM "), "admin@example.com");
    assert.equal(
      buildLoginBucketKey("1.2.3.4", "admin@example.com"),
      "1.2.3.4|admin@example.com"
    );
  });

  it("lit les seuils configurables avec défauts documentés", () => {
    const defaults = readLoginRateLimitConfig({});
    assert.equal(defaults.maxAttempts, 10);
    assert.equal(defaults.windowMs, 15 * 60 * 1000);
    assert.equal(defaults.lockoutMs, 15 * 60 * 1000);

    const custom = readLoginRateLimitConfig({
      AUTH_LOGIN_MAX_ATTEMPTS: "5",
      AUTH_LOGIN_WINDOW_MS: "60000",
      AUTH_LOGIN_LOCKOUT_MS: "120000",
    } as NodeJS.ProcessEnv);
    assert.equal(custom.maxAttempts, 5);
    assert.equal(custom.windowMs, 60_000);
    assert.equal(custom.lockoutMs, 120_000);
  });

  it("ignore X-Forwarded-For sans AUTH_TRUST_PROXY", () => {
    const headers = new Headers({
      "x-forwarded-for": "9.9.9.9, 10.0.0.1",
    });
    const resolved = resolveClientIpFromHeaders(headers, {});
    assert.equal(resolved.ip, "unknown");
    assert.equal(resolved.source, "unknown");
    assert.equal(resolved.trustedProxy, false);
  });

  it("utilise X-Forwarded-For uniquement si proxy de confiance", () => {
    assert.equal(
      isAuthTrustProxyEnabled({ AUTH_TRUST_PROXY: "1" } as NodeJS.ProcessEnv),
      true
    );
    const headers = new Headers({
      "x-forwarded-for": "9.9.9.9, 10.0.0.1",
    });
    const resolved = resolveClientIpFromHeaders(headers, {
      AUTH_TRUST_PROXY: "1",
    } as NodeJS.ProcessEnv);
    assert.equal(resolved.ip, "9.9.9.9");
    assert.equal(resolved.source, "x-forwarded-for");
  });

  it("ne fait pas confiance à un XFF client sans flag", () => {
    const spoofed = resolveClientIpFromHeaders(
      new Headers({ "x-forwarded-for": "1.1.1.1" }),
      { AUTH_TRUST_PROXY: "0" } as NodeJS.ProcessEnv
    );
    assert.equal(spoofed.ip, "unknown");
  });
});
