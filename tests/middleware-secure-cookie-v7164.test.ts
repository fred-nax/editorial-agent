/**
 * OPS-03A / V7.16.4 — non-régression AUTH-003 derrière reverse-proxy HTTPS.
 * Tokens JWT Auth.js réels (@auth/core encode/getToken) — pas de mock getToken.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import { encode, getToken } from "@auth/core/jwt";
import { resolveSecureSessionCookie } from "../lib/auth/secure-cookie";

const require = createRequire(import.meta.url);
const cookieUtilPath = path.join(
  process.cwd(),
  "node_modules/@auth/core/lib/utils/cookie.js"
);
const { defaultCookies } = require(cookieUtilPath) as {
  defaultCookies: (secure: boolean) => {
    sessionToken: { name: string };
  };
};

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const SECRET = "v7164-test-auth-secret-32chars-min!!";
const WRONG_SECRET = "v7164-wrong-auth-secret-32chars-min!";
const SECURE_COOKIE = "__Secure-authjs.session-token";
const PLAIN_COOKIE = "authjs.session-token";

async function mintSessionCookie(opts: {
  secure: boolean;
  secret?: string;
  maxAge?: number;
  email?: string;
}): Promise<{ name: string; value: string }> {
  const name = opts.secure ? SECURE_COOKIE : PLAIN_COOKIE;
  assert.equal(defaultCookies(opts.secure).sessionToken.name, name);
  const value = await encode({
    token: {
      sub: "admin",
      email: opts.email ?? "validate@example.invalid",
      name: "Administrateur",
    },
    secret: opts.secret ?? SECRET,
    salt: name,
    maxAge: opts.maxAge ?? 60 * 60,
  });
  return { name, value };
}

describe("V7.16.4 OPS-03A — resolveSecureSessionCookie", () => {
  it("AUTH_URL https force Secure même si XFF=http (anti-falsification)", () => {
    assert.equal(
      resolveSecureSessionCookie({
        authUrl: "https://agent-client-01.naxialis.com",
        forwardedProto: "http",
        requestProtocol: "http:",
        nodeEnv: "production",
      }),
      true
    );
  });

  it("AUTH_URL http conserve non-Secure (dev local)", () => {
    assert.equal(
      resolveSecureSessionCookie({
        authUrl: "http://localhost:3000",
        forwardedProto: "https",
        requestProtocol: "http:",
        nodeEnv: "development",
      }),
      false
    );
  });

  it("sans AUTH_URL, XFF https monte vers Secure", () => {
    assert.equal(
      resolveSecureSessionCookie({
        authUrl: null,
        forwardedProto: "https, http",
        requestProtocol: "http:",
        nodeEnv: "development",
      }),
      true
    );
  });

  it("sans AUTH_URL, XFF=http ne force PAS non-secure en production", () => {
    assert.equal(
      resolveSecureSessionCookie({
        authUrl: null,
        forwardedProto: "http",
        requestProtocol: "http:",
        nodeEnv: "production",
      }),
      true
    );
  });

  it("sans AUTH_URL ni XFF, protocole https de la requête prévaut", () => {
    assert.equal(
      resolveSecureSessionCookie({ requestProtocol: "https:", nodeEnv: "development" }),
      true
    );
    assert.equal(
      resolveSecureSessionCookie({ requestProtocol: "http:", nodeEnv: "development" }),
      false
    );
  });
});

describe("V7.16.4 OPS-03A — getToken réel Auth.js", () => {
  it("cookie Secure reconnu avec AUTH_URL https + requête HTTP (proxy TLS)", async () => {
    const { name, value } = await mintSessionCookie({ secure: true });
    assert.equal(name, "__Secure-authjs.session-token");

    const req = new Request("http://127.0.0.1:3000/api/agent/instructions", {
      headers: {
        cookie: `${name}=${value}`,
        "x-forwarded-proto": "https",
      },
    });

    const secureCookie = resolveSecureSessionCookie({
      authUrl: "https://agent-client-01.naxialis.com",
      forwardedProto: "https",
      requestProtocol: "http:",
      nodeEnv: "production",
    });
    assert.equal(secureCookie, true);

    const without = await getToken({ req, secret: SECRET });
    assert.equal(without, null, "sans secureCookie → faux 401 (bug V7.16.3)");

    const withFlag = await getToken({ req, secret: SECRET, secureCookie });
    assert.ok(withFlag);
    assert.equal(withFlag.email, "validate@example.invalid");
  });

  it("session HTTP locale (cookie non préfixé) avec AUTH_URL http", async () => {
    const { name, value } = await mintSessionCookie({ secure: false });
    assert.equal(name, "authjs.session-token");

    const req = new Request("http://127.0.0.1:3000/api/google/status", {
      headers: { cookie: `${name}=${value}` },
    });
    const secureCookie = resolveSecureSessionCookie({
      authUrl: "http://127.0.0.1:4300",
      requestProtocol: "http:",
      nodeEnv: "development",
    });
    assert.equal(secureCookie, false);
    const token = await getToken({ req, secret: SECRET, secureCookie });
    assert.ok(token);
  });

  it("cookie absent → null", async () => {
    const req = new Request("http://127.0.0.1:3000/api/settings/wordpress");
    const token = await getToken({
      req,
      secret: SECRET,
      secureCookie: true,
    });
    assert.equal(token, null);
  });

  it("secret incorrect → null", async () => {
    const { name, value } = await mintSessionCookie({ secure: true });
    const req = new Request("http://127.0.0.1:3000/api/agent/instructions", {
      headers: { cookie: `${name}=${value}` },
    });
    const token = await getToken({
      req,
      secret: WRONG_SECRET,
      secureCookie: true,
    });
    assert.equal(token, null);
  });

  it("cookie expiré → null", async () => {
    // clockTolerance jose = 15s — dépasser largement
    const { name, value } = await mintSessionCookie({
      secure: true,
      maxAge: -120,
    });
    const req = new Request("http://127.0.0.1:3000/api/agent/instructions", {
      headers: { cookie: `${name}=${value}` },
    });
    const token = await getToken({
      req,
      secret: SECRET,
      secureCookie: true,
    });
    assert.equal(token, null);
  });

  it("XFF falsifié http n’empêche pas la lecture Secure si AUTH_URL https", async () => {
    const { name, value } = await mintSessionCookie({ secure: true });
    const req = new Request("http://127.0.0.1:3000/api/workspace", {
      headers: {
        cookie: `${name}=${value}`,
        "x-forwarded-proto": "http",
      },
    });
    const secureCookie = resolveSecureSessionCookie({
      authUrl: "https://agent-client-01.naxialis.com",
      forwardedProto: req.headers.get("x-forwarded-proto"),
      requestProtocol: "http:",
      nodeEnv: "production",
    });
    assert.equal(secureCookie, true);
    const token = await getToken({ req, secret: SECRET, secureCookie });
    assert.ok(token);
  });

  it("salt aligné sur cookieName Secure (chunk / decode)", async () => {
    assert.equal(defaultCookies(true).sessionToken.name, SECURE_COOKIE);
    assert.equal(defaultCookies(false).sessionToken.name, PLAIN_COOKIE);
    const jwtSrc = read("node_modules/@auth/core/jwt.js");
    assert.match(jwtSrc, /salt = cookieName/);
    assert.match(jwtSrc, /secureCookie \?\? false/);
  });
});

describe("V7.16.4 OPS-03A — contrat middleware source", () => {
  it("passe secureCookie + nodeEnv à getToken ; pas d’appel nu", () => {
    const mw = read("middleware.ts");
    assert.match(mw, /resolveSecureSessionCookie/);
    assert.match(mw, /nodeEnv:\s*process\.env\.NODE_ENV/);
    assert.match(mw, /getToken\(\{[^}]*secureCookie[^}]*\}\)/s);
    assert.match(mw, /status: 401/);
    assert.match(mw, /\/api\/auth/);
    assert.match(mw, /google\/sync\/cron/);
    assert.match(mw, /health\/live/);
    assert.doesNotMatch(mw, /getToken\(\{\s*req,\s*secret\s*\}\)/);
  });

  it("AUTH-003 exceptions publiques préservées", () => {
    const mw = read("middleware.ts");
    for (const p of [
      "/api/auth",
      "/api/google/oauth/callback",
      "/api/google/sync/cron",
      "/api/health/live",
      "/api/health/ready",
    ]) {
      assert.match(mw, new RegExp(p.replace(/\//g, "\\/")));
    }
  });
});
