import type { WebflowModuleCapability } from "@/lib/workspace/protection";
import { webflowEmptyState } from "@/lib/workspace/protection";

const TITLES: Partial<Record<WebflowModuleCapability, string>> = {
  opportunities: "Opportunités SEO indisponibles",
  veille: "Veille éditoriale",
  analytics: "Analytics indisponible",
  inventory: "Inventaire CMS indisponible",
  featured_image: "Image à la une indisponible",
  rapprochements: "Rapprochements indisponibles",
};

export function WorkspaceEmptyState({
  module,
  title,
  reason,
}: {
  module: WebflowModuleCapability;
  title?: string;
  reason?: string;
}) {
  const empty = webflowEmptyState(module);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6">
      <h2 className="text-sm font-semibold text-slate-900">
        {title ?? TITLES[module] ?? "Fonctionnalité indisponible"}
      </h2>
      <p className="mt-2 text-sm text-slate-700">{reason ?? empty.reason}</p>
      <p className="mt-3 text-xs text-slate-500">
        Aucune donnée WordPress n’est utilisée en compensation pour cet espace
        Webflow.
      </p>
    </div>
  );
}
