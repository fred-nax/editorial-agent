/**
 * Transfert d’assets Webflow (Data API V2).
 * 1) POST /sites/{siteId}/assets → métadonnées + uploadUrl
 * 2) POST multipart vers uploadUrl (S3) — sans token Webflow
 */

import { createHash } from "node:crypto";
import type { WebflowClient } from "@/lib/webflow/client";
import { WebflowApiError } from "@/lib/webflow/errors";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/webp",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/svg+xml",
  "image/avif",
]);

export type WebflowAssetMetadataResponse = {
  id?: string;
  uploadUrl?: string;
  uploadDetails?: Record<string, string>;
  assetUrl?: string;
  hostedUrl?: string;
  contentType?: string;
  originalFileName?: string;
};

export type UploadedWebflowAsset = {
  assetId: string;
  hostedUrl: string;
  assetUrl: string | null;
  fileName: string;
  fileHash: string;
  byteSize: number;
};

export function md5Hex(bytes: Buffer): string {
  return createHash("md5").update(bytes).digest("hex");
}

export function assertFeaturedImageFileForWebflow(input: {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
}): void {
  if (!input.bytes || input.bytes.byteLength === 0) {
    throw new WebflowApiError("bad_request", "Fichier image vide.");
  }
  if (input.bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new WebflowApiError(
      "bad_request",
      "Image trop volumineuse pour Webflow Assets (max 4 Mo)."
    );
  }
  const mime = input.mimeType.trim().toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    throw new WebflowApiError(
      "bad_request",
      `Type MIME non supporté pour Webflow Assets : ${mime}.`
    );
  }
  if (!input.fileName.trim() || input.fileName.length >= 100) {
    throw new WebflowApiError(
      "bad_request",
      "Nom de fichier image invalide (1–99 caractères)."
    );
  }
}

/** Autorise uniquement des URL d’upload S3/Webflow HTTPS retournées par l’API. */
export function assertTrustedWebflowUploadUrl(uploadUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(uploadUrl);
  } catch {
    throw new WebflowApiError(
      "invalid_response",
      "URL d’upload Webflow invalide."
    );
  }
  if (parsed.protocol !== "https:") {
    throw new WebflowApiError(
      "invalid_response",
      "URL d’upload Webflow non HTTPS refusée."
    );
  }
  const host = parsed.hostname.toLowerCase();
  const trusted =
    host.endsWith(".amazonaws.com") ||
    host === "s3.amazonaws.com" ||
    host.endsWith(".webflow.com") ||
    host.endsWith(".webflow.io");
  if (!trusted) {
    throw new WebflowApiError(
      "invalid_response",
      "Destination d’upload Webflow non reconnue (refus)."
    );
  }
}

