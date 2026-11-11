"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import {
  isNavActive,
  navigation,
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
} from "@/components/navigation";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();

  return (
    <TooltipProvider delay={200}>
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-[#E2E8F0] bg-white transition-[width] duration-200 ease-out lg:flex"
        style={{
          width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
        }}
        aria-label="Navigation principale"
      >
        <div
          className={cn(
            "flex h-16 items-center border-b border-[#E2E8F0]",
            collapsed ? "justify-center px-2" : "px-4"
          )}
        >
          {collapsed ? (
            <span className="text-sm font-bold tracking-wide text-[#0F5270]">N</span>
          ) : (
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.14em] text-[#0F5270] uppercase">
                Naxialis
              </p>
              <p className="truncate text-sm font-medium text-[#0F172A]">
                Content Agent
              </p>
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {navigation.map((item) => {
            const active = isNavActive(pathname, item.href);
            const Icon = item.icon;
            const linkClass = cn(
              "flex items-center rounded-lg text-sm font-medium transition-colors duration-150",
              collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
              active
                ? "bg-[#E8F2F7] text-[#0F5270]"
                : "text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger
                    render={
                      <Link
                        href={item.href}
                        className={linkClass}
                        aria-label={item.label}
                        aria-current={active ? "page" : undefined}
                      />
                    }
                  >
                    <Icon className="size-5 shrink-0" aria-hidden />
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={linkClass}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[#E2E8F0] p-2">
          <Button
            type="button"
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            onClick={onToggleCollapsed}
            className={cn(
              "w-full text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]",
              collapsed ? "mx-auto" : "justify-start gap-2 px-3"
            )}
            aria-label={collapsed ? "Déplier la navigation" : "Replier la navigation"}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <PanelLeft className="size-5" aria-hidden />
            ) : (
              <>
                <PanelLeftClose className="size-5" aria-hidden />
                <span className="text-sm">Replier</span>
              </>
            )}
          </Button>
          {collapsed ? null : (
            <p className="mt-2 px-3 pb-1 text-xs text-[#64748B]">
              Usage privé Naxialis
            </p>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
