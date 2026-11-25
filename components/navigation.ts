import type { LucideIcon } from "lucide-react";
import {
  ChartNoAxesCombined,
  History,
  LayoutDashboard,
  Library,
  ListTodo,
  Plug,
  Radar,
  SearchCheck,
  Settings,
  SquarePen,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const navigation: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/articles/new", label: "Nouvel article", icon: SquarePen },
  { href: "/articles", label: "Historique", icon: History },
  { href: "/topics", label: "File éditoriale", icon: ListTodo },
  { href: "/inventory", label: "Inventaire", icon: Library },
  { href: "/analytics", label: "Analytics", icon: ChartNoAxesCombined },
  { href: "/opportunities", label: "Opportunités SEO", icon: SearchCheck },
  { href: "/veille", label: "Veille éditoriale", icon: Radar },
  { href: "/settings", label: "Paramètres", icon: Settings },
  { href: "/settings/integrations", label: "Intégrations", icon: Plug },
];

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/articles") {
    return (
      pathname === "/articles" ||
      (pathname.startsWith("/articles/") && pathname !== "/articles/new")
    );
  }
  if (href === "/articles/new") {
    return pathname === "/articles/new";
  }
  if (href === "/analytics") {
    return pathname === "/analytics" || pathname.startsWith("/analytics/");
  }
  if (href === "/inventory") {
    return pathname === "/inventory" || pathname.startsWith("/inventory/");
  }
  // Paramètres ≠ Intégrations (sous-route dédiée).
  if (href === "/settings") {
    return pathname === "/settings";
  }
  if (href === "/settings/integrations") {
    return (
      pathname === "/settings/integrations" ||
      pathname.startsWith("/settings/integrations/")
    );
  }
  return pathname === href;
}

export function sectionTitle(pathname: string): string {
  const exact = navigation.find((item) => item.href === pathname);
  if (exact) {
    return exact.label;
  }
  if (pathname.startsWith("/articles/") && pathname !== "/articles/new") {
    return "Historique";
  }
  if (pathname.startsWith("/analytics")) {
    return "Analytics";
  }
  if (pathname.startsWith("/inventory")) {
    return "Inventaire";
  }
  if (pathname.startsWith("/settings/integrations")) {
    return "Intégrations";
  }
  return "Naxialis Content Agent";
}

export const SIDEBAR_WIDTH_EXPANDED = "15rem"; // 240px
export const SIDEBAR_WIDTH_COLLAPSED = "4.5rem"; // 72px
