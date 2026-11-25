"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useWorkspace } from "./WorkspaceProvider";
import type { WorkspaceView } from "./types";
import { CmsProviderIcon } from "./CmsProviderIcon";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function providerLabel(provider: WorkspaceView["cmsProvider"]): string {
  return provider === "webflow" ? "Webflow" : "WordPress";
}

/** Domaine / label site — sans répéter WordPress/Webflow. */
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
  // Dernier recours : retirer le préfixe CMS du name seedé.
  const name = workspace.name.trim();
  const stripped = name
    .replace(/^(WordPress|Webflow)\s*[—–\-:]\s*/i, "")
    .replace(/^(WordPress|Webflow)\s+/i, "")
    .trim();
  return stripped || name;
}

function WorkspaceOptionRows({ workspace }: { workspace: WorkspaceView }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium leading-tight">
        {providerLabel(workspace.cmsProvider)}
      </span>
      <span className="mt-0.5 block truncate text-xs leading-tight text-[#64748B]">
        {siteCaption(workspace)}
      </span>
    </span>
  );
}

export function WorkspaceSelector({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  const { workspaces, active, switching, switchWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function onSelect(workspaceId: string) {
    if (workspaceId === active.id || switching) {
      setOpen(false);
      return;
    }
    setError(null);
    setOpen(false);
    try {
      await switchWorkspace(workspaceId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Changement d’espace impossible."
      );
    }
  }

  if (collapsed) {
    return (
      <div
        ref={rootRef}
        className={cn("relative shrink-0 border-b border-[#E2E8F0] px-2 py-2", className)}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-center rounded-lg py-2.5 transition-colors",
                  "text-[#0F5270] hover:bg-[#F8FAFC]",
                  switching && "opacity-60"
                )}
                aria-label={`Espace actif : ${providerLabel(active.cmsProvider)} — ${siteCaption(active)}`}
                aria-expanded={open}
                disabled={switching}
                onClick={() => setOpen((value) => !value)}
              />
            }
          >
            <CmsProviderIcon provider={active.cmsProvider} size={26} />
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {providerLabel(active.cmsProvider)} · {siteCaption(active)}
          </TooltipContent>
        </Tooltip>
        {open ? (
          <div
            className="absolute top-0 left-full z-50 ml-2 w-64 rounded-lg border border-[#E2E8F0] bg-white p-1 shadow-lg"
            role="listbox"
            aria-label="Choisir un espace éditorial"
          >
            {workspaces.map((workspace) => {
              const selected = workspace.id === active.id;
              return (
                <button
                  key={workspace.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={switching}
                  onClick={() => void onSelect(workspace.id)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left",
                    selected
                      ? "bg-[#E8F2F7] text-[#0F5270]"
                      : "text-[#0F172A] hover:bg-[#F8FAFC]"
                  )}
                >
                  <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-white">
                    <CmsProviderIcon
                      provider={workspace.cmsProvider}
                      size={24}
                    />
                  </span>
                  <WorkspaceOptionRows workspace={workspace} />
                  {selected ? (
                    <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative shrink-0 border-b border-[#E2E8F0] px-3 py-3", className)}
    >
      <p className="mb-1.5 text-[10px] font-semibold tracking-[0.12em] text-[#64748B] uppercase">
        Espace éditorial
      </p>
      <button
        type="button"
        id={listId}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={switching}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-2 text-left transition-colors",
          "hover:border-[#0F5270]/40 hover:bg-white",
          open && "border-[#0F5270]/50 bg-white",
          switching && "opacity-60"
        )}
      >
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-white">
          <CmsProviderIcon provider={active.cmsProvider} size={26} />
        </span>
        <WorkspaceOptionRows workspace={active} />
        <ChevronsUpDown className="size-4 shrink-0 text-[#64748B]" aria-hidden />
      </button>

      {open ? (
        <div
          className="absolute inset-x-3 z-50 mt-1 rounded-lg border border-[#E2E8F0] bg-white p-1 shadow-lg"
          role="listbox"
          aria-labelledby={listId}
        >
          {workspaces.map((workspace) => {
            const selected = workspace.id === active.id;
            return (
              <button
                key={workspace.id}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={switching}
                onClick={() => void onSelect(workspace.id)}
                className={cn(
                  "flex w-full min-w-0 items-start gap-2 rounded-md px-2.5 py-2 text-left",
                  selected
                    ? "bg-[#E8F2F7] text-[#0F5270]"
                    : "text-[#0F172A] hover:bg-[#F8FAFC]"
                )}
              >
                <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-white">
                  <CmsProviderIcon
                    provider={workspace.cmsProvider}
                    size={24}
                  />
                </span>
                <WorkspaceOptionRows workspace={workspace} />
                {selected ? (
                  <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {switching ? (
        <p className="mt-2 text-xs text-[#64748B]">Changement d’espace…</p>
      ) : null}
    </div>
  );
}
