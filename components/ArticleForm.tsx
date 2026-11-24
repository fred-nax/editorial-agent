"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Loader2, Sparkles } from "lucide-react";
import {
  CmsDestinationPicker,
  type CmsAgentStatusView,
  type CmsDestinationOptionView,
} from "@/components/cms/CmsDestinationPicker";
import { EditorialRapprochementPanel } from "@/components/EditorialRapprochementPanel";
import { GenerationProgress } from "@/components/GenerationProgress";
import { TitleSuggestionsPicker } from "@/components/TitleSuggestionsPicker";
import type { CmsDestinationId } from "@/lib/cms/types";
import { DEFAULT_CMS_DESTINATION } from "@/lib/cms/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  FEATURED_IMAGE_ASPECTS,
  FEATURED_IMAGE_STYLES,
  MAX_VISUAL_INSTRUCTIONS_LENGTH,
} from "@/lib/images/config";
import type { FeaturedImagePublic } from "@/lib/images/types";
import type { TitleSuggestion } from "@/lib/titles/types";
import type { GenerationStatus } from "@/lib/status";

type GenerationSnapshot = {
  id: string;
  status: GenerationStatus;
  title: string | null;
  wpPostId: number | null;
  wpUrl: string | null;
  cmsDestination?: string | null;
  cmsExternalId?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  error: string | null;
  subject?: string | null;
  progressStage?: string | null;
  progressMessage?: string | null;
  progressUpdatedAt?: string | null;
  createdAt?: string | null;
  durationMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCost?: number | null;
  featuredImage?: FeaturedImagePublic | null;
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

export type ArticleFormInitial = {
  topicId?: string;
  subject?: string;
  angle?: string;
  notes?: string;
  preferredTitle?: string;
};

export function ArticleForm({
  layout = "full",
  initial,
}: {
  /** `embedded` : version compacte pour la carte Dashboard. */
  layout?: "full" | "embedded";
  /** Préremplissage depuis la file éditoriale (`/articles/new?topicId=…`). */
  initial?: ArticleFormInitial;
} = {}) {
  const router = useRouter();
  const isFull = layout === "full";
  const reactId = useId();
  const formId = `article-generation-form-${reactId.replaceAll(":", "")}`;
  const topicId = initial?.topicId?.trim() || null;
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [cmsDestination, setCmsDestination] = useState<CmsDestinationId>(
    DEFAULT_CMS_DESTINATION
  );
  const [cmsAgents, setCmsAgents] = useState<CmsAgentStatusView[]>([]);
  const [cmsDestinations, setCmsDestinations] = useState<
    CmsDestinationOptionView[]
  >([]);
  const [angle, setAngle] = useState(initial?.angle ?? "");
  const [language, setLanguage] = useState(AGENT_DECIDES_VALUE);
  const [audience, setAudience] = useState(AGENT_DECIDES_VALUE);
  const [audienceCustom, setAudienceCustom] = useState("");
  const [objective, setObjective] = useState(AGENT_DECIDES_VALUE);
  const [objectiveCustom, setObjectiveCustom] = useState("");
  const [seoKeywords, setSeoKeywords] = useState("");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [generateFeaturedImage, setGenerateFeaturedImage] = useState(false);
  const [featuredStyle, setFeaturedStyle] = useState("photographic");
  const [featuredAspect, setFeaturedAspect] = useState("3:2");
  const [featuredInstructions, setFeaturedInstructions] = useState("");
  const [featuredImageRequested, setFeaturedImageRequested] = useState(false);
  const [titleSuggestions, setTitleSuggestions] = useState<
    TitleSuggestion[] | null
  >(null);
  const [titleSuggestBusy, setTitleSuggestBusy] = useState(false);
  const [titleSuggestError, setTitleSuggestError] = useState<string | null>(
    null
  );
  const [suggestionsFingerprint, setSuggestionsFingerprint] = useState<
    string | null
  >(null);
  const [suggestionsStale, setSuggestionsStale] = useState(false);
  const initialPreferred = initial?.preferredTitle?.trim() ?? "";
  const [leaveAgentTitle, setLeaveAgentTitle] = useState(!initialPreferred);
  const [preferredTitle, setPreferredTitle] = useState(initialPreferred);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<
    number | null
  >(null);
  const [titlesDialogOpen, setTitlesDialogOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "preparing" | GenerationStatus>(
    "idle"
  );
  const [generation, setGeneration] = useState<GenerationSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const lastProgressRef = useRef<string | null>(null);

  const busy = phase === "preparing" || phase === "queued" || phase === "running";
  const featuredStatus = generation?.featuredImage?.status ?? null;
  const featuredBusy =
    featuredImageRequested &&
    (featuredStatus === "pending" ||
      featuredStatus === "generating" ||
      (phase === "completed" && !featuredStatus));

  function resolvedAudienceValue() {
    if (audience === CUSTOM_OPTION_VALUE) {
      return audienceCustom.trim();
    }
    return audience !== AGENT_DECIDES_VALUE ? audience : "";
  }

  function resolvedObjectiveValue() {
    if (objective === CUSTOM_OPTION_VALUE) {
      return objectiveCustom.trim();
    }
    return objective !== AGENT_DECIDES_VALUE ? objective : "";
  }

  function titleContextFingerprint() {
    return JSON.stringify({
      subject: subject.trim(),
      angle: angle.trim(),
      language,
      audience: resolvedAudienceValue(),
      objective: resolvedObjectiveValue(),
      seoKeywords: seoKeywords.trim(),
    });
  }

  function invalidateTitleSuggestions() {
    if (!titleSuggestions && leaveAgentTitle && !preferredTitle.trim()) {
      return;
    }
    if (titleSuggestions && suggestionsFingerprint) {
      const current = titleContextFingerprint();
      if (current !== suggestionsFingerprint) {
        setSuggestionsStale(true);
        setLeaveAgentTitle(true);
        setPreferredTitle("");
        setSelectedSuggestionIndex(null);
      }
    }
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/cms/destinations", {
          credentials: "same-origin",
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          agents?: CmsAgentStatusView[];
          destinations?: Array<{
            id: CmsDestinationId;
            label: string;
            description?: string;
            selectable?: boolean;
            readiness?: { ok?: boolean; reasons?: string[] } | null;
          }>;
        };
        if (!cancelled && Array.isArray(payload.agents)) {
          setCmsAgents(payload.agents);
        }
        if (!cancelled && Array.isArray(payload.destinations)) {
          setCmsDestinations(
            payload.destinations.map((item) => ({
              id: item.id,
              label: item.label,
              description: item.description,
              selectable: Boolean(item.selectable),
              readinessReasons: item.readiness?.reasons ?? [],
            }))
          );
        }
      } catch {
        // Silencieux : le sélecteur reste utilisable sans statut agent.
      }
    })();
    return () => {
      cancelled = true;
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
      setFeaturedImageRequested(false);
    }
  }

  function clearTitleSelection() {
    setLeaveAgentTitle(true);
    setPreferredTitle("");
    setSelectedSuggestionIndex(null);
  }

  function selectTitleSuggestion(index: number, title: string) {
    setLeaveAgentTitle(false);
    setSelectedSuggestionIndex(index);
    setPreferredTitle(title);
    setSuggestionsStale(false);
  }

  function updatePreferredTitle(value: string) {
    setPreferredTitle(value);
    setSelectedSuggestionIndex(null);
    setLeaveAgentTitle(false);
  }

  function openTitleSuggestionsDialog() {
    setTitlesDialogOpen(true);
    if (!titleSuggestions || suggestionsStale) {
      void requestTitleSuggestions();
    }
  }

  async function requestTitleSuggestions() {
    const value = subject.trim();
    if (!value || titleSuggestBusy || busy) {
      return;
    }
    setTitleSuggestBusy(true);
    setTitleSuggestError(null);
    clearTitleSelection();
    try {
      const body: Record<string, string> = { subject: value };
      if (angle.trim()) body.angle = angle.trim();
      if (language && language !== AGENT_DECIDES_VALUE) {
        body.language = language;
      }
      const aud = resolvedAudienceValue();
      const obj = resolvedObjectiveValue();
      if (aud) body.audience = aud;
      if (obj) body.objective = obj;
      if (seoKeywords.trim()) body.seoKeywords = seoKeywords.trim();

      const response = await fetch("/api/titles/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        suggestions?: TitleSuggestion[];
        error?: string;
      };
      if (!response.ok || !payload.suggestions) {
        throw new Error(payload.error ?? "Impossible de suggérer des titres.");
      }
      setTitleSuggestions(payload.suggestions);
      setSuggestionsFingerprint(titleContextFingerprint());
      setSuggestionsStale(false);
    } catch (err) {
      setTitleSuggestError(
        err instanceof Error ? err.message : "Suggestion impossible."
      );
    } finally {
      setTitleSuggestBusy(false);
    }
  }

  function startPolling(id: string, expectFeaturedImage: boolean) {
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

        const featuredKey = payload.featuredImage?.status ?? "";
        const progressKey = `${payload.status}:${payload.progressStage ?? ""}:${payload.progressMessage ?? ""}:${featuredKey}`;
        if (lastProgressRef.current !== progressKey) {
          lastProgressRef.current = progressKey;
          router.refresh();
        }

        if (payload.status === "failed") {
          stopPolling();
          setError(payload.error ?? "La génération a échoué.");
          router.refresh();
          return;
        }

        if (payload.status === "completed") {
          const imageStatus = payload.featuredImage?.status ?? null;
          const imageDone =
            !expectFeaturedImage ||
            imageStatus === "ready" ||
            imageStatus === "failed" ||
            imageStatus === "attached" ||
            imageStatus === "uploading";
          if (imageDone) {
            stopPolling();
            router.refresh();
          }
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

    const resolvedAudience = resolvedAudienceValue();
    const resolvedObjective = resolvedObjectiveValue();

    if (audience === CUSTOM_OPTION_VALUE && !resolvedAudience) {
      setError("Précisez le public cible personnalisé.");
      return;
    }
    if (objective === CUSTOM_OPTION_VALUE && !resolvedObjective) {
      setError("Précisez l’objectif éditorial personnalisé.");
      return;
    }

    if (
      suggestionsStale ||
      (suggestionsFingerprint &&
        suggestionsFingerprint !== titleContextFingerprint())
    ) {
      clearTitleSelection();
      setSuggestionsStale(true);
    }

    const titlePreference =
      !leaveAgentTitle && preferredTitle.trim()
        ? preferredTitle.trim()
        : "";

    setError(null);
    setGeneration(null);
    setPhase("preparing");
    setStartedAt(new Date().toISOString());
    lastProgressRef.current = null;

    const wantFeatured =
      isFull && generateFeaturedImage && cmsDestination !== "webflow";
    setFeaturedImageRequested(wantFeatured);

    const payloadBody: Record<string, unknown> = {
      subject: value,
      cmsDestination,
    };
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
    if (titlePreference) {
      payloadBody.preferredTitle = titlePreference;
    }
    if (wantFeatured) {
      payloadBody.featuredImage = {
        enabled: true,
        style: featuredStyle,
        aspectRatio: featuredAspect,
        instructions: featuredInstructions.trim() || undefined,
      };
    }

    try {
      if (topicId) {
        const syncResponse = await fetch(`/api/topics/${topicId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: value,
            angle: angle.trim() || null,
            notes: notes.trim() || null,
          }),
        });
        const syncPayload = (await syncResponse.json()) as { error?: string };
        if (!syncResponse.ok) {
          throw new Error(
            syncPayload.error ?? "Impossible de synchroniser le sujet."
          );
        }
        payloadBody.topicId = topicId;
      }

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
        featuredImageRequested?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.id) {
        throw new Error(payload.error ?? "Impossible de lancer la génération.");
      }

      const expectFeatured = Boolean(payload.featuredImageRequested);
      setFeaturedImageRequested(expectFeatured);

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
        featuredImage: expectFeatured
          ? {
              id: "pending",
              generationId: payload.id,
              style: featuredStyle,
              aspectRatio: featuredAspect,
              size: "",
              model: "",
              prompt: "",
              altText: null,
              altModel: null,
              status: "pending",
              wpMediaId: null,
              wpMediaUrl: null,
              error: null,
              fileUrl: "",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : null,
      });
      setPhase(payload.status ?? "queued");
      startPolling(payload.id, expectFeatured);
    } catch (err) {
      setPhase("failed");
      setFeaturedImageRequested(false);
      setError(err instanceof Error ? err.message : "La génération a échoué.");
    }
  }

  const showProgress =
    generation &&
    (phase === "preparing" ||
      phase === "queued" ||
      phase === "running" ||
      phase === "failed");

  const submitButton = (
    <Button
      type="submit"
      form={formId}
      disabled={busy}
      size="lg"
      className="h-10 w-full shrink-0 bg-naxialis text-sm text-white hover:bg-naxialis-dark sm:w-auto"
    >
      <Sparkles className="size-4" aria-hidden="true" />
      {statusLabel(busy ? phase : "idle")}
    </Button>
  );

  const fields = (
    <>
      <CmsDestinationPicker
        value={cmsDestination}
        onChange={(next) => {
          setCmsDestination(next);
          if (next === "webflow") {
            setGenerateFeaturedImage(false);
          }
          // Réinitialise l’issue et laisse EditorialRapprochementPanel
          // purger ses résultats via enabled=false.
          resetOutcomeState();
        }}
        disabled={busy}
        agents={cmsAgents}
        destinations={cmsDestinations}
      />

      <div className="space-y-2">
        <Label htmlFor={`${formId}-subject`} className="text-[#0F172A]">
          Sujet de l’article
        </Label>
        <Textarea
          id={`${formId}-subject`}
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
            resetOutcomeState();
            invalidateTitleSuggestions();
          }}
          rows={3}
          required
          disabled={busy}
          placeholder="Ex. Comment automatiser les tâches répétitives d'une PME avec un agent IA ?"
          className="border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-slate-400 focus-visible:border-naxialis focus-visible:ring-naxialis/20"
        />
      </div>

      <EditorialRapprochementPanel
        subject={subject}
        angle={angle}
        layout={isFull ? "full" : "compact"}
        disabled={busy}
        enabled={cmsDestination === "wordpress"}
      />

      {isFull ? (
        <section className="space-y-3 rounded-lg border border-[#E2E8F0] bg-slate-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[#0F172A]">
                Suggestions de titres
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Facultatif · l’agent reste libre d’ajuster le titre retenu
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-[#E2E8F0] bg-white"
              disabled={busy || titleSuggestBusy || !subject.trim()}
              onClick={() => void requestTitleSuggestions()}
            >
              {titleSuggestBusy ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Lightbulb data-icon="inline-start" />
              )}
              {titleSuggestions
                ? "Régénérer les propositions"
                : "Suggérer 5 titres"}
            </Button>
          </div>

          <TitleSuggestionsPicker
            formId={formId}
            radioName={`${formId}-title-choice`}
            busy={busy}
            titleSuggestBusy={titleSuggestBusy}
            titleSuggestError={titleSuggestError}
            suggestionsStale={suggestionsStale}
            titleSuggestions={titleSuggestions}
            leaveAgentTitle={leaveAgentTitle}
            preferredTitle={preferredTitle}
            selectedSuggestionIndex={selectedSuggestionIndex}
            onClearSelection={clearTitleSelection}
            onSelectSuggestion={selectTitleSuggestion}
            onPreferredTitleChange={updatePreferredTitle}
          />
        </section>
      ) : (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[#E2E8F0] bg-white"
            disabled={busy || !subject.trim()}
            onClick={openTitleSuggestionsDialog}
          >
            <Lightbulb data-icon="inline-start" />
            Suggérer des titres
          </Button>

          {!leaveAgentTitle && preferredTitle.trim() ? (
            <div className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-[#E2E8F0] bg-slate-50/80 px-3 py-2 text-xs text-[#0F172A]">
              <p className="min-w-0 flex-1 break-words">
                <span className="font-medium">Titre souhaité :</span>{" "}
                {preferredTitle.trim()}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="shrink-0 text-naxialis hover:bg-white hover:text-naxialis-dark"
                disabled={busy}
                onClick={openTitleSuggestionsDialog}
              >
                Modifier
              </Button>
            </div>
          ) : null}

          {suggestionsStale && titleSuggestions ? (
            <p className="text-xs text-amber-800">
              Les propositions de titres peuvent être obsolètes. Ouvrez à
              nouveau les suggestions pour les régénérer.
            </p>
          ) : null}

          <Dialog
            open={titlesDialogOpen}
            onOpenChange={(open) => setTitlesDialogOpen(open)}
          >
            <DialogContent className="gap-4">
              <DialogHeader>
                <DialogTitle>Suggestions de titres</DialogTitle>
                <DialogDescription>
                  Facultatif · l’agent reste libre d’ajuster le titre retenu
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-[#E2E8F0] bg-white"
                  disabled={busy || titleSuggestBusy || !subject.trim()}
                  onClick={() => void requestTitleSuggestions()}
                >
                  {titleSuggestBusy ? (
                    <Loader2
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  ) : (
                    <Lightbulb data-icon="inline-start" />
                  )}
                  {titleSuggestions
                    ? "Régénérer les propositions"
                    : "Suggérer 5 titres"}
                </Button>
              </div>

              <TitleSuggestionsPicker
                formId={`${formId}-embedded`}
                radioName={`${formId}-title-choice-embedded`}
                busy={busy}
                titleSuggestBusy={titleSuggestBusy}
                titleSuggestError={titleSuggestError}
                suggestionsStale={suggestionsStale}
                titleSuggestions={titleSuggestions}
                leaveAgentTitle={leaveAgentTitle}
                preferredTitle={preferredTitle}
                selectedSuggestionIndex={selectedSuggestionIndex}
                onClearSelection={clearTitleSelection}
                onSelectSuggestion={selectTitleSuggestion}
                onPreferredTitleChange={updatePreferredTitle}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#E2E8F0] bg-white"
                  onClick={() => setTitlesDialogOpen(false)}
                >
                  Fermer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`${formId}-angle`} className="text-[#0F172A]">
          Angle éditorial
          <span className="font-normal text-slate-500"> (facultatif)</span>
        </Label>
        <Textarea
          id={`${formId}-angle`}
          value={angle}
          onChange={(event) => {
            setAngle(event.target.value);
            resetOutcomeState();
            invalidateTitleSuggestions();
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
              invalidateTitleSuggestions();
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
                invalidateTitleSuggestions();
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
              id={`${formId}-audience-custom`}
              value={audienceCustom}
              onChange={(event) => {
                setAudienceCustom(event.target.value);
                resetOutcomeState();
                invalidateTitleSuggestions();
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
                invalidateTitleSuggestions();
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
              id={`${formId}-objective-custom`}
              value={objectiveCustom}
              onChange={(event) => {
                setObjectiveCustom(event.target.value);
                resetOutcomeState();
                invalidateTitleSuggestions();
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
                <Label htmlFor={`${formId}-keywords`} className="text-[#0F172A]">
                  Mots-clés SEO
                  <span className="font-normal text-slate-500"> (facultatif)</span>
                </Label>
                <Input
                  id={`${formId}-keywords`}
                  value={seoKeywords}
                  onChange={(event) => {
                    setSeoKeywords(event.target.value);
                    resetOutcomeState();
                    invalidateTitleSuggestions();
                  }}
                  disabled={busy}
                  placeholder="agent IA PME, automatisation entreprise, productivité"
                  className="border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-slate-400 focus-visible:border-naxialis focus-visible:ring-naxialis/20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${formId}-notes`} className="text-[#0F172A]">
                  Consignes complémentaires
                  <span className="font-normal text-slate-500"> (facultatif)</span>
                </Label>
                <Textarea
                  id={`${formId}-notes`}
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

      {isFull ? (
        <section className="space-y-4 rounded-lg border border-[#E2E8F0] bg-slate-50/60 p-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#0F172A]">Image à la une</p>
            {cmsDestination === "webflow" ? (
              <p className="text-xs text-amber-800">
                Non disponible pour Webflow dans cette version.
              </p>
            ) : null}
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-[#0F172A]">
              <input
                type="checkbox"
                className="mt-1 size-4 rounded border-[#E2E8F0] accent-naxialis"
                checked={generateFeaturedImage && cmsDestination !== "webflow"}
                disabled={busy || cmsDestination === "webflow"}
                onChange={(event) => {
                  setGenerateFeaturedImage(event.target.checked);
                  resetOutcomeState();
                }}
              />
              <span>Générer également une image à la une</span>
            </label>
          </div>

          {generateFeaturedImage && cmsDestination !== "webflow" ? (
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-slate-600">
                L’image sera générée après la création du brouillon. Vous pourrez
                vérifier son aperçu et son texte ALT avant de l’envoyer dans
                WordPress. Un appel API supplémentaire sera effectué.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[#0F172A]">Style visuel</Label>
                  <Select
                    value={featuredStyle}
                    onValueChange={(value) => {
                      if (typeof value === "string") {
                        setFeaturedStyle(value);
                        resetOutcomeState();
                      }
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger className="h-9 w-full border-[#E2E8F0] bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" className="w-(--anchor-width)">
                      {FEATURED_IMAGE_STYLES.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[#0F172A]">Format</Label>
                  <Select
                    value={featuredAspect}
                    onValueChange={(value) => {
                      if (typeof value === "string") {
                        setFeaturedAspect(value);
                        resetOutcomeState();
                      }
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger className="h-9 w-full border-[#E2E8F0] bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" className="w-(--anchor-width)">
                      {FEATURED_IMAGE_ASPECTS.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor={`${formId}-featured-instructions`}
                  className="text-[#0F172A]"
                >
                  Instructions visuelles
                  <span className="font-normal text-slate-500">
                    {" "}
                    (facultatif)
                  </span>
                </Label>
                <Textarea
                  id={`${formId}-featured-instructions`}
                  value={featuredInstructions}
                  onChange={(event) => {
                    setFeaturedInstructions(event.target.value);
                    resetOutcomeState();
                  }}
                  maxLength={MAX_VISUAL_INSTRUCTIONS_LENGTH}
                  rows={2}
                  disabled={busy}
                  placeholder="Bureau moderne, ambiance professionnelle, éclairage naturel."
                  className="border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-slate-400 focus-visible:border-naxialis focus-visible:ring-naxialis/20"
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );

  const formBody = (
    <form id={formId} onSubmit={handleSubmit} className="space-y-5">
      {fields}
    </form>
  );

  const formHint = (
    <p className="text-sm leading-relaxed text-slate-600">
      {cmsDestination === "webflow"
        ? "Ces paramètres orientent la rédaction sans remplacer les consignes de votre agent. Le brouillon sera créé dans Webflow CMS (non publié) ; finalisez-le ensuite dans Webflow."
        : "Ces paramètres orientent la rédaction sans remplacer les consignes de votre agent. Vous pourrez modifier librement le brouillon dans WordPress avant publication."}
    </p>
  );

  const statusPanel = (
    <>
      {phase !== "idle" && !showProgress ? (
        <p className="text-xs text-slate-500">{statusLabel(phase)}</p>
      ) : null}

      {showProgress && generation ? (
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
          cmsDestination={generation.cmsDestination ?? cmsDestination}
          cmsExternalId={generation.cmsExternalId}
          subject={generation.subject ?? subject}
        />
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {generation && phase === "completed" ? (
        <div className="space-y-3">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
            <p className="font-medium">
              {featuredStatus === "ready" || featuredStatus === "attached"
                ? "Article et image prêts"
                : generation.title ?? "Article terminé"}
            </p>
            <p className="mt-1 text-emerald-900">
              Destination :{" "}
              {(generation.cmsDestination ?? cmsDestination) === "webflow"
                ? "Webflow"
                : "WordPress"}
            </p>
            {generation.cmsExternalId ? (
              <p className="mt-1 text-emerald-900">
                Identifiant CMS : {generation.cmsExternalId}
              </p>
            ) : null}
            {(generation.cmsDestination ?? cmsDestination) !== "webflow" &&
            generation.wpPostId ? (
              <p className="mt-1 text-emerald-900">
                WordPress #{generation.wpPostId}
              </p>
            ) : null}
            {generation.metaTitle ? (
              <p className="mt-1 text-xs text-emerald-900">
                SEO title : {generation.metaTitle}
              </p>
            ) : null}
            {typeof generation.durationMs === "number" ? (
              <p className="mt-1 text-xs text-emerald-900">
                Durée : {Math.round(generation.durationMs / 1000)}s
                {generation.estimatedCost != null
                  ? ` · coût estimé $${generation.estimatedCost.toFixed(4)}`
                  : ""}
              </p>
            ) : null}
            {featuredBusy ? (
              <p className="mt-2 text-emerald-900">
                Génération de l’image en cours…
              </p>
            ) : null}
            {featuredStatus === "ready" ? (
              <p className="mt-2 text-emerald-900">Image prête à valider</p>
            ) : null}
            {featuredStatus === "failed" ? (
              <p className="mt-2 text-amber-900">
                Échec de génération de l’image — l’article reste disponible.
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {(generation.cmsDestination ?? cmsDestination) !== "webflow" &&
              generation.wpUrl ? (
                <Button
                  size="sm"
                  className="bg-naxialis text-white hover:bg-naxialis-dark"
                  nativeButton={false}
                  render={
                    <a
                      href={generation.wpUrl}
                      target="_blank"
                      rel="noreferrer"
                    />
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
              {featuredImageRequested &&
              (generation.cmsDestination ?? cmsDestination) !== "webflow" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
                  nativeButton={false}
                  render={
                    <Link
                      href={`/articles/${generation.id}?tab=featured`}
                    />
                  }
                >
                  Image à la une
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  const hasStatusPanel =
    phase !== "idle" || Boolean(error) || Boolean(showProgress);

  if (isFull) {
    return (
      <div className="space-y-5">
        {hasStatusPanel ? (
          <div className="space-y-3">{statusPanel}</div>
        ) : null}
        <Card className="gap-0 border border-[#E2E8F0] bg-white py-0 shadow-none ring-0">
          <CardHeader className="border-b border-[#E2E8F0] p-5">
            <CardTitle className="text-base font-semibold text-[#0F172A]">
              Préparer votre article
            </CardTitle>
            <CardDescription className="text-sm text-slate-600">
              Indiquez le sujet et, si besoin, des préférences pour orienter la
              rédaction.
            </CardDescription>
            <CardAction className="max-sm:col-span-2 max-sm:mt-2 max-sm:w-full max-sm:justify-self-stretch sm:self-start">
              {submitButton}
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            {formBody}
            {formHint}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        {submitButton}
      </div>
      {formBody}
      {formHint}
      {statusPanel}
    </div>
  );
}
