import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  diagnoseWordPressSeo,
  type DiagnoseFetch,
} from "../lib/wordpress-seo/diagnose";
import {
  YOAST_META_DESC_KEY,
  YOAST_META_TITLE_KEY,
} from "../lib/wordpress-seo";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const creds = {
  url: "https://wp.example.test",
  username: "editor",
  appPassword: "xxxx xxxx xxxx xxxx",
};

function mockFetch(handlers: {
  me?: () => Response;
  options?: () => Response;
  posts?: () => Response;
  onCall?: (url: string, init?: RequestInit) => void;
}): DiagnoseFetch {
  return async (url, init) => {
    handlers.onCall?.(url, init);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/users/me")) {
      return handlers.me?.() ?? jsonResponse(200, { capabilities: { edit_posts: true } });
    }
    if (method === "OPTIONS" && url.endsWith("/wp/v2/posts")) {
      return (
        handlers.options?.() ??
        jsonResponse(200, {
          schema: {
            properties: {
              meta: {
                properties: {
                  [YOAST_META_TITLE_KEY]: { type: "string" },
                  [YOAST_META_DESC_KEY]: { type: "string" },
                },
              },
            },
          },
        })
      );
    }
    if (method === "GET" && url.includes("/wp/v2/posts")) {
      return handlers.posts?.() ?? jsonResponse(200, []);
    }
    return jsonResponse(404, { code: "not_found" });
  };
}

