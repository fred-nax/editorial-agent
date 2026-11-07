import type { Metadata } from "next";
import { EditorialWatch } from "@/components/EditorialWatch";

export const metadata: Metadata = {
  title: "Veille éditoriale",
};

export const dynamic = "force-dynamic";

export default function VeillePage() {
  return <EditorialWatch />;
}
