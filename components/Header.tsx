"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/articles": "Historique",
  "/articles/new": "Nouvel article",
  "/topics": "Sujets",
  "/opportunities": "Opportunités SEO",
  "/veille": "Veille éditoriale",
  "/settings": "Paramètres",
};

type HeaderProps = {
  onOpenSidebar: () => void;
  userName: string;
  userEmail?: string | null;
  signOutButton: ReactNode;
};

export function Header({
  onOpenSidebar,
  userName,
  userEmail,
  signOutButton,
}: HeaderProps) {
  const pathname = usePathname();

  const title =
    titles[pathname] ??
    (pathname.startsWith("/articles/")
      ? "Détail de la génération"
      : "Naxialis Content Agent");

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
      <button
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-700 lg:hidden"
        onClick={onOpenSidebar}
        aria-label="Ouvrir le menu"
      >
        <span className="sr-only">Menu</span>
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="hidden text-xs text-slate-500 sm:block">
          Back-office éditorial privé
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden min-w-0 text-right sm:block">
          <p className="truncate text-sm font-medium text-slate-900">{userName}</p>
          {userEmail ? (
            <p className="truncate text-xs text-slate-500">{userEmail}</p>
          ) : null}
        </div>
        {signOutButton}
      </div>
    </header>
  );
}
