import { createHash } from "node:crypto";
import { normalizeText } from "./normalize";

/** Empreinte stable pour éviter les opportunités dupliquées entre recherches. */
export function opportunityFingerprint(title: string, subject: string): string {
  const normalized = normalizeText(`${title} ${subject}`);
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}
