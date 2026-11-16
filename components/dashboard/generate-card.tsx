import { PenLine } from "lucide-react";
import { ArticleForm } from "@/components/ArticleForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DashboardGenerateCard() {
  return (
    <Card
      id="nouveau-sujet"
      className="scroll-mt-24 gap-0 rounded-xl border border-[#E2E8F0] bg-white py-0 shadow-none ring-0"
    >
      <CardHeader className="border-b border-[#E2E8F0] p-5">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-md border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F5270]">
            <PenLine className="size-4" aria-hidden />
          </span>
          <CardTitle className="text-base font-semibold text-[#0F172A]">
            Générer un article
          </CardTitle>
        </div>
        <CardDescription className="text-sm leading-relaxed text-slate-600">
          Saisissez un sujet. La génération crée un brouillon WordPress (status
          draft).
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        <ArticleForm layout="embedded" />
      </CardContent>
    </Card>
  );
}
