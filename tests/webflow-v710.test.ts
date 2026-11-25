import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  assertWebflowAllowedRequest,
  assertWebflowReadOnlyPath,
  createWebflowClient,
  mapWebflowHttpStatus,
  parseWebflowFieldMappingJson,
  serializeWebflowFieldMapping,
  validateWebflowFieldMapping,
  WebflowApiError,
  WEBFLOW_REQUIRED_EDITORIAL_FIELDS,
  type WebflowCollectionField,
} from "../lib/webflow";
import { listWebflowSites } from "../lib/webflow/sites";
import { listWebflowCollections } from "../lib/webflow/collections";
import { testWebflowConnection } from "../lib/webflow/connection-test";
import {
  CREATE_WEBFLOW_DRAFT_REQUIRED_PARAMS,
  CREATE_WEBFLOW_DRAFT_TOOL_NAME,
  createWebflowDraftToolDefinition,
} from "../lib/agent/webflow-draft-tool";
import { getCmsConnector, parseCmsDestinationInput } from "../lib/cms";
import { getAgentToolsForDestination } from "../lib/agent/registry";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function sampleFields(): WebflowCollectionField[] {
  return [
    {
      id: "f-name",
      displayName: "Name",
      slug: "name",
      type: "PlainText",
      isRequired: true,
      isEditable: true,
    },
    {
      id: "f-slug",
      displayName: "Slug",
      slug: "slug",
      type: "PlainText",
      isRequired: true,
      isEditable: true,
    },
    {
      id: "f-body",
      displayName: "Body",
      slug: "post-body",
      type: "RichText",
      isRequired: true,
      isEditable: true,
    },
    {
      id: "f-summary",
      displayName: "Summary",
      slug: "summary",
      type: "PlainText",
      isRequired: false,
      isEditable: true,
    },
    {
      id: "f-seo-title",
      displayName: "SEO Title",
      slug: "seo-title",
      type: "PlainText",
      isRequired: false,
      isEditable: true,
    },
    {
      id: "f-seo-desc",
      displayName: "SEO Desc",
      slug: "seo-desc",
      type: "PlainText",
      isRequired: false,
      isEditable: true,
    },
    {
      id: "f-hero",
      displayName: "Hero",
      slug: "hero-image",
      type: "Image",
      isRequired: false,
      isEditable: true,
    },
  ];
}

