import { db } from "@/lib/db";
import { isNaxialisWpHost, siteHostFromUrl } from "@/lib/editorial/identity";
import { APP_SETTINGS_ID } from "@/lib/settings/app-settings-id";

/**
 * Décide si le seed des 5 thématiques historiques Naxialis doit tourner au boot.
 *
 * - Installation Naxialis (WP naxialis.com) → oui (maintien).
 * - Thématiques legacy déjà présentes → oui (ne pas laisser orphelines).
 * - Nouvelle installation client (pas de legacy, WP ≠ naxialis) → non.
 * - Ne réactive jamais une thématique désactivée (ensure ne touche pas `active`).
 */
export async function shouldSeedHistoricalEditorialThemes(): Promise<boolean> {
  try {
    const legacyCount = await db.customTheme.count({
      where: { legacyKey: { not: null } },
    });
    if (legacyCount > 0) {
      return true;
    }
  } catch {
    // Table absente avant migrate — ne pas seed en aveugle.
    return false;
  }

  try {
    const row = await db.appSettings.findUnique({
      where: { id: APP_SETTINGS_ID },
      select: { wpUrl: true },
    });
    const host = siteHostFromUrl(
      row?.wpUrl?.trim() || process.env.WP_URL?.trim() || null
    );
    return isNaxialisWpHost(host);
  } catch {
    const host = siteHostFromUrl(process.env.WP_URL?.trim() || null);
    return isNaxialisWpHost(host);
  }
}
