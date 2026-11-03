import type { Metadata } from "next";
import { AiVisibilityBoard } from "@/components/AiVisibilityBoard";

export const metadata: Metadata = {
  title: "Visibilité IA",
};

export const dynamic = "force-dynamic";

export default function AiVisibilityPage() {
  return <AiVisibilityBoard />;
}
