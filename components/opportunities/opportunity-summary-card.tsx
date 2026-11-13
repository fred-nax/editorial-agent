"use client";

import type { LucideIcon } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";

export type OpportunitySummaryAccent = "default" | "orange";

export type OpportunitySummaryCardProps = {
  title: string;
  value: number;
  description: string;
  icon: LucideIcon;
  active?: boolean;
  accent?: OpportunitySummaryAccent;
  onClick: () => void;
};

export function OpportunitySummaryCard({
  title,
  value,
  description,
  icon: Icon,
  active = false,
  accent = "default",
  onClick,
}: OpportunitySummaryCardProps) {
  const isOrange = accent === "orange";

  return (
    <Card
      size="sm"
      className={[
        "h-full border bg-white shadow-none ring-0 transition-colors",
        "rounded-xl",
        active
          ? isOrange
            ? "border-orange-400 ring-1 ring-orange-200/80"
            : "border-naxialis/45 ring-1 ring-naxialis/15"
          : isOrange
            ? "border-orange-200/80 hover:border-orange-300"
            : "border-slate-200 hover:border-slate-300",
      ].join(" ")}
    >
      <CardHeader className="h-full gap-0 p-5 sm:p-6">
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          className="flex h-full w-full cursor-pointer flex-col rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-naxialis/35 focus-visible:ring-offset-2"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-slate-800">{title}</p>
            <span
              className={[
                "inline-flex size-8 shrink-0 items-center justify-center rounded-md border",
                isOrange
                  ? "border-orange-200 bg-orange-50 text-orange-600"
                  : "border-slate-200 bg-slate-50 text-[#0F5270]",
              ].join(" ")}
            >
              <Icon className="size-4" aria-hidden />
            </span>
          </div>

          <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
            {value}
          </p>

          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {description}
          </p>
        </button>
      </CardHeader>
    </Card>
  );
}
