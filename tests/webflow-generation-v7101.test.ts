import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  buildWebflowFieldData,
  createWebflowClient,
  createWebflowCollectionDraft,
  validateWebflowDraftPayload,
  WEBFLOW_REQUIRED_EDITORIAL_FIELDS,
  type WebflowFieldMapping,
} from "../lib/webflow";
import { WebflowApiError } from "../lib/webflow/errors";
import {
  CREATE_WEBFLOW_DRAFT_TOOL_NAME,
  createWebflowDraftToolDefinition,
} from "../lib/agent/webflow-draft-tool";
import {
  getAgentToolsForDestination,
  getEditorialAgentProfile,
} from "../lib/agent/registry";
import { CREATE_WORDPRESS_DRAFT_TOOL_NAME } from "../lib/agent/tools";
import {
  isCmsDestinationEnabled,
  parseCmsDestinationInput,
} from "../lib/cms";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function sampleMapping(): WebflowFieldMapping {
  return {
    title: { fieldId: "1", fieldSlug: "name", fieldType: "PlainText" },
    slug: { fieldId: "2", fieldSlug: "slug", fieldType: "PlainText" },
    content: {
      fieldId: "3",
      fieldSlug: "article-body",
      fieldType: "RichText",
    },
    excerpt: { fieldId: "4", fieldSlug: "summary", fieldType: "PlainText" },
    meta_title: {
      fieldId: "5",
      fieldSlug: "seo-title",
      fieldType: "PlainText",
    },
    meta_description: {
      fieldId: "6",
      fieldSlug: "seo-description",
      fieldType: "PlainText",
    },
    reading_time: {
      fieldId: "7",
      fieldSlug: "reading-time",
      fieldType: "Number",
    },
  };
}

const validPayload = {
  title: "Guide IA pour PME",
  content: "<h2>Introduction</h2><p>Contenu utile pour les équipes.</p><h3>Suite</h3><p>Détails.</p>",
  excerpt: "Résumé court",
  slug: "guide-ia-pme",
  meta_title: "Guide IA PME",
  meta_description: "Description SEO du guide",
};

