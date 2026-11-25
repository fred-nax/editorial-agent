/**
 * V7.13.0 — Images à la une Webflow (Assets + association brouillon staged).
 * Aucun appel OpenAI payant ni transfert Webflow réel.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  assertFeaturedImageFileForWebflow,
  assertTrustedWebflowUploadUrl,
  assertWebflowAllowedRequest,
  assertWebflowDraftItemForFeaturedImage,
  buildWebflowImageFieldValue,
  createWebflowClient,
  md5Hex,
  probeWebflowAssetsRead,
  resolveFeaturedImageFieldSlugs,
  WebflowApiError,
} from "../lib/webflow";
import { getArticleDetailTabs } from "../lib/article-detail-tabs";
import type { WebflowFieldMapping } from "../lib/webflow/types";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function sampleMapping(): WebflowFieldMapping {
  return {
    title: {
      fieldId: "f-name",
      fieldSlug: "name",
      fieldType: "PlainText",
    },
    slug: {
      fieldId: "f-slug",
      fieldSlug: "slug",
      fieldType: "PlainText",
    },
    body: {
      fieldId: "f-body",
      fieldSlug: "post-body",
      fieldType: "RichText",
    },
    featured_image: {
      fieldId: "f-hero",
      fieldSlug: "cover-image",
      fieldType: "Image",
    },
    alt_text: {
      fieldId: "f-alt",
      fieldSlug: "cover-image-alt",
      fieldType: "PlainText",
    },
  };
}

describe("V7.13.0 — Webflow featured image (unit)", () => {
  it("calcule le hash MD5 du fichier optimisé", () => {
    const bytes = Buffer.from("webp-bytes-fixture");
    assert.equal(
      md5Hex(bytes),
      createHash("md5").update(bytes).digest("hex")
    );
  });

  it("valide MIME / taille / nom avant métadonnées Assets", () => {
    const ok = Buffer.alloc(128, 1);
    assert.doesNotThrow(() =>
      assertFeaturedImageFileForWebflow({
        bytes: ok,
        mimeType: "image/webp",
        fileName: "hero.webp",
      })
    );
    assert.throws(
      () =>
        assertFeaturedImageFileForWebflow({
          bytes: Buffer.alloc(0),
          mimeType: "image/webp",
          fileName: "hero.webp",
        }),
      /vide/
    );
    assert.throws(
      () =>
        assertFeaturedImageFileForWebflow({
          bytes: ok,
          mimeType: "application/pdf",
          fileName: "hero.pdf",
        }),
      /MIME/
    );
    assert.throws(
      () =>
        assertFeaturedImageFileForWebflow({
          bytes: Buffer.alloc(5 * 1024 * 1024),
          mimeType: "image/webp",
          fileName: "big.webp",
        }),
      /volumineuse/
    );
  });

  it("refuse les URL d’upload arbitraires (navigateur / hors S3 Webflow)", () => {
    assert.throws(
      () => assertTrustedWebflowUploadUrl("http://evil.example/upload"),
      /HTTPS/
    );
    assert.throws(
      () => assertTrustedWebflowUploadUrl("https://evil.example/upload"),
      /non reconnue/
    );
    assert.doesNotThrow(() =>
      assertTrustedWebflowUploadUrl(
        "https://s3.amazonaws.com/webflow-uploads/bucket/key"
      )
    );
    assert.doesNotThrow(() =>
      assertTrustedWebflowUploadUrl(
        "https://uploads.webflow.com/path"
      )
    );
  });

  it("mapping dynamique image/ALT (pas de slugs en dur)", () => {
    const resolved = resolveFeaturedImageFieldSlugs(sampleMapping());
    assert.equal(resolved.imageSlug, "cover-image");
    assert.equal(resolved.altSlug, "cover-image-alt");
    assert.equal(resolved.imageType, "Image");

    const value = buildWebflowImageFieldValue({
      assetId: "asset-1",
      hostedUrl: "https://cdn.example/a.webp",
      altText: "Description ALT",
    });
    assert.deepEqual(value, {
      fileId: "asset-1",
      url: "https://cdn.example/a.webp",
      alt: "Description ALT",
    });

    assert.throws(
      () =>
        resolveFeaturedImageFieldSlugs({
          ...sampleMapping(),
          featured_image: {
            fieldId: "x",
            fieldSlug: "cover-image",
            fieldType: "PlainText",
          },
        }),
      /Image/
    );
  });

  it("refuse article publié ou archivé ; accepte brouillon", () => {
    assert.throws(
      () =>
        assertWebflowDraftItemForFeaturedImage(
          { id: "item-1", isDraft: false, isArchived: false },
          "item-1"
        ),
      /brouillons/
    );
    assert.throws(
      () =>
        assertWebflowDraftItemForFeaturedImage(
          { id: "item-1", isDraft: true, isArchived: true },
          "item-1"
        ),
      /archivé/
    );
    assert.doesNotThrow(() =>
      assertWebflowDraftItemForFeaturedImage(
        { id: "item-1", isDraft: true, isArchived: false },
        "item-1"
      )
    );
  });

  it("autorise POST assets + PATCH item ; interdit publish/live write", () => {
    assert.doesNotThrow(() =>
      assertWebflowAllowedRequest("POST", "/sites/site_x/assets")
    );
    assert.doesNotThrow(() =>
      assertWebflowAllowedRequest(
        "PATCH",
        "/collections/col_x/items/item_y"
      )
    );
    assert.throws(
      () =>
        assertWebflowAllowedRequest(
          "POST",
          "/collections/col_x/items/item_y/publish"
        ),
      /interdit/
    );
    assert.throws(
      () =>
        assertWebflowAllowedRequest(
          "PATCH",
          "/collections/col_x/items/item_y/live"
        ),
      /interdit/
    );
  });

  it("sonde assets:read sans créer d’asset ; 403 → message clair", async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/assets")) {
        return new Response(JSON.stringify({ message: "Forbidden" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    };
    const client = createWebflowClient({
      apiToken: "wf_test_token_xxxxxxxx",
      fetchImpl: fetchImpl as typeof fetch,
    });
    const probe = await probeWebflowAssetsRead(client, "site_abc");
    assert.equal(probe.ok, false);
    assert.match(probe.message, /assets:read/);
    assert.equal(calls.length, 1);
    assert.match(calls[0]!, /\/sites\/site_abc\/assets/);
    assert.doesNotMatch(calls.join("\n"), /method=POST/i);
  });

  it("mappe 401/403/429/5xx via WebflowApiError sur client Assets", async () => {
    for (const [status, code] of [
      [401, "unauthorized"],
      [403, "forbidden"],
      [429, "rate_limited"],
      [503, "server_error"],
    ] as const) {
      const client = createWebflowClient({
        apiToken: "wf_test_token_xxxxxxxx",
        fetchImpl: (async () =>
          new Response(JSON.stringify({ message: "err" }), {
            status,
            headers: {
              "content-type": "application/json",
              ...(status === 429 ? { "retry-after": "5" } : {}),
            },
          })) as typeof fetch,
      });
      await assert.rejects(
        () =>
          client.request({
            method: "POST",
            path: "/sites/site_x/assets",
            body: {
              fileName: "a.webp",
              fileHash: "abc",
              size: 10,
            },
          }),
        (error: unknown) => {
          assert.ok(error instanceof WebflowApiError);
          assert.equal(error.code, code);
          return true;
        }
      );
    }
  });

  it("crée métadonnées puis upload S3 simulé sans Authorization Webflow", async () => {
    const { uploadWebflowSiteAsset } = await import("../lib/webflow/assets");
    const bytes = Buffer.from("fake-webp-content");
    let sawAuthOnS3 = false;
    let metadataPosted = false;
    let s3Posted = false;

    const fetchImpl = (async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const url = String(input);
      if (url.includes("api.webflow.com") && url.includes("/assets")) {
        metadataPosted = true;
        assert.equal(init?.method ?? "GET", "POST");
        return new Response(
          JSON.stringify({
            id: "asset_sim_1",
            uploadUrl: "https://s3.amazonaws.com/wf-bucket/key",
            uploadDetails: { key: "value", "Content-Type": "image/webp" },
            hostedUrl: "https://cdn.prod.website-files.com/a.webp",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("s3.amazonaws.com")) {
        s3Posted = true;
        const headers = new Headers(init?.headers);
        if (headers.get("authorization") || headers.get("Authorization")) {
          sawAuthOnS3 = true;
        }
        return new Response("", { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    const client = createWebflowClient({
      apiToken: "wf_test_token_xxxxxxxx",
      fetchImpl,
    });
    const uploaded = await uploadWebflowSiteAsset({
      client,
      siteId: "site_sim",
      bytes,
      fileName: "hero.webp",
      mimeType: "image/webp",
      sizeLabel: "1536x1024",
      fetchImpl,
    });
    assert.equal(uploaded.assetId, "asset_sim_1");
    assert.match(uploaded.hostedUrl, /website-files/);
    assert.equal(uploaded.fileHash, md5Hex(bytes));
    assert.equal(metadataPosted, true);
    assert.equal(s3Posted, true);
    assert.equal(sawAuthOnS3, false);
  });

  it("onglet Image + Performances GSC pour Webflow (V7.14.0)", () => {
    assert.deepEqual(getArticleDetailTabs("webflow").map((t) => t.id), [
      "report",
      "article",
      "usage",
      "featured",
      "performances",
    ]);
    assert.equal(getArticleDetailTabs("wordpress").length, 5);
  });

  it("sources : pas de fallback WP dans upload Webflow ; reprise sans OpenAI", () => {
    const service = read("lib/images/service.ts");
    assert.match(service, /uploadFeaturedImageToWebflow/);
    assert.match(service, /association_failed/);
    assert.match(service, /assetId \? "ready" : "failed"/);
    assert.match(
      service,
      /[Nn]e jamais construire le prompt à partir des données WordPress/
    );
    assert.match(service, /if \(!isWebflowGeneration\(generation\)\)/);
    assert.doesNotMatch(
      service,
      /uploadFeaturedImageToWebflow[\s\S]{0,800}fetchWordPressPost/
    );

    const uploadRoute = read(
      "app/api/articles/[id]/featured-image/upload/route.ts"
    );
    assert.match(uploadRoute, /uploadFeaturedImageToWebflow/);
    assert.match(uploadRoute, /cmsProvider === "webflow"/);

    const generateRoute = read("app/api/generate/route.ts");
    assert.doesNotMatch(
      generateRoute,
      /n’est pas disponible pour les générations Webflow/
    );

    const panel = read("components/articles/FeaturedImagePanel.tsx");
    assert.match(panel, /Transférer vers Webflow/);
    assert.match(panel, /Reprendre l’association Webflow/);
    assert.match(panel, /uploadLockRef/);
    assert.match(panel, /frozenSiteId/);
    assert.match(panel, /Image associée au brouillon WordPress/);

    const form = read("components/ArticleForm.tsx");
    assert.doesNotMatch(form, /Non disponible pour Webflow dans cette version/);
    assert.match(form, /transfert\s+Assets Webflow/i);

    const client = read("lib/webflow/client.ts");
    assert.doesNotMatch(client, /method === "POST".*\/publish/i);
    assert.match(client, /SITE_ASSETS_PATH/);

    const migration = read(
      "prisma/migrations/20261125160000_featured_image_webflow_v7130/migration.sql"
    );
    assert.match(migration, /webflowAssetId/);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS/);
    assert.doesNotMatch(migration, /DROP /i);

    const schema = read("prisma/schema.prisma");
    assert.match(schema, /webflowAssetId/);
    assert.match(schema, /cmsTransferStatus/);
    assert.match(schema, /wpMediaId/);
  });

  it("protection module featured_image + readiness Assets", () => {
    const protection = read("lib/workspace/protection.ts");
    assert.match(protection, /featured_image/);
    assert.match(protection, /assets:write/);

    const readiness = read("lib/webflow/featured-image-readiness.ts");
    assert.match(readiness, /getWebflowFeaturedImageReadiness/);
    assert.match(readiness, /probeWebflowAssetsRead/);
    assert.match(readiness, /token valide/);

    const destinations = read("app/api/cms/destinations/route.ts");
    assert.match(destinations, /webflowFeaturedImages/);
    assert.match(destinations, /assets:read\/assets:write/);
  });
});
