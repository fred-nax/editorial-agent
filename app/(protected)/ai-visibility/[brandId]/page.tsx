import type { Metadata } from "next";
import { AiVisibilityBrandDetail } from "@/components/AiVisibilityBrandDetail";

export const metadata: Metadata = {
  title: "Marque — Visibilité IA",
};

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ brandId: string }>;
};

export default async function AiVisibilityBrandPage({ params }: PageProps) {
  const { brandId } = await params;
  return <AiVisibilityBrandDetail brandId={brandId} />;
}
