"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavActive, navigation } from "@/components/navigation";
import { WorkspaceSelector } from "@/components/workspace";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type MobileNavProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[min(20rem,85vw)] gap-0 border-[#E2E8F0] bg-white p-0"
      >
        <SheetHeader className="border-b border-[#E2E8F0] px-5 py-4 text-left">
          <SheetTitle className="text-xs font-semibold tracking-[0.14em] text-[#0F5270] uppercase">
            Naxialis
          </SheetTitle>
          <SheetDescription className="text-sm font-medium text-[#0F172A]">
            Content Agent
          </SheetDescription>
        </SheetHeader>

        <WorkspaceSelector />

        <nav className="flex flex-col gap-1 p-3" aria-label="Navigation mobile">
          {navigation.map((item) => {
            const active = isNavActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onOpenChange(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-[#E8F2F7] text-[#0F5270]"
                    : "text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <p className="mt-auto border-t border-[#E2E8F0] px-5 py-4 text-xs text-[#64748B]">
          Usage privé Naxialis
        </p>
      </SheetContent>
    </Sheet>
  );
}
