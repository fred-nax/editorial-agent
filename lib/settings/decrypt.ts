import { decryptAppSecret } from "@/lib/settings/crypto";

export class AppSettingsDecryptError extends Error {
  constructor(message = "Impossible de déchiffrer un secret de configuration.") {
    super(message);
    this.name = "AppSettingsDecryptError";
  }
}

/**
 * Déchiffre un secret AppSettings.
 * - Absence de ciphertext → null (fallback env autorisé ensuite).
 * - Ciphertext présent mais invalide → erreur explicite (pas de fallback silencieux).
 */
export function decryptAppSettingsSecret(
  encrypted: string | null | undefined
): string | null {
  if (!encrypted?.trim()) {
    return null;
  }
  try {
    return decryptAppSecret(encrypted);
  } catch {
    throw new AppSettingsDecryptError(
      "Impossible de déchiffrer un secret AppSettings. Vérifiez APP_SETTINGS_ENCRYPTION_KEY."
    );
  }
}
