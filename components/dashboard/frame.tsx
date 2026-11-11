import type { ReactNode } from "react";

/**
 * Cadre propre au Dashboard : plafonne à 1440px, aligné à gauche
 * dans la zone de contenu (padding géré par AppShell).
 */
export function DashboardFrame({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-[1440px]">
      <div className="space-y-5">{children}</div>
    </div>
  );
}
