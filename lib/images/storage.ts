import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_RELATIVE_ROOT = path.join("storage", "featured-images");

export function featuredImageStorageRoot(): string {
  const configured = process.env.FEATURED_IMAGE_STORAGE_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(process.cwd(), DEFAULT_RELATIVE_ROOT);
}

export async function ensureFeaturedImageStorage(): Promise<string> {
  const root = featuredImageStorageRoot();
  await mkdir(root, { recursive: true });
  return root;
}

const SAFE_ID = /^[a-z][a-z0-9]{7,63}$/i;

/** Empêche tout path traversal : uniquement générationId/imageId.ext */
export function buildFeaturedImageRelativePath(
  generationId: string,
  imageId: string,
  extension = "webp"
): string {
  if (!SAFE_ID.test(generationId) || !SAFE_ID.test(imageId)) {
    throw new Error("Identifiant de fichier invalide.");
  }
  if (!/^[a-z0-9]+$/i.test(extension)) {
    throw new Error("Extension de fichier invalide.");
  }
  return `${generationId}/${imageId}.${extension}`;
}

export function resolveFeaturedImageAbsolutePath(relativePath: string): string {
  const root = featuredImageStorageRoot();
  const normalized = relativePath.replaceAll("\\", "/");
  if (
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(normalized)
  ) {
    throw new Error("Chemin d’image non autorisé.");
  }
  const absolute = path.resolve(root, normalized);
  if (!absolute.startsWith(root)) {
    throw new Error("Chemin d’image non autorisé.");
  }
  return absolute;
}

export async function writeFeaturedImageFile(
  relativePath: string,
  bytes: Buffer
): Promise<void> {
  const absolute = resolveFeaturedImageAbsolutePath(relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
}

export async function readFeaturedImageFile(
  relativePath: string
): Promise<Buffer> {
  const absolute = resolveFeaturedImageAbsolutePath(relativePath);
  return readFile(absolute);
}