describe("V7.10.1 — génération Webflow brouillon", () => {
  it("destination Webflow activée dans le catalogue", () => {
    assert.equal(isCmsDestinationEnabled("webflow"), true);
    assert.equal(parseCmsDestinationInput("webflow").ok, true);
    assert.deepEqual(parseCmsDestinationInput(undefined), {
      ok: true,
      destination: "wordpress",
    });
  });

  it("résout les outils Webflow sans create_wordpress_draft", () => {
    const profile = getEditorialAgentProfile("webflow");
    assert.ok(profile.allowedToolNames.includes(CREATE_WEBFLOW_DRAFT_TOOL_NAME));
    assert.ok(
      !profile.allowedToolNames.includes(CREATE_WORDPRESS_DRAFT_TOOL_NAME)
    );

    const tools = getAgentToolsForDestination("webflow");
    assert.equal(tools.length, 2);
    assert.ok(tools.some((tool) => tool.type === "web_search"));
    assert.ok(
      tools.some(
        (tool) =>
          tool.type === "function" &&
          tool.name === CREATE_WEBFLOW_DRAFT_TOOL_NAME
      )
    );
    assert.ok(
      !tools.some(
        (tool) =>
          tool.type === "function" &&
          tool.name === CREATE_WORDPRESS_DRAFT_TOOL_NAME
      )
    );
    assert.equal(
      createWebflowDraftToolDefinition.name,
      CREATE_WEBFLOW_DRAFT_TOOL_NAME
    );
  });

  it("mappe les six champs obligatoires via fieldSlug dynamiques", () => {
    assert.equal(WEBFLOW_REQUIRED_EDITORIAL_FIELDS.length, 6);
    const fieldData = buildWebflowFieldData(validPayload, sampleMapping());
    assert.equal(fieldData.name, validPayload.title);
    assert.equal(fieldData.slug, validPayload.slug);
    assert.equal(fieldData["article-body"], validPayload.content);
    assert.equal(fieldData.summary, validPayload.excerpt);
    assert.equal(fieldData["seo-title"], validPayload.meta_title);
    assert.equal(fieldData["seo-description"], validPayload.meta_description);
    assert.equal(typeof fieldData["reading-time"], "number");
    // Pas d’image / catégorie / auteur inventés.
    assert.equal(fieldData["cover-image"], undefined);
    assert.equal(fieldData.category, undefined);
    assert.equal(fieldData.author, undefined);
  });

  it("valide le HTML Rich Text (H1, scripts, styles, structure)", () => {
    assert.equal(validateWebflowDraftPayload(validPayload).length, 0);
    assert.ok(
      validateWebflowDraftPayload({
        ...validPayload,
        content: "<h1>Titre</h1><p>x</p>",
      }).some((issue) => issue.code === "has_h1")
    );
    assert.ok(
      validateWebflowDraftPayload({
        ...validPayload,
        content: '<h2>A</h2><p style="color:red">x</p>',
      }).some((issue) => issue.code === "inline_style")
    );
    assert.ok(
      validateWebflowDraftPayload({
        ...validPayload,
        content: "<h2>A</h2><script>alert(1)</script>",
      }).some((issue) => issue.code === "dangerous_html")
    );
  });

  it("crée un item avec isDraft true et refuse live/publish", async () => {
    await assert.rejects(
      () =>
        createWebflowClient({ apiToken: "wf_test_token_ok" }).request({
          method: "POST",
          path: "/collections/x/items/live",
          body: { isDraft: true, isArchived: false, fieldData: {} },
        }),
      /live|publish|interdits/i
    );

    let postedBody: Record<string, unknown> | null = null;
    const fetchImpl: typeof fetch = async (_input, init) => {
      postedBody = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      return new Response(
        JSON.stringify({
          id: "item-abc",
          isDraft: true,
          isArchived: false,
          fieldData: postedBody.fieldData,
        }),
        { status: 202, headers: { "Content-Type": "application/json" } }
      );
    };

    // Première requête GET items (anti-doublon) → vide
    let call = 0;
    const fetchWithList: typeof fetch = async (input, init) => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      return fetchImpl(input, init);
    };

    const created = await createWebflowCollectionDraft({
      client: createWebflowClient({
        apiToken: "wf_test_token_ok",
        fetchImpl: fetchWithList,
      }),
      collectionId: "col-1",
      mapping: sampleMapping(),
      input: validPayload,
    });

    assert.equal(created.itemId, "item-abc");
    assert.equal(created.isDraft, true);
    assert.equal(postedBody?.isDraft, true);
    assert.equal(postedBody?.isArchived, false);
  });

  it("prévention doublons : refuse si slug déjà présent", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: "existing-1",
              fieldData: { slug: validPayload.slug },
            },
          ],
        }),
        { status: 200 }
      );

    await assert.rejects(
      () =>
        createWebflowCollectionDraft({
          client: createWebflowClient({
            apiToken: "wf_test_token_ok",
            fetchImpl,
          }),
          collectionId: "col-1",
          mapping: sampleMapping(),
          input: validPayload,
        }),
      (error: unknown) =>
        error instanceof WebflowApiError &&
        /existe déjà/i.test(error.message)
    );
  });

  it("session / génération / API gardent WordPress et isolent Webflow", () => {
    const run = read("lib/agent/run-session.ts");
    assert.match(run, /CREATE_WEBFLOW_DRAFT_TOOL_NAME/);
    assert.match(run, /getWebflowGenerationReadiness/);
    assert.match(run, /tool_not_allowed_for_cms/);
    assert.match(run, /cmsDestination !== "wordpress"/);
    assert.match(run, /cmsDestination !== "webflow"/);
    assert.match(run, /buildArticlePrompt\([\s\S]*cmsDestination/);

    const generation = read("lib/generation.ts");
    assert.match(generation, /isWebflow/);
    assert.match(generation, /wpPostId: isWebflow \? null/);
    assert.match(generation, /cmsExternalId: result\.cms\.externalId/);

    const route = read("app/api/generate/route.ts");
    assert.match(route, /getWebflowGenerationReadiness/);
    assert.match(route, /image à la une n’est pas disponible/i);

    const wordpress = read("lib/wordpress.ts");
    assert.match(wordpress, /status:\s*"draft"/);
    assert.doesNotMatch(wordpress, /status:\s*"publish"/);
  });

  it("UI destinations et historique exposent Webflow sans URL inventée", () => {
    const destinations = read("app/api/cms/destinations/route.ts");
    assert.match(destinations, /selectable/);
    assert.match(destinations, /webflowReadiness/);

    const picker = read("components/cms/CmsDestinationPicker.tsx");
    assert.match(picker, /selectable/);
    assert.doesNotMatch(picker, /génération d’items non activée/i);

    const progress = read("components/GenerationProgress.tsx");
    assert.match(progress, /getGenerationTimelineSteps/);
    assert.match(progress, /cmsExternalId/);
    assert.doesNotMatch(progress, /webflow\.com\/design/);

    const detail = read("app/(protected)/articles/[id]/page.tsx");
    assert.match(detail, /isWebflow/);
    assert.match(detail, /cmsExternalId/);
  });

  it("non-régression outils WordPress historiques", () => {
    const wpTools = getAgentToolsForDestination("wordpress");
    assert.ok(
      wpTools.some(
        (tool) =>
          tool.type === "function" &&
          tool.name === CREATE_WORDPRESS_DRAFT_TOOL_NAME
      )
    );
    assert.ok(
      !wpTools.some(
        (tool) =>
          tool.type === "function" &&
          tool.name === CREATE_WEBFLOW_DRAFT_TOOL_NAME
      )
    );
  });

  it("tests automatisés n’appellent pas l’API réelle (fetch mock)", () => {
    const source = read("tests/webflow-generation-v7101.test.ts");
    assert.match(source, /fetchImpl/);
    assert.doesNotMatch(source, /api\.webflow\.com/);
  });
});
