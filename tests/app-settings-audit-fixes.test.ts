import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { encryptAppSecret } from "../lib/settings/crypto";
import {
  AppSettingsDecryptError,
  decryptAppSettingsSecret,
} from "../lib/settings/decrypt";
import {
  assertSafeWordPressUrl,
  WordPressUrlError,
} from "../lib/settings/wp-url";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("Audit fixes — déchiffrement strict", () => {
  const previous = process.env.APP_SETTINGS_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.APP_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64"
    );
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.APP_SETTINGS_ENCRYPTION_KEY;
    } else {
      process.env.APP_SETTINGS_ENCRYPTION_KEY = previous;
    }
  });

  it("absence de ciphertext → null (fallback env possible)", () => {
    assert.equal(decryptAppSettingsSecret(null), null);
    assert.equal(decryptAppSettingsSecret(""), null);
    assert.equal(decryptAppSettingsSecret("   "), null);
  });

  it("ciphertext valide → plaintext", () => {
    const enc = encryptAppSecret("sk-db-only-secret-abcdefghijklmnop");
    assert.equal(decryptAppSettingsSecret(enc), "sk-db-only-secret-abcdefghijklmnop");
  });

  it("ciphertext invalide → erreur explicite (pas de null silencieux)", () => {
    assert.throws(
      () => decryptAppSettingsSecret("v1:bad:bad:bad"),
      AppSettingsDecryptError
    );
  });

  it("mauvaise clé de chiffrement → erreur explicite", () => {
    const enc = encryptAppSecret("sk-db-only-secret-abcdefghijklmnop");
    process.env.APP_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
      "base64"
    );
    assert.throws(() => decryptAppSettingsSecret(enc), AppSettingsDecryptError);
  });
});

describe("Audit fixes — OpenAI centralisé", () => {
  it("veille utilise getOpenAIClient", () => {
    assert.match(read("lib/veille/openai-watch.ts"), /getOpenAIClient/);
    assert.doesNotMatch(
      read("lib/veille/openai-watch.ts"),
      /\{\s*openai\s*\}\s*=\s*await import/
    );
    assert.match(read("lib/veille/openai-suggestions.ts"), /getOpenAIClient/);
  });

  it("le proxy sync openai refuse l’usage", () => {
    const source = read("lib/openai.ts");
    assert.match(source, /Import synchrone `openai` interdit/);
    assert.match(source, /getOpenAIClient/);
  });
});

describe("Audit fixes — inventaire WP A→B", () => {
  it("expose inventoryValid et invalidation sans purge", () => {
    const schema = read("prisma/schema.prisma");
    assert.match(schema, /inventoryValid/);
    const migration = read(
      "prisma/migrations/20261116200000_app_settings_inventory_valid/migration.sql"
    );
    assert.match(migration, /inventoryValid/);
    assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM "WordPressPost"/i);
  });

  it("acknowledge invalide sans marquer l’inventaire utilisable", () => {
    const source = read("lib/settings/app-settings.ts");
    assert.match(source, /acknowledgeInventorySiteSwitch/);
    assert.match(
      source,
      /inventoryValid:\s*false/
    );
    // Ne doit plus poser inventoryWpOrigin = nouveau site dans acknowledge
    const ackBlock = source.slice(
      source.indexOf("acknowledgeInventorySiteSwitch"),
      source.indexOf("markInventorySyncedForSite")
    );
    assert.doesNotMatch(ackBlock, /inventoryWpOrigin:\s*origin/);
    assert.doesNotMatch(ackBlock, /inventoryValid:\s*true/);
  });

  it("consommateurs inventaire sont protégés", () => {
    for (const file of [
      "lib/agent/internal-links/catalog.ts",
      "lib/seo/duplicates.ts",
      "lib/topics/editorial-similarity.ts",
      "lib/veille/editorial-corpus.ts",
      "lib/google/published-url-map.ts",
    ]) {
      assert.match(read(file), /isWordPressInventoryUsable/, file);
    }
    // Compat WP : wrappers délèguent au map multi-CMS.
    assert.match(read("lib/google/wp-url-map.ts"), /published-url-map/);
  });

  it("sync incrémentale refusée si inventaire invalidé", () => {
    const source = read("lib/settings/app-settings.ts");
    assert.match(source, /assertInventorySyncAllowed/);
    assert.match(
      source,
      /synchronisation complète est obligatoire/
    );
  });
});

describe("Audit fixes — SSRF / HTTPS", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAllow = process.env.ALLOW_INSECURE_WP_URL;

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousAllow === undefined) {
      delete process.env.ALLOW_INSECURE_WP_URL;
    } else {
      process.env.ALLOW_INSECURE_WP_URL = previousAllow;
    }
  });

  it("refuse HTTP hors développement", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_INSECURE_WP_URL;
    assert.throws(
      () => assertSafeWordPressUrl("http://example.com"),
      WordPressUrlError
    );
  });

  it("accepte HTTPS public", () => {
    process.env.NODE_ENV = "production";
    assert.equal(
      assertSafeWordPressUrl("https://example.com/"),
      "https://example.com"
    );
  });

  it("wordpress / media / inventaire refusent les redirections", () => {
    assert.match(read("lib/wordpress.ts"), /fetchWordPressNoRedirect/);
    assert.match(read("lib/wordpress-media.ts"), /fetchWordPressNoRedirect/);
    assert.match(
      read("lib/seo/wordpress-inventory.ts"),
      /fetchWordPressNoRedirect/
    );
  });
});

describe("Audit fixes — images à la une", () => {
  it("vérifie l’origine WP du brouillon avant upload", () => {
    const source = read("lib/images/service.ts");
    assert.match(source, /assertFeaturedImageTargetsCurrentWordPress/);
    assert.match(source, /WP_SITE_MISMATCH/);
  });
});
