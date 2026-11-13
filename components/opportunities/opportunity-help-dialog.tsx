"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CircleHelp,
  Database,
  Gauge,
  PenLine,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const SECTIONS = [
  {
    icon: Database,
    title: "1. D’où viennent les opportunités ?",
    body: "Elles ne viennent pas de Google Search Console ni de volumes de mots-clés. Une recherche manuelle demande à un modèle OpenAI, via l’outil web_search, de proposer des pistes documentées (titre, angle, intention, 1 à 3 URLs sourcées). Le catalogue de domaines Naxialis (ou un sujet libre) et l’objectif choisi (SEO/GEO, tendances, problèmes, commercial) orientent cette exploration. L’inventaire WordPress, synchronisé séparément en lecture seule, sert ensuite à détecter les proximités et doublons — pas à inventer les idées.",
  },
  {
    icon: Sparkles,
    title: "2. Comment sont-elles générées ?",
    body: "Rien n’est planifié automatiquement : vous lancez « Rechercher des opportunités » (éventuellement après « Configurer la recherche »). Le moteur appelle OpenAI domaine par domaine (ou pour le sujet libre), déduplique les candidats en local, et peut demander une confirmation IA seulement sur quelques paires ambiguës. Chaque idée nouvelle est comparée à vos articles WP et à la file de sujets ; les quasi-doublons forts sont écartés. Les opportunités retenues sont enregistrées avec le statut Nouvelle. Une opportunité déjà connue (même empreinte) peut être mise à jour (sources, tendance) sans être recréée.",
  },
  {
    icon: Gauge,
    title: "3. Comment sont-elles évaluées ?",
    body: "Le score total /100 est un score éditorial interne : pertinence thématique, potentiel commercial (signaux textuels), intention de recherche déclarée, fraîcheur des sources datées, et originalité face au blog / à la file. Ce n’est ni un volume de recherche, ni une difficulté SEO, ni une métrique Google. Le type (actualité, evergreen, commercial) vient surtout de la proposition IA. La tendance (émergente, actualité, evergreen, non vérifiée), son score, sa confiance et l’urgence éditoriale (faible / moyenne / élevée) sont calculés ensuite à partir des preuves sourcées observables (domaines distincts, dates, indices d’événement) — pas d’estimation de trafic.",
  },
  {
    icon: PenLine,
    title: "4. Comment exploiter les opportunités ?",
    body: "Filtrez par recherche passée, thématique, type, tendance, urgence et statut (Nouvelle, Revue, Ajoutée à la file, Écartée). Les cards du haut ouvrent rapidement la vue globale, l’urgence élevée ou les opportunités encore ouvertes. Ouvrez une fiche pour relire angle, sources, scores et rapprochements. « Ajouter à la file de sujets » crée (ou rattache) un sujet en attente, sans lancer la rédaction ; la priorité de file dérive du score (≥ 80 → haute, ≥ 60 → moyenne). « Écarter » archive l’idée. La rédaction et la publication se font ailleurs — ce module ne publie pas sur WordPress.",
  },
  {
    icon: AlertTriangle,
    title: "5. Quelles sont les limites ?",
    body: "Une opportunité n’est pas une garantie de positionnement ni de trafic. Le score interne n’est pas une mesure officielle Google. Les URLs et dates proposées dépendent de la recherche web au moment du lancement et peuvent être incomplètes ou à vérifier. Validez toujours la pertinence métier et éditoriale avant de rédiger. Les résultats changent selon les paramètres de recherche, la fraîcheur des sources et l’état de votre inventaire WordPress.",
  },
] as const;

export function OpportunityHelpDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          />
        }
      >
        <CircleHelp className="size-3.5" aria-hidden />
        Aide
      </DialogTrigger>

      <DialogContent className="max-w-[40.625rem] gap-5 sm:p-6">
        <DialogHeader>
          <DialogTitle>Comment fonctionnent les opportunités SEO ?</DialogTitle>
          <DialogDescription>
            Cette rubrique explique la provenance, la génération et la fiabilité
            des pistes proposées — pour décider en connaissance de cause.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-4">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <li key={section.title} className="flex gap-3">
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#0F5270]">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {section.title}
                  </p>
                  <p className="text-sm leading-relaxed text-slate-600">
                    {section.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <DialogFooter>
          <DialogClose
            render={
              <Button
                type="button"
                className="bg-naxialis text-white hover:bg-naxialis-dark"
              />
            }
          >
            Compris
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