export function parseImageDimensionsFromSize(
  size: string | null | undefined
): { width?: number; height?: number } {
  const match = /^(\d{2,5})x(\d{2,5})$/i.exec((size ?? "").trim());
  if (!match) {
    return {};
  }
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

export async function createWebflowAssetMetadata(
  client: WebflowClient,
  input: {
    siteId: string;
    fileName: string;
    fileHash: string;
    byteSize: number;
    width?: number;
    height?: number;
  }
): Promise<WebflowAssetMetadataResponse> {
  const siteId = input.siteId.trim();
  if (!siteId) {
    throw new WebflowApiError("bad_request", "Site Webflow manquant.");
  }
  return client.request<WebflowAssetMetadataResponse>({
    method: "POST",
    path: `/sites/${siteId}/assets`,
    body: {
      fileName: input.fileName,
      fileHash: input.fileHash,
      size: input.byteSize,
      ...(input.width ? { width: input.width } : {}),
      ...(input.height ? { height: input.height } : {}),
    },
  });
}

export async function uploadBytesToWebflowAssetUrl(input: {
  uploadUrl: string;
  uploadDetails: Record<string, string>;
  bytes: Buffer;
  fileName: string;
  mimeType: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  assertTrustedWebflowUploadUrl(input.uploadUrl);
  const fetchImpl = input.fetchImpl ?? fetch;
  const form = new FormData();
  for (const [key, value] of Object.entries(input.uploadDetails)) {
    form.append(key, value);
  }
  const blob = new Blob([new Uint8Array(input.bytes)], {
    type: input.mimeType,
  });
  form.append("file", blob, input.fileName);

  const response = await fetchImpl(input.uploadUrl, {
    method: "POST",
    body: form,
    // Pas d’Authorization — le token Webflow ne doit jamais partir vers S3.
  });
  if (!response.ok) {
    throw new WebflowApiError(
      "server_error",
      `Échec du transfert binaire Webflow Assets (HTTP ${response.status}).`,
      { status: response.status >= 500 ? 502 : response.status }
    );
  }
}

/**
 * Crée les métadonnées puis transfère le fichier.
 * Retourne l’identifiant / URL hébergée — sans association CMS.
 */
export async function uploadWebflowSiteAsset(input: {
  client: WebflowClient;
  siteId: string;
  bytes: Buffer;
  fileName: string;
  mimeType: string;
  sizeLabel?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<UploadedWebflowAsset> {
  assertFeaturedImageFileForWebflow({
    bytes: input.bytes,
    mimeType: input.mimeType,
    fileName: input.fileName,
  });
  const fileHash = md5Hex(input.bytes);
  const dims = parseImageDimensionsFromSize(input.sizeLabel);
  const meta = await createWebflowAssetMetadata(input.client, {
    siteId: input.siteId,
    fileName: input.fileName,
    fileHash,
    byteSize: input.bytes.byteLength,
    width: dims.width,
    height: dims.height,
  });

  const assetId = meta.id?.trim();
  const uploadUrl = meta.uploadUrl?.trim();
  const hostedUrl = (meta.hostedUrl ?? meta.assetUrl)?.trim();
  if (!assetId || !uploadUrl) {
    throw new WebflowApiError(
      "invalid_response",
      "Réponse Webflow Assets incomplète (id / uploadUrl)."
    );
  }
  if (!meta.uploadDetails || typeof meta.uploadDetails !== "object") {
    throw new WebflowApiError(
      "invalid_response",
      "Réponse Webflow Assets sans uploadDetails."
    );
  }

  const uploadDetails: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta.uploadDetails)) {
    if (typeof value === "string") {
      uploadDetails[key] = value;
    }
  }

  await uploadBytesToWebflowAssetUrl({
    uploadUrl,
    uploadDetails,
    bytes: input.bytes,
    fileName: input.fileName,
    mimeType: input.mimeType,
    fetchImpl: input.fetchImpl,
  });

  return {
    assetId,
    hostedUrl: hostedUrl || uploadUrl,
    assetUrl: meta.assetUrl?.trim() || null,
    fileName: input.fileName,
    fileHash,
    byteSize: input.bytes.byteLength,
  };
}

/**
 * Sonde non destructive assets:read (GET liste limitée).
 * Ne crée aucun asset.
 */
export async function probeWebflowAssetsRead(
  client: WebflowClient,
  siteId: string
): Promise<{ ok: boolean; message: string }> {
  try {
    await client.request({
      method: "GET",
      path: `/sites/${siteId}/assets`,
      query: { limit: "1" },
    });
    return {
      ok: true,
      message: "Permission assets:read disponible (liste Assets OK).",
    };
  } catch (error) {
    if (error instanceof WebflowApiError) {
      if (error.status === 403 || error.code === "forbidden") {
        return {
          ok: false,
          message:
            "Permission assets:read manquante ou site non autorisé (HTTP 403).",
        };
      }
      if (error.status === 401 || error.code === "unauthorized") {
        return {
          ok: false,
          message: "Token Webflow invalide pour les Assets (HTTP 401).",
        };
      }
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "Sonde Assets impossible." };
  }
}
