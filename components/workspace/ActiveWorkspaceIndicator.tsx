"use client";

import { Globe2, LayoutTemplate } from "lucide-react";
import { useWorkspaceOptional } from "./WorkspaceProvider";
import type { WorkspaceView } from "./types";
import { cn } from "@/lib/utils";

function providerLabel(provider: WorkspaceView["cmsProvider"]): string {
  return provider === "webflow" ? "Webflow" : "WordPress";
}

function siteCaption(workspace: WorkspaceView): string {
  const label = workspace.siteLabel?.trim();
  if (label) {
    return label;
  }
  const fromUrl = workspace.siteUrl
    ?.replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .trim();
  if (fromUrl) {
    return fromUrl;
  }
  const name = workspace.name.trim();
  return (
    name
      .replace(/^(WordPress|Webflow)\s*[—–\-:]\s*/i, "")
      .replace(/^(WordPress|Webflow)\s+/i, "")
      .trim() || name
  );
}

export function ActiveWorkspaceIndicator({
  workspace: workspaceProp,
  className,
}: {
  /** Si fourni (RSC), prioritaire sur le contexte client. */
  workspace?: WorkspaceView;
  className?: string;
}) {
  const ctx = useWorkspaceOptional();
  const workspace = workspaceProp ?? ctx?.active;
  if (!workspace) {
    return null;
  }

  const isWebflow = workspace.cmsProvider === "webflow";
  const Icon = isWebflow ? LayoutTemplate : Globe2;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-3",
        className
      )}
      role="status"
      aria-label={`Espace actif : ${providerLabel(workspace.cmsProvider)} — ${siteCaption(workspace)}`}
    >
      <span
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-md",
          isWebflow
            ? "bg-violet-50 text-violet-800"
            : "bg-sky-50 text-sky-800"
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-[#64748B] uppercase">
          Espace actif
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-[#0F172A]">
          {providerLabel(workspace.cmsProvider)}
        </p>
        <p className="truncate text-xs text-[#64748B]">
          {siteCaption(workspace)}
          {workspace.defaultLanguage
            ? ` · Langue ${workspace.defaultLanguage.toUpperCase()}`
            : null}
        </p>
      </div>
    </div>
  );
}
