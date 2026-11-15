"use client";

import { useState } from "react";
import {
  CircleHelp,
  FolderOpen,
  Lightbulb,
  ListChecks,
  Radar,
  Search,
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

const STEPS = [
  {
    icon: Search,
    title: "1. Lancer une recherche",
    body: "Indiquez une thématique, une période (7, 30 ou 90 jours) et une zone géographique, puis lancez « Rechercher les actualités ». La veille explore le web et ne crée aucun contenu WordPress.",
  },
  {
    icon: ListChecks,
    title: "2. Explorer les publications",
    body: "Parcourez les résultats confirmés, filtrez par type (actualités, études, guides) et triez par date vérifiée ou par ordre de recherche. Ouvrez la source pour vérifier le contexte.",
  },
  {
    icon: Sparkles,
    title: "3. Suggérer trois sujets SEO",
    body: "Sur une publication, demandez trois propositions de titres et d’angles. Vous choisissez ensuite celle à transformer en sujet éditorial — rien n’est écrit ni publié automatiquement.",
  },
  {
    icon: Lightbulb,
    title: "4. Proposer un sujet",
    body: "Ajoutez une idée à la file éditoriale à partir de la publication (titre et angle modifiables). La rédaction reste manuelle dans les autres écrans de l’application.",
  },
  {
    icon: FolderOpen,
    title: "5. Retrouver ses recherches enregistrées",
    body: "Chaque recherche réussie est conservée. « Ouvrir » recharge les publications déjà vérifiées sans nouvel appel ; « Relancer » refait une recherche avec les mêmes paramètres.",
  },
] as const;

const HOW_RESULTS_ARE_FOUND = [
  {
    title: "1. Vos critères de recherche",
    body: "La thématique oriente la requête. La période (7, 30 ou 90 jours) définit la fenêtre : ce qui est trop ancien est écarté. La zone précise le cadre — un pays (France, Belgique, Suisse, Canada, Luxembourg), les États-Unis en anglais, ou une recherche internationale en anglais.",
  },
  {
    title: "2. Découverte des publications",
    body: "La recherche web est lancée via OpenAI et son outil de recherche web intégré. L’assistant reçoit votre thématique, la période et la zone, puis propose une liste courte de publications trouvées en ligne — pas un classement Google ni une mesure de popularité. Pour un pays, la recherche est localisée. Pour les États-Unis, elle vise le marché américain en anglais. Pour l’international, elle reste mondiale en anglais, sans forcer un seul pays.",
  },
  {
    title: "3. Préparation et classement",
    body: "Seules les propositions dont l’URL figure aussi dans les sources renvoyées par la recherche sont conservées. Les liens sont normalisés, les doublons d’URL fusionnés. Titres et résumés viennent de cette recherche. Chaque publication reçoit ensuite un type (actualité, étude, guide, ou non classé) d’après le titre, le résumé et l’adresse. Jusqu’à 12 résultats confirmés sont affichés, en privilégiant ceux dont la date a pu être vérifiée.",
  },
  {
    title: "4. Dates, sources et limites",
    body: "Une date n’est affichée comme vérifiée que si elle est confirmée par les sources de la recherche ou, lorsque c’est possible, par les métadonnées de publication de la page. Sinon : « Date non vérifiée » — aucune date n’est inventée. Des propositions peuvent être écartées (URL non confirmée, doublon, hors période). La pertinence reste indicative : croisez toujours avec la source d’origine.",
  },
  {
    title: "5. Votre rôle",
    body: "Ouvrez les liens, validez le contexte et choisissez ce qui mérite un sujet éditorial. « Ouvrir » une recherche enregistrée réaffiche le résultat déjà sauvegardé sans relancer la recherche web ; « Relancer » refait une vraie recherche avec les mêmes paramètres.",
  },
] as const;

export function VeilleHelpDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Comment ça marche ?"
          />
        }
      >
        <CircleHelp className="size-4" aria-hidden />
        <span className="hidden sm:inline">Comment ça marche ?</span>
      </DialogTrigger>

      <DialogContent className="max-h-[min(90vh,42rem)] max-w-[40.625rem] gap-5 overflow-y-auto sm:p-6">
        <DialogHeader>
          <DialogTitle>Comment ça marche ?</DialogTitle>
          <DialogDescription>
            Les étapes d’usage de la veille éditoriale, puis la façon dont les
            résultats sont réellement trouvés — sans publication automatique sur
            WordPress.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-4">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="flex gap-3">
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#0F5270]">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {step.title}
                  </p>
                  <p className="text-sm leading-relaxed text-slate-600">
                    {step.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <section
          aria-labelledby="veille-help-how-found-title"
          className="space-y-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 sm:p-4"
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-[#0F5270]">
              <Radar className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 space-y-1">
              <h3
                id="veille-help-how-found-title"
                className="text-sm font-semibold text-slate-900"
              >
                Comment les résultats sont-ils trouvés ?
              </h3>
              <p className="text-sm leading-relaxed text-slate-600">
                Voici le parcours réel d’une recherche, du formulaire jusqu’à la
                liste affichée.
              </p>
            </div>
          </div>

          <ol className="space-y-3 border-t border-[#E2E8F0] pt-3">
            {HOW_RESULTS_ARE_FOUND.map((item) => (
              <li key={item.title} className="space-y-1">
                <p className="text-sm font-medium text-slate-900">{item.title}</p>
                <p className="text-sm leading-relaxed text-slate-600">
                  {item.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <div className="space-y-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-sm text-slate-600">
          <p>
            Les dates des sources ne sont pas toujours vérifiées. Lorsqu’une date
            n’a pas pu être confirmée, elle est affichée comme « Date non
            vérifiée » — aucune date ni niveau de fiabilité n’est inventé.
          </p>
          <p>
            Aucun article WordPress n’est publié automatiquement depuis cet
            écran.
          </p>
        </div>

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
