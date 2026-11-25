export type FeaturedImagePublic = {
  id: string;
  generationId: string;
  style: string;
  aspectRatio: string;
  size: string;
  model: string;
  prompt: string;
  altText: string | null;
  altModel: string | null;
  status: string;
  wpMediaId: number | null;
  wpMediaUrl: string | null;
  webflowAssetId: string | null;
  webflowAssetUrl: string | null;
  cmsTransferStatus: string | null;
  error: string | null;
  fileUrl: string;
  createdAt: string;
  updatedAt: string;
};

export function toFeaturedImagePublic(row: {
  id: string;
  generationId: string;
  style: string;
  aspectRatio: string;
  size: string;
  model: string;
  prompt: string;
  altText: string | null;
  altModel: string | null;
  status: string;
  wpMediaId: number | null;
  wpMediaUrl: string | null;
  webflowAssetId?: string | null;
  webflowAssetUrl?: string | null;
  cmsTransferStatus?: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}): FeaturedImagePublic {
  return {
    id: row.id,
    generationId: row.generationId,
    style: row.style,
    aspectRatio: row.aspectRatio,
    size: row.size,
    model: row.model,
    prompt: row.prompt,
    altText: row.altText,
    altModel: row.altModel,
    status: row.status,
    wpMediaId: row.wpMediaId,
    wpMediaUrl: row.wpMediaUrl,
    webflowAssetId: row.webflowAssetId ?? null,
    webflowAssetUrl: row.webflowAssetUrl ?? null,
    cmsTransferStatus: row.cmsTransferStatus ?? null,
    error: row.error,
    fileUrl: `/api/articles/${row.generationId}/featured-image/file?imageId=${row.id}`,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
