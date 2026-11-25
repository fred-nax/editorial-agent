import type { Metadata } from "next";
import { WebflowInventoryBoard } from "@/components/inventory/WebflowInventoryBoard";
import { WordPressInventoryPanel } from "@/components/inventory/WordPressInventoryPanel";
import { resolveActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Inventaire",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InventoryPage() {
  const workspace = await resolveActiveWorkspace();

  if (workspace.cmsProvider === "webflow") {
    return <WebflowInventoryBoard />;
  }

  return <WordPressInventoryPanel />;
}
