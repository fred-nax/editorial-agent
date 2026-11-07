"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const navigation = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/articles/new", label: "Nouvel article" },
  { href: "/articles", label: "Historique" },
  { href: "/topics", label: "Sujets" },
  { href: "/opportunities", label: "Opportunités SEO" },
  { href: "/veille", label: "Veille éditoriale" },
  { href: "/settings", label: "Paramètres" },
] as const;

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      <button
        type="button"
        aria-label="Fermer le menu"
        className={`fixed inset-0 z-30 bg-slate-900/40 lg:hidden ${
          open ? "block" : "hidden"
        }`}
        onClick={onClose}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-naxialis-dark text-white transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-xs font-medium tracking-wide text-white/60 uppercase">
            Naxialis
          </p>
          <p className="mt-1 text-base font-semibold">Content Agent</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navigation.map((item) => {
            const active =
              item.href === "/articles"
                ? pathname === "/articles" ||
                  (pathname.startsWith("/articles/") &&
                    pathname !== "/articles/new")
                : pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  active
                    ? "bg-white/15 text-white"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-5 py-4 text-xs text-white/50">
          Usage privé Naxialis
        </div>
      </aside>
    </>
  );
}
