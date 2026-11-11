import Link from "next/link";
import { Radar } from "lucide-react";
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
    <Card className="border border-[#E2E8F0] bg-white shadow-none ring-0">
      <CardHeader className="gap-1.5 border-b border-[#E2E8F0] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-md border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F5270]">
                <Radar className="size-4" aria-hidden />
              </span>
              <CardTitle className="text-base font-semibold text-[#0F172A]">
                Veille éditoriale
              </CardTitle>
            </div>
            <CardDescription className="text-sm text-slate-600">
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
      <CardContent className="p-5">
        {items.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-600">
            Aucune suggestion de veille disponible
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {items.map((item, index) => (
              <li key={`${item.title}-${item.detectedAt}-${index}`} className="min-w-0">
                {index > 0 ? (
                  <Separator className="mb-4 bg-[#E2E8F0] lg:hidden" />
                ) : null}
                <div className="space-y-2">
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
