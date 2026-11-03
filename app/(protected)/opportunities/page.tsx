import type { Metadata } from "next";
import { OpportunitiesBoard } from "@/components/OpportunitiesBoard";

export const metadata: Metadata = {
  title: "Opportunités SEO",
};

export const dynamic = "force-dynamic";

export default function OpportunitiesPage() {
  return <OpportunitiesBoard />;
}
