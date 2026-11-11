import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, mock } from "node:test";
import { readFileSync } from "node:fs";
import {
  FEATURED_IMAGE_ASPECTS,
  FEATURED_IMAGE_MODEL,
  FEATURED_IMAGE_OUTPUT_FORMAT,
  FEATURED_IMAGE_QUALITY,
  FEATURED_IMAGE_STYLES,
  isFeaturedImageAspectId,
  isFeaturedImageStyleId,
  sizeForAspect,
} from "../lib/images/config";
import {
  releaseFeaturedImageLock,
  tryAcquireFeaturedImageLock,
  tryAcquireImageGenerationSlot,
  releaseImageGenerationSlot,
} from "../lib/images/locks";
import { buildFeaturedImagePrompt } from "../lib/images/prompt";
import {
  buildFeaturedImageRelativePath,
  resolveFeaturedImageAbsolutePath,
  writeFeaturedImageFile,
  readFeaturedImageFile,
} from "../lib/images/storage";

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

describe("featured image — config & prompt", () => {
  it("expose le modèle image et les formats attendus", () => {
    assert.equal(FEATURED_IMAGE_MODEL, "gpt-image-2.5-flare");
    assert.equal(FEATURED_IMAGE_OUTPUT_FORMAT, "webp");
    assert.equal(FEATURED_IMAGE_QUALITY, "medium");
    assert.equal(sizeForAspect("3:2"), "1536x1024");
    assert.equal(sizeForAspect("16:9"), "1536x864");
    assert.equal(isFeaturedImageStyleId("photographic"), true);
    assert.equal(isFeaturedImageStyleId("unknown"), false);
    assert.equal(isFeaturedImageAspectId("16:9"), true);
    assert.equal(FEATURED_IMAGE_STYLES.length, 5);
    assert.equal(FEATURED_IMAGE_ASPECTS.length, 2);
  });

  it("construit un prompt avec titre, sujet, extrait, angle et langue", () => {
    const prompt = buildFeaturedImagePrompt({
      title: "Guide PME",
      subject: "Automatiser la rédaction",
      excerpt: "Gagner du temps éditorial",
      angle: "Cas concrets",
      languageLabel: "Français",
      style: "photographic",
      visualInstructions: "Bureau moderne, lumière naturelle",
    });
    assert.match(prompt, /Guide PME/);
    assert.match(prompt, /Automatiser la rédaction/);
    assert.match(prompt, /Gagner du temps éditorial/);
    assert.match(prompt, /Cas concrets/);
    assert.match(prompt, /Français/);
    assert.match(prompt, /Bureau moderne/);
    assert.match(prompt, /Aucun texte incrusté/);
    assert.doesNotMatch(prompt, /<html/i);
    assert.doesNotMatch(prompt, /OPENAI_API_KEY/);
  });

  it("n’exige pas le HTML de l’article", () => {
    const prompt = buildFeaturedImagePrompt({
      title: null,
      subject: "Sujet seul",
      excerpt: null,
      angle: null,
      languageLabel: null,
      style: "minimal",
      visualInstructions: null,
    });
    assert.match(prompt, /Sujet seul/);
    assert.match(prompt, /minimaliste/i);
  });
});

