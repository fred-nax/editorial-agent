import { Boxes } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkspaceView } from "./types";

type CmsProvider = WorkspaceView["cmsProvider"] | string;

const ICON_SRC: Record<string, string> = {
  wordpress: "/icons/wordpress.svg",
  webflow: "/icons/webflow.svg",
};

/**
 * Logo CMS depuis public/icons/ (fichiers fournis : wordpress.svg, webflow.svg).
 * Autres destinations → icône générique Lucide.
 */
export function CmsProviderIcon({
  provider,
  className,
  size = 24,
}: {
  provider: CmsProvider;
  className?: string;
  /** Taille visuelle cible (px), défaut 24. */
  size?: number;
}) {
  const key = typeof provider === "string" ? provider.trim().toLowerCase() : "";
  const src = ICON_SRC[key];

  if (!src) {
    return (
      <Boxes
        className={cn("shrink-0 text-[#64748B]", className)}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  const label = key === "webflow" ? "Webflow" : key === "wordpress" ? "WordPress" : "CMS";

  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG locaux public/icons
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      decoding="async"
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
      aria-hidden
      data-cms-icon={key}
      title={label}
    />
  );
}

export function cmsIconSrc(provider: CmsProvider): string | null {
  const key = typeof provider === "string" ? provider.trim().toLowerCase() : "";
  return ICON_SRC[key] ?? null;
}
