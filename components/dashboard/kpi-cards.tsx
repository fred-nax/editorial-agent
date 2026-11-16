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

type KpiTheme = {
  card: string;
  iconWrap: string;
  icon: string;
};

const DEFAULT_ICONS: LucideIcon[] = [
  FileText,
  ListTodo,
  LoaderCircle,
  CircleDollarSign,
];

const KPI_THEMES: KpiTheme[] = [
  {
    card: "border-[#D7EAF6] bg-[#EDF7FD]",
    iconWrap: "bg-[#D9EEF9] text-[#0F5270]",
    icon: "text-[#0F5270]",
  },
  {
    card: "border-[#F5DCCF] bg-[#FFF1EB]",
    iconWrap: "bg-[#FFE4D8] text-[#B85C38]",
    icon: "text-[#B85C38]",
  },
  {
    card: "border-[#CDEADF] bg-[#E8FAF5]",
    iconWrap: "bg-[#D3F3EA] text-[#1F7A66]",
    icon: "text-[#1F7A66]",
  },
  {
    card: "border-[#E2D8F7] bg-[#F3EEFF]",
    iconWrap: "bg-[#E6DCFB] text-[#5B4B8A]",
    icon: "text-[#5B4B8A]",
  },
];

export function DashboardKpiCards({ items }: { items: DashboardKpi[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => {
        const Icon = item.icon ?? DEFAULT_ICONS[index] ?? FileText;
        const theme = KPI_THEMES[index % KPI_THEMES.length]!;
        return (
          <Card
            key={item.label}
            size="sm"
            className={`rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.03)] ring-0 ${theme.card}`}
          >
            <CardHeader className="gap-0 p-5">
              <div className="flex items-start justify-between gap-3">
                <CardDescription
                  className="text-sm font-medium text-slate-600"
                  title={item.hint}
                >
                  {item.label}
                </CardDescription>
                <span
                  className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full ${theme.iconWrap}`}
                >
                  <Icon className={`size-4 ${theme.icon}`} aria-hidden />
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