describe("featured image — storage", () => {
  it("refuse les chemins arbitraires", () => {
    assert.throws(() => resolveFeaturedImageAbsolutePath("../secret.webp"));
    assert.throws(() => resolveFeaturedImageAbsolutePath("/etc/passwd"));
    assert.throws(() =>
      buildFeaturedImageRelativePath("../x", "abc", "webp")
    );
  });

  it("écrit et relit un fichier sous le répertoire configuré", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "featured-"));
    const previous = process.env.FEATURED_IMAGE_STORAGE_DIR;
    process.env.FEATURED_IMAGE_STORAGE_DIR = dir;
    try {
      const relative = buildFeaturedImageRelativePath(
        "clxxxxxxxx000000000000001",
        "clxxxxxxxx000000000000002"
      );
      const payload = Buffer.from("webp-bytes");
      await writeFeaturedImageFile(relative, payload);
      const read = await readFeaturedImageFile(relative);
      assert.deepEqual(read, payload);
      const absolute = resolveFeaturedImageAbsolutePath(relative);
      assert.equal(await readFile(absolute, "utf8"), "webp-bytes");
    } finally {
      if (previous === undefined) {
        delete process.env.FEATURED_IMAGE_STORAGE_DIR;
      } else {
        process.env.FEATURED_IMAGE_STORAGE_DIR = previous;
      }
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("featured image — locks", () => {
  it("empêche les doubles opérations concurrentes", () => {
    const key = `test-${Date.now()}`;
    assert.equal(tryAcquireFeaturedImageLock(key), true);
    assert.equal(tryAcquireFeaturedImageLock(key), false);
    releaseFeaturedImageLock(key);
    assert.equal(tryAcquireFeaturedImageLock(key), true);
    releaseFeaturedImageLock(key);
  });

  it("limite les slots de génération OpenAI", () => {
    while (tryAcquireImageGenerationSlot()) {
      // drain up to cap
    }
    assert.equal(tryAcquireImageGenerationSlot(), false);
    releaseImageGenerationSlot();
    assert.equal(tryAcquireImageGenerationSlot(), true);
    releaseImageGenerationSlot();
    releaseImageGenerationSlot();
    releaseImageGenerationSlot();
  });
});

describe("featured image — WordPress media helpers", () => {
  it("téléverse, pose l’ALT et associe sans publier", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = mock.method(globalThis, "fetch", async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("/wp-json/wp/v2/media") && !url.match(/media\/\d+/)) {
        return new Response(
          JSON.stringify({
            id: 77,
            source_url: "https://example.test/media/77.webp",
            alt_text: "",
            mime_type: "image/webp",
          }),
          { status: 201 }
        );
      }
      if (url.includes("/wp-json/wp/v2/media/77")) {
        return new Response(JSON.stringify({ id: 77, alt_text: "ALT" }), {
          status: 200,
        });
      }
      if (url.includes("/wp-json/wp/v2/posts/12")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        assert.equal(body.status, undefined);
        return new Response(
          JSON.stringify({
            id: 12,
            status: "draft",
            featured_media: body.featured_media ?? 0,
            link: "https://example.test/?p=12",
          }),
          { status: 200 }
        );
      }
      return new Response("{}", { status: 404 });
    });

    try {
      const {
        uploadWordPressMedia,
        setWordPressFeaturedMedia,
        fetchWordPressPost,
      } = await import("../lib/wordpress-media");

      const media = await uploadWordPressMedia({
        bytes: Buffer.from("fake"),
        filename: "x.webp",
        mimeType: "image/webp",
        altText: "Bureau lumineux",
      });
      assert.equal(media.id, 77);

      const post = await setWordPressFeaturedMedia(12, 77);
      assert.equal(post.status, "draft");
      assert.equal(post.featured_media, 77);

      const verified = await fetchWordPressPost(12);
      assert.equal(verified.status, "draft");

      assert.ok(calls.some((call) => call.url.includes("/media")));
      assert.ok(
        calls.every((call) => {
          if (!call.init?.body || typeof call.init.body !== "string") {
            return true;
          }
          return !call.init.body.includes('"publish"');
        })
      );
    } finally {
      fetchMock.mock.restore();
    }
  });

  it("refuse silencieusement de publier via featured media helpers", () => {
    const source = readSource("lib/wordpress-media.ts");
    assert.doesNotMatch(source, /status:\s*["']publish["']/);
    assert.match(source, /featured_media/);
    assert.match(source, /alt_text/);
  });
});

describe("featured image — intégration projet", () => {
  it("n’altère pas le tool create_wordpress_draft ni les instructions agent", () => {
    assert.match(readSource("lib/agent/tools.ts"), /create_wordpress_draft/);
    assert.match(readSource("lib/wordpress.ts"), /status:\s*"draft"/);
    assert.doesNotMatch(readSource("lib/wordpress.ts"), /featured_media/);
  });

  it("expose les routes API authentifiées", () => {
    for (const file of [
      "app/api/articles/[id]/featured-image/route.ts",
      "app/api/articles/[id]/featured-image/generate/route.ts",
      "app/api/articles/[id]/featured-image/upload/route.ts",
      "app/api/articles/[id]/featured-image/file/route.ts",
    ]) {
      const source = readSource(file);
      assert.match(source, /requireAuth/);
    }
  });

  it("le panneau UI ne génère pas au rendu et vit dans l’onglet", () => {
    const panel = readSource("components/articles/FeaturedImagePanel.tsx");
    assert.doesNotMatch(panel, /useEffect\([\s\S]*generate/);
    assert.match(panel, /régénération crée une nouvelle image/i);
    assert.match(panel, /Aucune image/);
    assert.match(panel, /Génération de l’image en cours/);
    assert.match(panel, /Transfert en cours/);
    assert.match(panel, /Image associée au brouillon WordPress/);
    assert.match(panel, /Image prête à valider/);
    const page = readSource("app/(protected)/articles/[id]/page.tsx");
    assert.match(page, /FeaturedImagePanel/);
    assert.match(page, /canManageFeaturedImage/);
    assert.match(page, /featured=\{/);
    const tabs = readSource("components/ArticleDetailTabs.tsx");
    assert.match(tabs, /hidden=\{active !== tab\.id\}/);
  });

  it("le schéma Prisma ajoute ArticleFeaturedImage de façon additive", () => {
    const schema = readSource("prisma/schema.prisma");
    assert.match(schema, /model ArticleFeaturedImage/);
    assert.match(schema, /featuredImages ArticleFeaturedImage/);
    const migration = readSource(
      "prisma/migrations/20261111140000_article_featured_image/migration.sql"
    );
    assert.match(migration, /CREATE TABLE IF NOT EXISTS "ArticleFeaturedImage"/);
    assert.doesNotMatch(migration, /DROP TABLE/i);
  });

  it("Docker Compose déclare le volume de stockage", () => {
    const compose = readSource("docker-compose.yml");
    assert.match(compose, /featured_images_data/);
    assert.match(compose, /FEATURED_IMAGE_STORAGE_DIR/);
  });

  it("le service impose completed + wpPostId et réutilise wpMediaId", () => {
    const service = readSource("lib/images/service.ts");
    assert.match(service, /status !== "completed"/);
    assert.match(service, /wpPostId/);
    assert.match(service, /confirmReplace/);
    assert.match(service, /if \(!mediaId\)/);
    assert.match(service, /NOT_DRAFT/);
  });
});

describe("featured image — ALT soft-fail contract", () => {
  it("améliore les consignes ALT sans tronquer avec des points de suspension", async () => {
    const { cleanAlt, FEATURED_ALT_SYSTEM_PROMPT } = await import(
      "../lib/images/alt-text"
    );
    assert.match(FEATURED_ALT_SYSTEM_PROMPT, /80 à 150/);
    assert.match(FEATURED_ALT_SYSTEM_PROMPT, /Pas de bourrage de mots-clés SEO/);
    assert.match(FEATURED_ALT_SYSTEM_PROMPT, /réellement visibles/);
    const natural =
      "Une aide-soignante accompagne une femme âgée devant un ordinateur portable, avec des symboles d'intelligence artificielle en arrière-plan.";
    assert.equal(cleanAlt(natural), natural);
    assert.equal(cleanAlt('« Image de un bureau »'), "un bureau");
    const long = "a".repeat(200);
    const capped = cleanAlt(long);
    assert.ok(capped);
    assert.equal(capped.length, 180);
    assert.doesNotMatch(capped, /…$/);
  });

  it("proposeFeaturedImageAltText retourne null sans throw sur erreur API", async () => {
    const openaiModule = await import("../lib/openai");
    const create = mock.method(
      openaiModule.openai.chat.completions,
      "create",
      async () => {
        throw new Error("vision down");
      }
    );
    try {
      const { proposeFeaturedImageAltText } = await import(
        "../lib/images/alt-text"
      );
      const result = await proposeFeaturedImageAltText({
        imageBytes: Buffer.from("x"),
        mimeType: "image/webp",
        title: "Titre",
        subject: "Sujet",
        languageLabel: "Français",
      });
      assert.equal(result.altText, null);
      assert.ok(result.model);
    } finally {
      create.mock.restore();
    }
  });
});
