"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { GenerationProgress } from "@/components/GenerationProgress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AGENT_DECIDES_VALUE,
  AUDIENCE_OPTIONS,
  CUSTOM_OPTION_VALUE,
  LANGUAGE_OPTIONS,
  MAX_EDITORIAL_AUDIENCE_LENGTH,
  MAX_EDITORIAL_OBJECTIVE_LENGTH,
  OBJECTIVE_OPTIONS,
} from "@/lib/editorial-context";
import type { GenerationStatus } from "@/lib/status";

type GenerationSnapshot = {
  id: string;
  status: GenerationStatus;
  title: string | null;
  wpPostId: number | null;
  wpUrl: string | null;
  error: string | null;
  subject?: string | null;
  progressStage?: string | null;
  progressMessage?: string | null;
  progressUpdatedAt?: string | null;
  createdAt?: string | null;
  durationMs?: number | null;
};

const POLL_MS = 2500;

function statusLabel(
  phase: "idle" | "preparing" | GenerationStatus
): string {
  if (phase === "idle") {
    return "Générer l’article";
  }
  if (phase === "preparing") {
    return "Préparation…";
  }
  if (phase === "queued") {
    return "En attente";
  }
  if (phase === "running") {
    return "Génération en cours";
  }
  if (phase === "completed") {
    return "Brouillon créé";
  }
  if (phase === "failed") {
    return "Échec";
  }
  return "Générer l’article";
}

