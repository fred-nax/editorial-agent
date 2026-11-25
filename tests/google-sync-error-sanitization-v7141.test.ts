import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  isTechnicalGoogleError,
  sanitizeStoredGoogleError,
  toPublicGoogleError,
} from "@/lib/google/public-errors";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("V7.14.1 — sanitisation erreurs Google sync", () => {
  it("masque Prisma / Turbopack / chemins locaux", () => {
    const raw = `
Invalid \`db.gscPageDailyStat.upsert()\` invocation in
D:\\laragon\\www\\Naxialis\\Agent\\.next\\dev\\server\\chunks\\[root-of-the-server]__1bw4p3p82061e._.js:2149:150

  2147 const clicks = Number(row.clicks ?? 0);
→ 2149 await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__.gscPageDailyStat.upsert(
Unknown argument \`cmsExternalId\`. Available options are marked with ?.
`;
    assert.equal(isTechnicalGoogleError(raw), true);
    const pub = toPublicGoogleError(raw, "gsc_sync");
    assert.match(pub, /Search Console/i);
    assert.doesNotMatch(pub, /TURBOPACK|\.next|laragon|Unknown argument/i);
  });

  it("préserve les messages métier courts", () => {
    const msg = "Une synchronisation Google est déjà en cours pour cet espace.";
    assert.equal(toPublicGoogleError(msg, "google_sync"), msg);
  });

  it("mappe token expiré vers message auth", () => {
    assert.match(
      toPublicGoogleError("Token has been expired or revoked.", "google_auth"),
      /Reconnectez Google|connexion Google/i
    );
  });

  it("sanitize les erreurs historiques persistées", () => {
    const stored =
      "Invalid `db.gscPageDailyStat.upsert()` invocation in D:\\laragon\\www\\x";
    const cleaned = sanitizeStoredGoogleError(stored, "gsc_sync");
    assert.ok(cleaned);
    assert.doesNotMatch(cleaned!, /laragon|Invalid `/);
  });

  it("API status et sync appliquent la sanitisation", () => {
    assert.match(
      read("app/api/google/status/route.ts"),
      /sanitizeStoredGoogleError/
    );
    assert.match(read("lib/google/sync.ts"), /toPublicGoogleError/);
    assert.match(read("lib/google/sync.ts"), /lastSuccess/);
    assert.match(read("app/api/google/sync/route.ts"), /toPublicGoogleError/);
  });
});
