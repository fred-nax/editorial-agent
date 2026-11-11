import type { LucideIcon } from "lucide-react";
import { CircleDollarSign, FileText, ListTodo, LoaderCircle } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

export type DashboardKpi = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
};

const DEFAULT_ICONS: LucideIcon[] = [
  FileText,
  ListTodo,
  LoaderCircle,
  CircleDollarSign,
];

export function DashboardKpiCards({ items }: { items: DashboardKpi[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => {
        const Icon = item.icon ?? DEFAULT_ICONS[index] ?? FileText;
        return (
          <Card
            key={item.label}
            size="sm"
            className="border border-[#E2E8F0] bg-white shadow-none ring-0"
          >
            <CardHeader className="gap-0 p-5">
              <div className="flex items-start justify-between gap-3">
                <CardDescription
                  className="text-sm font-medium text-slate-600"
                  title={item.hint}
                >
                  {item.label}
                </CardDescription>
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F5270]">
                  <Icon className="size-4" aria-hidden />
                </span>
              </div>
              <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900 tabular-nums lg:text-4xl">
                {item.value}
              </p>
              {item.hint ? (
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {item.hint}
                </p>
              ) : null}
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