describe("V7.10.0 — Webflow Data API lecture seule", () => {
  it("mappe les erreurs HTTP 401/403/404/429/5xx", () => {
    assert.equal(mapWebflowHttpStatus(401, null).code, "unauthorized");
    assert.equal(mapWebflowHttpStatus(403, null).code, "forbidden");
    assert.equal(mapWebflowHttpStatus(404, null).code, "not_found");
    assert.equal(mapWebflowHttpStatus(429, "12").code, "rate_limited");
    assert.equal(mapWebflowHttpStatus(429, "12").retryAfterSeconds, 12);
    assert.equal(mapWebflowHttpStatus(503, null).code, "server_error");
  });

  it("refuse live/publish ; autorise GET et POST items brouillon", () => {
    assert.throws(
      () => assertWebflowAllowedRequest("POST", "/sites/x/publish"),
      /live|publish|interdits|autorisés/i
    );
    assert.throws(
      () => assertWebflowAllowedRequest("POST", "/collections/x/items/live"),
      /live|publish|interdits/i
    );
    assert.throws(
      () => assertWebflowAllowedRequest("POST", "/sites"),
      /autorisé/i
    );
    assert.doesNotThrow(() =>
      assertWebflowAllowedRequest("POST", "/sites/x/assets")
    );
    assert.doesNotThrow(() =>
      assertWebflowAllowedRequest("PATCH", "/collections/x/items/y")
    );
    assert.doesNotThrow(() => assertWebflowAllowedRequest("GET", "/sites"));
    assert.doesNotThrow(() =>
      assertWebflowAllowedRequest("GET", "/collections/abc")
    );
    assert.doesNotThrow(() =>
      assertWebflowAllowedRequest("POST", "/collections/x/items")
    );
    // Alias lecture seule : GET toujours OK
    assert.doesNotThrow(() => assertWebflowReadOnlyPath("/sites"));
  });

  it("authentifie et liste les sites via GET /sites", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          sites: [
            { id: "site-1", displayName: "Demo", shortName: "demo" },
            { id: "site-2", displayName: "Blog", shortName: "blog" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const client = createWebflowClient({
      apiToken: "wf_test_token_ok",
      fetchImpl,
    });
    const sites = await listWebflowSites(client);
    assert.equal(sites.length, 2);
    assert.equal(sites[0].id, "site-1");
    assert.match(calls[0] ?? "", /\/v2\/sites$/);

    const authFail: typeof fetch = async () =>
      new Response("{}", { status: 401 });
    await assert.rejects(
      () =>
        listWebflowSites(
          createWebflowClient({
            apiToken: "wf_bad_token_long_enough",
            fetchImpl: authFail,
          })
        ),
      (error: unknown) =>
        error instanceof WebflowApiError && error.code === "unauthorized"
    );
  });

  it("récupère les collections d’un site", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          collections: [
            {
              id: "col-1",
              displayName: "Posts",
              singularName: "Post",
              slug: "post",
            },
          ],
        }),
        { status: 200 }
      );
    const collections = await listWebflowCollections(
      createWebflowClient({ apiToken: "wf_test_token_ok", fetchImpl }),
      "site-1"
    );
    assert.equal(collections.length, 1);
    assert.equal(collections[0].slug, "post");
  });

  it("valide le mapping obligatoire et les types", () => {
    const fields = sampleFields();
    const incomplete = validateWebflowFieldMapping({}, fields);
    assert.equal(incomplete.ok, false);
    assert.ok(
      incomplete.issues.some((issue) => issue.code === "missing_required")
    );
    assert.ok(
      incomplete.issues.some(
        (issue) => issue.code === "required_collection_field_unmapped"
      )
    );

    const typeMismatch = validateWebflowFieldMapping(
      {
        title: { fieldId: "f-name" },
        slug: { fieldId: "f-slug" },
        content: { fieldId: "f-summary" },
        excerpt: { fieldId: "f-summary" },
        meta_title: { fieldId: "f-seo-title" },
        meta_description: { fieldId: "f-seo-desc" },
      },
      fields
    );
    assert.equal(typeMismatch.ok, false);
    assert.ok(
      typeMismatch.issues.some(
        (issue) =>
          issue.code === "type_mismatch" && issue.editorialField === "content"
      )
    );

    const ok = validateWebflowFieldMapping(
      {
        title: { fieldId: "f-name" },
        slug: { fieldId: "f-slug" },
        content: { fieldId: "f-body" },
        excerpt: { fieldId: "f-summary" },
        meta_title: { fieldId: "f-seo-title" },
        meta_description: { fieldId: "f-seo-desc" },
        featured_image: { fieldId: "f-hero" },
      },
      fields
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.issues.length, 0);
    assert.equal(WEBFLOW_REQUIRED_EDITORIAL_FIELDS.length, 6);
  });

  it("sérialise le mapping sans perdre les fieldId (slugs variables)", () => {
    const mapping = {
      title: { fieldId: "f-name", fieldSlug: "custom-title" },
      slug: { fieldId: "f-slug", fieldSlug: "url-path" },
    };
    const json = serializeWebflowFieldMapping(mapping);
    const parsed = parseWebflowFieldMappingJson(json);
    assert.equal(parsed.title?.fieldId, "f-name");
    assert.equal(parsed.title?.fieldSlug, "custom-title");
    assert.equal(parsed.slug?.fieldSlug, "url-path");
  });

  it("test de connexion remonte 429 sans exposer le token", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("{}", {
        status: 429,
        headers: { "retry-after": "30" },
      });
    const result = await testWebflowConnection({
      apiToken: "super-secret-token-value",
      fetchImpl,
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /débit|429|Réessayez/i);
    assert.doesNotMatch(result.message, /super-secret-token-value/);
    assert.equal(JSON.stringify(result).includes("super-secret-token-value"), false);
  });

  it("create_webflow_draft est branché pour l’agent Webflow (V7.10.1)", () => {
    assert.equal(CREATE_WEBFLOW_DRAFT_TOOL_NAME, "create_webflow_draft");
    assert.deepEqual(
      [...CREATE_WEBFLOW_DRAFT_REQUIRED_PARAMS].sort(),
      [
        "content",
        "excerpt",
        "meta_description",
        "meta_title",
        "slug",
        "title",
      ].sort()
    );
    assert.equal(createWebflowDraftToolDefinition.type, "function");

    const tools = getAgentToolsForDestination("webflow");
    assert.ok(
      tools.some(
        (tool) =>
          tool.type === "function" &&
          tool.name === CREATE_WEBFLOW_DRAFT_TOOL_NAME
      )
    );
  });

  it("accepte la destination Webflow au catalogue (readiness runtime séparée)", () => {
    const parsed = parseCmsDestinationInput("webflow");
    assert.equal(parsed.ok, true);
    const connector = getCmsConnector("webflow");
    assert.equal(connector.id, "webflow");
  });

  it("routes Webflow protégées et sans secrets journalisés", () => {
    const routes = [
      "app/api/settings/webflow/route.ts",
      "app/api/settings/webflow/test/route.ts",
      "app/api/settings/webflow/sites/route.ts",
      "app/api/settings/webflow/collections/route.ts",
      "app/api/settings/webflow/collections/[collectionId]/fields/route.ts",
      "app/api/settings/webflow/mapping/validate/route.ts",
      "app/api/cms/webflow/test/route.ts",
    ];
    for (const route of routes) {
      const source = read(route);
      assert.match(source, /requireAuth/, route);
      assert.doesNotMatch(source, /NEXT_PUBLIC_/, route);
      assert.doesNotMatch(source, /logInfo\([^)]*apiToken|logError\([^)]*apiToken/);
    }
  });

  it("AppSettings et UI n’exposent pas le token", () => {
    const settings = read("lib/settings/app-settings.ts");
    assert.match(settings, /apiTokenConfigured/);
    assert.match(settings, /webflowApiTokenEncrypted/);
    assert.match(settings, /openaiWebflowAgentId/);
    assert.doesNotMatch(
      settings,
      /webflow:\s*\{[^}]*apiToken:\s*webflow\.apiToken/
    );

    const panel = read("components/cms/WebflowConfigPanel.tsx");
    assert.match(panel, /Configurer Webflow/);
    assert.match(panel, /Tester la connexion/);
    assert.match(panel, /Enregistrer/);
    assert.match(panel, /type="password"/);
    assert.doesNotMatch(panel, /initial\.apiToken\b/);

    const integrations = read("components/cms/CmsIntegrationsPanel.tsx");
    assert.match(integrations, /WebflowConfigPanel/);
  });

  it("migration additive Webflow sans GEO drop", () => {
    const migration = read(
      "prisma/migrations/20261124190000_app_settings_webflow_v710/migration.sql"
    );
    assert.match(migration, /openaiWebflowAgentId/);
    assert.match(migration, /webflowApiTokenEncrypted/);
    assert.match(migration, /webflowFieldMappingJson/);
    assert.doesNotMatch(migration, /DROP TABLE|drop_ai_visibility/i);

    const schema = read("prisma/schema.prisma");
    assert.match(schema, /webflowSiteId/);
    assert.match(schema, /webflowCollectionId/);
    assert.doesNotMatch(schema, /drop_ai_visibility/i);

    // La migration historique interdite peut exister hors chaîne active ;
    // V7.10.0 ne doit ni la réintroduire ni y référencer un DROP GEO.
    const v710Sql = read(
      "prisma/migrations/20261124190000_app_settings_webflow_v710/migration.sql"
    );
    assert.doesNotMatch(v710Sql, /AiVisibility|DROP TABLE/i);
    const migrationNames = readdirSync(path.join(root, "prisma/migrations"));
    assert.ok(
      migrationNames.includes("20261124190000_app_settings_webflow_v710")
    );
  });

  it("non-régression WordPress draft + outils", () => {
    const wordpress = read("lib/wordpress.ts");
    assert.match(wordpress, /status:\s*"draft"/);
    assert.doesNotMatch(wordpress, /status:\s*"publish"/);
    const tools = read("lib/agent/tools.ts");
    assert.match(tools, /create_wordpress_draft/);
    assert.doesNotMatch(tools, /create_webflow_draft/);
  });

  it("client refuse POST hors création d’items / assets", async () => {
    const client = createWebflowClient({ apiToken: "wf_test_token_ok" });
    await assert.rejects(
      () => client.request({ method: "POST", path: "/sites" }),
      /autorisé/i
    );
    await assert.rejects(
      () =>
        client.request({
          method: "POST",
          path: "/collections/x/items/live",
          body: { isDraft: true, isArchived: false, fieldData: {} },
        }),
      /live|publish|interdits/i
    );
  });
});