export function ArticleForm({
  layout = "full",
}: {
  /** `embedded` : version compacte pour la carte Dashboard. */
  layout?: "full" | "embedded";
} = {}) {
  const router = useRouter();
  const isFull = layout === "full";
  const [subject, setSubject] = useState("");
  const [angle, setAngle] = useState("");
  const [language, setLanguage] = useState(AGENT_DECIDES_VALUE);
  const [audience, setAudience] = useState(AGENT_DECIDES_VALUE);
  const [audienceCustom, setAudienceCustom] = useState("");
  const [objective, setObjective] = useState(AGENT_DECIDES_VALUE);
  const [objectiveCustom, setObjectiveCustom] = useState("");
  const [seoKeywords, setSeoKeywords] = useState("");
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<"idle" | "preparing" | GenerationStatus>(
    "idle"
  );
  const [generation, setGeneration] = useState<GenerationSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const lastProgressRef = useRef<string | null>(null);

  const busy = phase === "preparing" || phase === "queued" || phase === "running";

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function resetOutcomeState() {
    if (phase === "completed" || phase === "failed") {
      setPhase("idle");
      setGeneration(null);
      setError(null);
      setStartedAt(null);
    }
  }

  function startPolling(id: string) {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/articles/${id}`);
        const payload = (await response.json()) as GenerationSnapshot & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Suivi impossible.");
        }

        setGeneration(payload);
        setPhase(payload.status);

        const progressKey = `${payload.status}:${payload.progressStage ?? ""}:${payload.progressMessage ?? ""}`;
        if (lastProgressRef.current !== progressKey) {
          lastProgressRef.current = progressKey;
          router.refresh();
        }

        if (payload.status === "completed" || payload.status === "failed") {
          stopPolling();
          if (payload.status === "failed") {
            setError(payload.error ?? "La génération a échoué.");
          }
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Suivi impossible.");
      }
    }, POLL_MS);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }

    const value = subject.trim();
    if (!value) {
      return;
    }

    const resolvedAudience =
      audience === CUSTOM_OPTION_VALUE
        ? audienceCustom.trim()
        : audience !== AGENT_DECIDES_VALUE
          ? audience
          : "";
    const resolvedObjective =
      objective === CUSTOM_OPTION_VALUE
        ? objectiveCustom.trim()
        : objective !== AGENT_DECIDES_VALUE
          ? objective
          : "";

    if (audience === CUSTOM_OPTION_VALUE && !resolvedAudience) {
      setError("Précisez le public cible personnalisé.");
      return;
    }
    if (objective === CUSTOM_OPTION_VALUE && !resolvedObjective) {
      setError("Précisez l’objectif éditorial personnalisé.");
      return;
    }

    setError(null);
    setGeneration(null);
    setPhase("preparing");
    setStartedAt(new Date().toISOString());
    lastProgressRef.current = null;

    const payloadBody: Record<string, string> = { subject: value };
    if (angle.trim()) {
      payloadBody.angle = angle.trim();
    }
    if (language && language !== AGENT_DECIDES_VALUE) {
      payloadBody.language = language;
    }
    if (resolvedAudience) {
      payloadBody.audience = resolvedAudience;
    }
    if (resolvedObjective) {
      payloadBody.objective = resolvedObjective;
    }
    if (seoKeywords.trim()) {
      payloadBody.seoKeywords = seoKeywords.trim();
    }
    if (notes.trim()) {
      payloadBody.notes = notes.trim();
    }

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody),
      });
      const payload = (await response.json()) as {
        id?: string;
        status?: GenerationStatus;
        progressStage?: string | null;
        progressMessage?: string | null;
        progressUpdatedAt?: string | null;
        createdAt?: string;
        error?: string;
      };

      if (!response.ok || !payload.id) {
        throw new Error(payload.error ?? "Impossible de lancer la génération.");
      }

      setGeneration({
        id: payload.id,
        status: payload.status ?? "queued",
        title: null,
        wpPostId: null,
        wpUrl: null,
        error: null,
        subject: value,
        progressStage: payload.progressStage ?? "queued",
        progressMessage: payload.progressMessage ?? "En file d’attente…",
        progressUpdatedAt: payload.progressUpdatedAt ?? null,
        createdAt: payload.createdAt ?? new Date().toISOString(),
      });
      setPhase(payload.status ?? "queued");
      startPolling(payload.id);
    } catch (err) {
      setPhase("failed");
      setError(err instanceof Error ? err.message : "La génération a échoué.");
    }
  }

  const showProgress =
    generation &&
    (phase === "preparing" ||
      phase === "queued" ||
      phase === "running" ||
      phase === "failed");

  const fields = (
    <>
      <div className="space-y-2">
        <Label htmlFor="article-subject" className="text-[#0F172A]">
          Sujet de l’article
        </Label>
        <Textarea
          id="article-subject"
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
            resetOutcomeState();
          }}
          rows={3}
          required
          disabled={busy}
          placeholder="Ex. Comment automatiser les tâches répétitives d'une PME avec un agent IA ?"
          className="border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-slate-400 focus-visible:border-naxialis focus-visible:ring-naxialis/20"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="article-angle" className="text-[#0F172A]">
          Angle éditorial
          <span className="font-normal text-slate-500"> (facultatif)</span>
        </Label>
        <Textarea
          id="article-angle"
          value={angle}
          onChange={(event) => {
            setAngle(event.target.value);
            resetOutcomeState();
          }}
          rows={2}
          disabled={busy}
          placeholder="Ex. Présenter cinq cas d'usage concrets, leurs bénéfices et leurs limites."
          className="border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-slate-400 focus-visible:border-naxialis focus-visible:ring-naxialis/20"
        />
        <p className="text-xs text-slate-500">
          Précisez la manière dont vous souhaitez aborder le sujet.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-[#0F172A]">
          Langue de rédaction
          <span className="font-normal text-slate-500"> (facultatif)</span>
        </Label>
        <Select
          value={language}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setLanguage(value);
              resetOutcomeState();
            }
          }}
          disabled={busy}
        >
          <SelectTrigger className="h-9 w-full border-[#E2E8F0] bg-white md:max-w-md">
            <SelectValue placeholder="Laisser l'agent décider" />
          </SelectTrigger>
          <SelectContent align="start" className="w-(--anchor-width)">
            <SelectItem value={AGENT_DECIDES_VALUE}>
              Laisser l&apos;agent décider
            </SelectItem>
            {LANGUAGE_OPTIONS.map((option) => (
              <SelectItem key={option.code} value={option.code}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-[#0F172A]">
            Public cible
            <span className="font-normal text-slate-500"> (facultatif)</span>
          </Label>
          <Select
            value={audience}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setAudience(value);
                resetOutcomeState();
              }
            }}
            disabled={busy}
          >
            <SelectTrigger className="h-9 w-full border-[#E2E8F0] bg-white">
              <SelectValue placeholder="Laisser l'agent décider" />
            </SelectTrigger>
            <SelectContent align="start" className="w-(--anchor-width)">
              <SelectItem value={AGENT_DECIDES_VALUE}>
                Laisser l&apos;agent décider
              </SelectItem>
              {AUDIENCE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_OPTION_VALUE}>
                Autre (personnaliser…)
              </SelectItem>
            </SelectContent>
          </Select>
          {audience === CUSTOM_OPTION_VALUE ? (
            <Input
              id="article-audience-custom"
              value={audienceCustom}
              onChange={(event) => {
                setAudienceCustom(event.target.value);
                resetOutcomeState();
              }}
              disabled={busy}
              maxLength={MAX_EDITORIAL_AUDIENCE_LENGTH}
              placeholder="Ex. Directeurs informatiques de PME industrielles"
              aria-label="Public cible personnalisé"
              className="border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-slate-400 focus-visible:border-naxialis focus-visible:ring-naxialis/20"
            />
          ) : null}
        </div>

        <div className="space-y-2">
          <Label className="text-[#0F172A]">
            Objectif éditorial
            <span className="font-normal text-slate-500"> (facultatif)</span>
          </Label>
          <Select
            value={objective}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setObjective(value);
                resetOutcomeState();
              }
            }}
            disabled={busy}
          >
            <SelectTrigger className="h-9 w-full border-[#E2E8F0] bg-white">
              <SelectValue placeholder="Laisser l'agent décider" />
            </SelectTrigger>
            <SelectContent align="start" className="w-(--anchor-width)">
              <SelectItem value={AGENT_DECIDES_VALUE}>
                Laisser l&apos;agent décider
              </SelectItem>
              {OBJECTIVE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_OPTION_VALUE}>
                Autre (personnaliser…)
              </SelectItem>
            </SelectContent>
          </Select>
          {objective === CUSTOM_OPTION_VALUE ? (
            <Input
              id="article-objective-custom"
              value={objectiveCustom}
              onChange={(event) => {
                setObjectiveCustom(event.target.value);
                resetOutcomeState();
              }}
              disabled={busy}
              maxLength={MAX_EDITORIAL_OBJECTIVE_LENGTH}
              placeholder="Ex. Sensibiliser aux risques de sécurité des agents IA"
              aria-label="Objectif éditorial personnalisé"
              className="border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-slate-400 focus-visible:border-naxialis focus-visible:ring-naxialis/20"
            />
          ) : null}
        </div>
      </div>

      <Accordion>
        <AccordionItem value="advanced" className="border-[#E2E8F0]">
          <AccordionTrigger className="text-[#0F172A] hover:no-underline">
            Options avancées
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pb-1">
              <div className="space-y-2">
                <Label htmlFor="article-keywords" className="text-[#0F172A]">
                  Mots-clés SEO
                  <span className="font-normal text-slate-500"> (facultatif)</span>
                </Label>
                <Input
                  id="article-keywords"
                  value={seoKeywords}
                  onChange={(event) => {
                    setSeoKeywords(event.target.value);
                    resetOutcomeState();
                  }}
                  disabled={busy}
                  placeholder="agent IA PME, automatisation entreprise, productivité"
                  className="border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-slate-400 focus-visible:border-naxialis focus-visible:ring-naxialis/20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="article-notes" className="text-[#0F172A]">
                  Consignes complémentaires
                  <span className="font-normal text-slate-500"> (facultatif)</span>
                </Label>
                <Textarea
                  id="article-notes"
                  value={notes}
                  onChange={(event) => {
                    setNotes(event.target.value);
                    resetOutcomeState();
                  }}
                  rows={3}
                  disabled={busy}
                  placeholder="Ex. Ajouter des exemples de solutions open source et évoquer les limites de sécurité."
                  className="border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-slate-400 focus-visible:border-naxialis focus-visible:ring-naxialis/20"
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {isFull ? (
        <Card className="border border-[#E2E8F0] bg-white shadow-none ring-0">
          <CardHeader className="gap-1.5 border-b border-[#E2E8F0] p-5">
            <CardTitle className="text-base font-semibold text-[#0F172A]">
              Préparer votre article
            </CardTitle>
            <CardDescription className="text-sm text-slate-600">
              Indiquez le sujet et, si besoin, des préférences pour orienter la
              rédaction.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-5">{fields}</CardContent>
        </Card>
      ) : (
        <div className="space-y-5">{fields}</div>
      )}

      <p className="text-sm leading-relaxed text-slate-600">
        Ces paramètres orientent la rédaction sans remplacer les consignes de
        votre agent. Vous pourrez modifier librement le brouillon dans WordPress
        avant publication.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="submit"
          disabled={busy}
          size="lg"
          className="bg-naxialis text-white hover:bg-naxialis-dark"
        >
          {statusLabel(busy ? phase : "idle")}
        </Button>
        {phase !== "idle" && !showProgress ? (
          <p className="text-xs text-slate-500">{statusLabel(phase)}</p>
        ) : null}
      </div>

      {showProgress ? (
        <GenerationProgress
          status={phase === "preparing" ? "queued" : phase}
          progressStage={generation.progressStage}
          progressMessage={
            phase === "preparing"
              ? "Préparation de la génération…"
              : generation.progressMessage
          }
          createdAt={generation.createdAt ?? startedAt}
          durationMs={generation.durationMs}
          wpPostId={generation.wpPostId}
          subject={generation.subject ?? subject}
        />
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {generation && phase === "completed" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
          <p className="font-medium">{generation.title ?? "Brouillon créé"}</p>
          {generation.wpPostId ? (
            <p className="mt-1 text-emerald-900">
              WordPress #{generation.wpPostId}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {generation.wpUrl ? (
              <Button
                size="sm"
                className="bg-naxialis text-white hover:bg-naxialis-dark"
                nativeButton={false}
                render={
                  <a href={generation.wpUrl} target="_blank" rel="noreferrer" />
                }
              >
                Ouvrir dans WordPress
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
              nativeButton={false}
              render={<Link href={`/articles/${generation.id}`} />}
            >
              Voir le détail
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
