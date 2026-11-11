"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { sectionTitle } from "@/components/navigation";
import { Button } from "@/components/ui/button";

type HeaderProps = {
  onOpenMobileNav: () => void;
  userName: string;
  userEmail?: string | null;
  signOutButton: ReactNode;
};

export function Header({
  onOpenMobileNav,
  userName,
  userEmail,
  signOutButton,
}: HeaderProps) {
  const pathname = usePathname();
  const title = sectionTitle(pathname);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[#E2E8F0] bg-white px-4 sm:px-6">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="border-[#E2E8F0] text-[#0F172A] lg:hidden"
        onClick={onOpenMobileNav}
        aria-label="Ouvrir le menu"
      >
        <Menu className="size-5" aria-hidden />
      </Button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#64748B]">{title}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden min-w-0 text-right sm:block">
          <p className="truncate text-sm font-medium text-[#0F172A]">{userName}</p>
          {userEmail ? (
            <p className="truncate text-xs text-[#64748B]">{userEmail}</p>
          ) : null}
        </div>
        {signOutButton}
      </div>
    </header>
  );
}
