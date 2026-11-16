import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "v1";

/**
 * Clé dédiée aux secrets AppSettings (OpenAI / WordPress).
 * Distincte de GOOGLE_TOKEN_ENCRYPTION_KEY — ne pas mélanger.
 */
function resolveKey(): Buffer {
  const raw = process.env.APP_SETTINGS_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "Variable d'environnement manquante : APP_SETTINGS_ENCRYPTION_KEY"
    );
  }
  try {
    const asB64 = Buffer.from(raw, "base64");
    if (asB64.length === 32) {
      return asB64;
    }
  } catch {
    /* fall through */
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

/** Chiffre un secret applicatif avec AES-256-GCM. */
export function encryptAppSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", resolveKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptAppSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Secret AppSettings chiffré invalide.");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    resolveKey(),
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

export function isAppSettingsEncryptionConfigured(): boolean {
  return Boolean(process.env.APP_SETTINGS_ENCRYPTION_KEY?.trim());
}
