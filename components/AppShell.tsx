"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  userName,
  userEmail,
  signOutButton,
}: {
  children: ReactNode;
  userName: string;
  userEmail?: string | null;
  signOutButton: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F8FAFC]">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
      />
      <MobileNav open={mobileOpen} onOpenChange={setMobileOpen} />

      <div
        className={cn(
          "min-h-screen min-w-0 transition-[padding] duration-200 ease-out",
          collapsed ? "lg:pl-[4.5rem]" : "lg:pl-60"
        )}
      >
        <Header
          onOpenMobileNav={() => setMobileOpen(true)}
          userName={userName}
          userEmail={userEmail}
          signOutButton={signOutButton}
        />
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
