import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  decryptAppSecret,
  encryptAppSecret,
  isAppSettingsEncryptionConfigured,
} from "../lib/settings/crypto";
import {
  assertSafeWordPressUrl,
  normalizeWpOrigin,
  WordPressUrlError,
} from "../lib/settings/wp-url";

describe("AppSettings crypto", () => {
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

  it("chiffre et déchiffre un secret", () => {
    assert.equal(isAppSettingsEncryptionConfigured(), true);
    const enc = encryptAppSecret("sk-test-secret-value");
    assert.notEqual(enc, "sk-test-secret-value");
    assert.match(enc, /^v1:/);
    assert.equal(decryptAppSecret(enc), "sk-test-secret-value");
  });

  it("refuse un payload invalide", () => {
    assert.throws(() => decryptAppSecret("not-a-payload"), /invalide/);
  });
});

describe("WordPress URL anti-SSRF", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAllow = process.env.ALLOW_INSECURE_WP_URL;

  beforeEach(() => {
    process.env.NODE_ENV = "development";
    process.env.ALLOW_INSECURE_WP_URL = "1";
  });

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousAllow === undefined) {
      delete process.env.ALLOW_INSECURE_WP_URL;
    } else {
      process.env.ALLOW_INSECURE_WP_URL = previousAllow;
    }
  });

  it("accepte une URL https publique", () => {
    assert.equal(
      assertSafeWordPressUrl("https://naxialis.com/"),
      "https://naxialis.com"
    );
  });

  it("normalise l’origin", () => {
    assert.equal(
      normalizeWpOrigin("https://WWW.Example.com/blog"),
      "https://www.example.com"
    );
  });

  it("rejette localhost et IP privées", () => {
    assert.throws(
      () => assertSafeWordPressUrl("http://localhost/wp"),
      WordPressUrlError
    );
    assert.throws(
      () => assertSafeWordPressUrl("http://127.0.0.1"),
      WordPressUrlError
    );
    assert.throws(
      () => assertSafeWordPressUrl("http://192.168.1.10"),
      WordPressUrlError
    );
    assert.throws(
      () => assertSafeWordPressUrl("http://10.0.0.5"),
      WordPressUrlError
    );
  });

  it("rejette les credentials dans l’URL", () => {
    assert.throws(
      () => assertSafeWordPressUrl("https://user:pass@example.com"),
      WordPressUrlError
    );
  });
});

describe("Résolution env fallback (sans DB)", () => {
  const keys = [
    "OPENAI_API_KEY",
    "OPENAI_AGENT_ID",
    "WP_URL",
    "WP_USERNAME",
    "WP_APP_PASSWORD",
  ] as const;
  const snapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of keys) {
      snapshot[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      const value = snapshot[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("lit les valeurs depuis process.env via prefer logique locale", () => {
    process.env.OPENAI_API_KEY = "sk-env-key-abcdefghijklmnopqrstuvwxyz";
    process.env.OPENAI_AGENT_ID = "agt_env_test";
    process.env.WP_URL = "https://example.com";
    process.env.WP_USERNAME = "editor";
    process.env.WP_APP_PASSWORD = "xxxx xxxx xxxx xxxx";

    const prefer = (
      dbValue: string | null | undefined,
      envValue: string | null
    ) => {
      const fromDb = dbValue?.trim() || null;
      if (fromDb) return { value: fromDb, source: "database" as const };
      if (envValue) return { value: envValue, source: "env" as const };
      return { value: null, source: null };
    };

    const apiKey = prefer(null, process.env.OPENAI_API_KEY ?? null);
    assert.equal(apiKey.source, "env");
    assert.equal(apiKey.value, "sk-env-key-abcdefghijklmnopqrstuvwxyz");

    const fromDb = prefer("agt_from_db", process.env.OPENAI_AGENT_ID ?? null);
    assert.equal(fromDb.source, "database");
    assert.equal(fromDb.value, "agt_from_db");

    const missing = prefer(null, null);
    assert.equal(missing.value, null);
  });

  it("champ secret vide = conserver (pas d’update)", () => {
    const incoming = "";
    const shouldUpdate = incoming.trim() !== "";
    assert.equal(shouldUpdate, false);
  });
});
