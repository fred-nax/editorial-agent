import Link from "next/link";
import { Radar } from "lucide-react";
import {
  dashboardCardClassName,
  dashboardCardHeaderClassName,
  dashboardIconBadgeClassName,
} from "@/components/dashboard/card-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/format";
import { VEILLE_KIND_LABELS, type VeilleKind } from "@/lib/veille/types";

export type EditorialWatchPreviewItem = {
  title: string;
  sourceName: string;
  kind: VeilleKind;
  /** Instant de la recherche qui a enregistré la publication. */
  detectedAt: Date | string;
  publishedOn?: string | null;
};

export function DashboardEditorialWatchPreview({
  items,
}: {
  items: EditorialWatchPreviewItem[];
}) {
  return (
    <Card className={`h-full ${dashboardCardClassName}`}>
      <CardHeader className={dashboardCardHeaderClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={dashboardIconBadgeClassName}>
                <Radar className="size-4" aria-hidden />
              </span>
              <CardTitle className="text-base font-semibold text-[#0F172A]">
                Veille éditoriale
              </CardTitle>
            </div>
            <CardDescription className="text-sm text-slate-500">
              Dernières publications enregistrées lors des recherches de veille.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-[#E2E8F0] text-sm"
            nativeButton={false}
            render={<Link href="/veille" />}
          >
            Voir la veille
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0 pt-0">
        {items.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-600">
            Aucune suggestion de veille disponible
          </p>
        ) : (
          <ul>
            {items.map((item, index) => (
              <li key={`${item.title}-${item.detectedAt}-${index}`}>
                {index > 0 ? <Separator className="bg-[#E2E8F0]" /> : null}
                <div className="space-y-2 px-5 py-3.5">
                  <p className="text-sm font-medium leading-snug text-[#0F172A]">
                    {item.title}
                  </p>
                  <p className="text-xs text-slate-500">
                    Détectée le {formatDate(item.detectedAt)}
                    {item.publishedOn
                      ? ` · Publiée le ${item.publishedOn}`
                      : null}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="border-[#E2E8F0] bg-slate-50 text-slate-600"
                    >
                      {item.sourceName}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-[#E2E8F0] bg-slate-50 text-slate-600"
                    >
                      {VEILLE_KIND_LABELS[item.kind]}
                    </Badge>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
