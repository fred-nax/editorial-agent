import type { Metadata } from "next";
import { AiVisibilityCampaignDetail } from "@/components/AiVisibilityCampaignDetail";

export const metadata: Metadata = {
  title: "Campagne GEO — Visibilité IA",
};

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ brandId: string; campaignId: string }>;
};

export default async function AiVisibilityCampaignPage({ params }: PageProps) {
  const { brandId, campaignId } = await params;
  return (
    <AiVisibilityCampaignDetail brandId={brandId} campaignId={campaignId} />
  );
}
