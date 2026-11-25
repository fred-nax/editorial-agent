import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DashboardWelcome({
  workspaceName,
  cmsLabel,
  siteCaption,
}: {
  workspaceName?: string;
  cmsLabel?: string;
  siteCaption?: string;
} = {}) {
  const spaceLabel = workspaceName?.trim() || "votre espace";
  const cms = cmsLabel?.trim() || "CMS";
  const site = siteCaption?.trim();

  return (
    <section
      aria-labelledby="dashboard-welcome-title"
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#FFF5EC] to-[#E8F5F1] px-5 py-5 sm:px-7 sm:py-6 lg:px-8 lg:py-6"
    >
      <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-6">
        <div className="relative z-10 max-w-xl space-y-3">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-naxialis-muted uppercase">
            {site ? `${cms} · ${site}` : `Espace ${spaceLabel}`}
          </p>
          <h2
            id="dashboard-welcome-title"
            className="text-[1.65rem] font-semibold tracking-tight text-[#0F172A] sm:text-[1.75rem]"
          >
            Bonjour, bienvenue
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-slate-600 sm:text-[15px]">
            Une nouvelle idée d&apos;article&nbsp;? Votre assistant éditorial est
            prêt à vous accompagner pour rechercher, rédiger et préparer vos
            brouillons {cms} dans l&apos;espace {spaceLabel}.
          </p>
          <Button
            size="lg"
            className="mt-0.5 h-10 bg-naxialis px-5 text-sm text-white hover:bg-naxialis-dark"
            nativeButton={false}
            render={<Link href="/articles/new" />}
          >
            Créer un article
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>

        <div className="relative mx-auto hidden w-full max-w-[390px] items-center justify-center justify-self-end lg:flex">
          {/* SVG local — décoratif ; remplacer le fichier sans changer le chemin. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/editorial-welcome.svg"
            alt=""
            width={420}
            height={280}
            className="h-auto w-[108%] max-w-none select-none object-contain"
            decoding="async"
          />
        </div>
      </div>
    </section>
  );
}