describe("V7.8.2 — diagnostic SEO WordPress", () => {
  it("Yoast compatible lorsque le schéma expose les meta keys", async () => {
    const result = await diagnoseWordPressSeo("yoast_seo", creds, {
      fetchImpl: mockFetch({}),
      skipUrlSafetyCheck: true,
    });
    assert.equal(result.status, "compatible");
    assert.equal(result.restConnected, true);
    assert.equal(result.metaFieldsAccessible, true);
    assert.equal(result.writeValidated, false);
    assert.match(result.message, /Extension Yoast REST détectée/i);
    assert.equal(result.details.titleKeyPresent, true);
    assert.equal(result.details.descriptionKeyPresent, true);
  });

  it("Yoast incomplete si les champs REST sont absents", async () => {
    const result = await diagnoseWordPressSeo("yoast_seo", creds, {
      skipUrlSafetyCheck: true,
      fetchImpl: mockFetch({
        options: () =>
          jsonResponse(200, {
            schema: { properties: { meta: { properties: {} } } },
          }),
        posts: () => jsonResponse(200, [{ id: 1, meta: {} }]),
      }),
    });
    assert.equal(result.status, "incomplete");
    assert.equal(result.restConnected, true);
    assert.equal(result.metaFieldsAccessible, false);
    assert.match(result.message, /pas accessibles/i);
  });

  it("erreur d’authentification WordPress", async () => {
    const result = await diagnoseWordPressSeo("yoast_seo", creds, {
      skipUrlSafetyCheck: true,
      fetchImpl: mockFetch({
        me: () => jsonResponse(401, { code: "rest_not_logged_in" }),
      }),
    });
    assert.equal(result.status, "connection_error");
    assert.equal(result.restConnected, false);
    assert.match(result.message, /refusés/i);
  });

  it("permissions insuffisantes avec champs présents → incomplete", async () => {
    const result = await diagnoseWordPressSeo("yoast_seo", creds, {
      skipUrlSafetyCheck: true,
      fetchImpl: mockFetch({
        me: () =>
          jsonResponse(200, {
            capabilities: { read: true, edit_posts: false },
          }),
      }),
    });
    assert.equal(result.status, "incomplete");
    assert.equal(result.metaFieldsAccessible, true);
    assert.equal(result.editCapabilityDetected, false);
    assert.match(result.message, /permissions/i);
  });

  it("timeout réseau → connection_error", async () => {
    const result = await diagnoseWordPressSeo("yoast_seo", creds, {
      skipUrlSafetyCheck: true,
      fetchImpl: async () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      },
    });
    assert.equal(result.status, "connection_error");
    assert.match(result.message, /Délai dépassé|Impossible/i);
  });

  it("réponse WordPress malformée ne provoque pas d’état compatible", async () => {
    const result = await diagnoseWordPressSeo("yoast_seo", creds, {
      skipUrlSafetyCheck: true,
      fetchImpl: mockFetch({
        options: () => jsonResponse(200, { unexpected: true }),
        posts: () => jsonResponse(200, { not: "an-array" }),
      }),
    });
    assert.notEqual(result.status, "compatible");
    assert.equal(result.writeValidated, false);
  });

  it("aucune méthode d’écriture n’est appelée", async () => {
    const methods: string[] = [];
    await diagnoseWordPressSeo("yoast_seo", creds, {
      skipUrlSafetyCheck: true,
      fetchImpl: mockFetch({
        onCall: (_url, init) => {
          methods.push((init?.method ?? "GET").toUpperCase());
        },
      }),
    });
    assert.ok(methods.every((m) => m === "GET" || m === "OPTIONS"));
    assert.ok(!methods.includes("POST"));
    assert.ok(!methods.includes("PUT"));
    assert.ok(!methods.includes("PATCH"));
    assert.ok(!methods.includes("DELETE"));
  });

  it("Slim SEO reste diagnosticable sans exiger Yoast", async () => {
    const result = await diagnoseWordPressSeo("slim_seo", creds, {
      skipUrlSafetyCheck: true,
      fetchImpl: mockFetch({
        options: () =>
          jsonResponse(200, {
            schema: {
              properties: {
                meta: { properties: { slim_seo: { type: "object" } } },
              },
            },
          }),
      }),
    });
    assert.equal(result.status, "compatible");
    assert.equal(result.plugin, "slim_seo");
    assert.match(result.message, /Slim SEO/i);
  });

  it("route check protégée Auth.js, sans OpenAI ni écriture", () => {
    const route = read("app/api/settings/seo-plugin/check/route.ts");
    assert.match(route, /requireAuth/);
    assert.match(route, /diagnoseWordPressSeo/);
    assert.doesNotMatch(route, /openai|OpenAI|createWordPressDraft/i);
    assert.doesNotMatch(route, /method:\s*["']POST["']/);
  });

  it("UI remplace l’avertissement statique par un diagnostic", () => {
    const ui = read("components/settings/SeoPluginSettingsSection.tsx");
    assert.match(ui, /Vérifier la connexion SEO/);
    assert.match(ui, /\/api\/settings\/seo-plugin\/check/);
    assert.match(ui, /compatible|incomplete|connection_error/);
    assert.doesNotMatch(
      ui,
      /Yoast SEO nécessite l’extension WordPress « Naxialis Yoast REST Meta » pour exposer les champs en écriture REST\. Validez d’abord sur un site de test/
    );
  });

  it("garde-fous API settings incluent la route check", () => {
    const guards = read("tests/app-settings-api-guards.test.ts");
    // La route check doit exiger requireAuth — vérifié ici aussi.
    const route = read("app/api/settings/seo-plugin/check/route.ts");
    assert.match(route, /requireAuth/);
    assert.doesNotMatch(route, /NEXT_PUBLIC_/);
    assert.ok(guards.includes("seo-plugin/route.ts"));
  });

  it("non-régression adaptateurs Slim / Yoast", () => {
    const slim = read("lib/wordpress-seo/slim-seo.ts");
    const yoast = read("lib/wordpress-seo/yoast-seo.ts");
    assert.match(slim, /slim_seo/);
    assert.match(yoast, /_yoast_wpseo_title/);
    assert.match(yoast, /_yoast_wpseo_metadesc/);
  });

  it("procédure d’écriture documentée, non branchée à l’UI", () => {
    const writeDoc = read(
      "wordpress-extensions/naxialis-yoast-rest-meta/WRITE-TEST.md"
    );
    assert.match(writeDoc, /brouillon/i);
    assert.match(writeDoc, /context=edit/);
    assert.match(writeDoc, /Ne pas/);
    const ui = read("components/settings/SeoPluginSettingsSection.tsx");
    assert.doesNotMatch(ui, /WRITE-TEST|écrire.*meta|test d’écriture/i);
  });
});
