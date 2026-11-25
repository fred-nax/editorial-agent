"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2,
  ImageIcon,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  FEATURED_IMAGE_ASPECTS,
  FEATURED_IMAGE_MODEL,
  FEATURED_IMAGE_STYLES,
  MAX_ALT_TEXT_LENGTH,
  MAX_VISUAL_INSTRUCTIONS_LENGTH,
} from "@/lib/images/config";
import type { FeaturedImagePublic } from "@/lib/images/types";

type FeaturedImagePanelProps = {
  generationId: string;
  wpUrl: string | null;
  initialImage: FeaturedImagePublic | null;
  cmsDestination?: string | null;
  cmsExternalId?: string | null;
  frozenSiteId?: string | null;
  frozenCollectionId?: string | null;
};

type BusyState = "idle" | "generating" | "uploading" | "savingAlt";

function isWebflowCms(destination?: string | null): boolean {
  return destination === "webflow";
}

function transferStatusLabel(image: FeaturedImagePublic | null): string | null {
  if (!image?.cmsTransferStatus) {
    return null;
  }
  switch (image.cmsTransferStatus) {
    case "file_uploaded":
      return "Asset Webflow créé — association au brouillon en attente";
    case "associated":
      return "Associée au brouillon Webflow";
    case "association_failed":
      return "Asset conservé — reprise de l’association possible";
    default:
      return image.cmsTransferStatus;
  }
}

function workflowStatusLabel(input: {
  busy: BusyState;
  image: FeaturedImagePublic | null;
  error: string | null;
  webflow: boolean;
}): { label: string; variant: "outline" | "secondary" | "destructive" } {
  if (input.busy === "generating" || input.image?.status === "generating") {
    return { label: "Génération de l’image en cours", variant: "secondary" };
  }
  if (input.image?.status === "pending") {
    return {
      label: "Image planifiée (après le brouillon)",
      variant: "secondary",
    };
  }
  if (input.busy === "uploading") {
    return { label: "Transfert en cours", variant: "secondary" };
  }
  if (input.error && !input.image) {
    return { label: "Erreur", variant: "destructive" };
  }
  if (!input.image) {
    return { label: "Aucune image", variant: "outline" };
  }
  if (input.image.status === "attached") {
    return {
      label: input.webflow
        ? "Image associée au brouillon Webflow"
        : "Image associée au brouillon WordPress",
      variant: "secondary",
    };
  }
  if (
    input.webflow &&
    input.image.cmsTransferStatus === "association_failed" &&
    input.image.webflowAssetId
  ) {
    return {
      label: "Asset prêt — association à reprendre",
      variant: "destructive",
    };
  }
  if (
    input.webflow &&
    input.image.webflowAssetId &&
    input.image.status !== "attached"
  ) {
    return {
      label: "Asset Webflow prêt (non associé)",
      variant: "outline",
    };
  }
  if (input.image.status === "failed" || input.error) {
    return { label: "Échec de génération de l’image", variant: "destructive" };
  }
  return { label: "Image prête à valider", variant: "outline" };
}

export function FeaturedImagePanel({
  generationId,
  wpUrl,
  initialImage,
  cmsDestination,
  cmsExternalId,
  frozenSiteId,
  frozenCollectionId,
}: FeaturedImagePanelProps) {
  const webflow = isWebflowCms(cmsDestination);
  const uploadLockRef = useRef(false);
  const [style, setStyle] = useState<string>(
    initialImage?.style ?? "photographic"
  );
  const [aspectRatio, setAspectRatio] = useState<string>(
    initialImage?.aspectRatio ?? "3:2"
  );
  const [visualInstructions, setVisualInstructions] = useState("");
  const [image, setImage] = useState<FeaturedImagePublic | null>(initialImage);
  const [altText, setAltText] = useState(initialImage?.altText ?? "");
  const [busy, setBusy] = useState<BusyState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [draftLink, setDraftLink] = useState<string | null>(
    !webflow && initialImage?.status === "attached" ? wpUrl : null
  );

  const autoBusy =
    image?.status === "pending" || image?.status === "generating";
  const disabled = busy !== "idle" || autoBusy;
  const workflow = workflowStatusLabel({ busy, image, error, webflow });
  const showPreview =
    Boolean(image) &&
    image!.status !== "pending" &&
    image!.status !== "generating" &&
    image!.status !== "failed";
  const cmsLabel = webflow ? "Webflow" : "WordPress";
  const transferLabel = transferStatusLabel(image);
  const canResumeAssociation =
    webflow &&
    Boolean(image?.webflowAssetId) &&
    image?.status !== "attached";
  const uploadButtonLabel = (() => {
    if (busy === "uploading") {
      return "Transfert…";
    }
    if (image?.status === "attached") {
      return "Déjà envoyée";
    }
    if (canResumeAssociation) {
      return "Reprendre l’association Webflow";
    }
    return webflow ? "Transférer vers Webflow" : "Envoyer à WordPress";
  })();

  async function generate(regenerate: boolean) {
    if (regenerate) {
      const ok = window.confirm(
        "La régénération crée une nouvelle image et entraîne un nouvel appel API."
      );
      if (!ok) {
        return;
      }
    }

    setBusy("generating");
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/articles/${generationId}/featured-image/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            style,
            aspectRatio,
            visualInstructions: visualInstructions || undefined,
          }),
        }
      );
      const data = (await response.json()) as {
        image?: FeaturedImagePublic;
        error?: string;
      };
      if (!response.ok || !data.image) {
        throw new Error(data.error || "La génération a échoué.");
      }
      setImage(data.image);
      setAltText(data.image.altText ?? "");
      setDraftLink(null);
      setSuccess(
        webflow
          ? "Image générée. Vérifiez le texte ALT avant le transfert Webflow (action séparée)."
          : "Image générée. Vérifiez le texte ALT avant l’envoi."
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "La génération a échoué."
      );
    } finally {
      setBusy("idle");
    }
  }

  async function saveAlt() {
    if (!image) {
      return;
    }
    setBusy("savingAlt");
    setError(null);
    try {
      const response = await fetch(
        `/api/articles/${generationId}/featured-image`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageId: image.id, altText }),
        }
      );
      const data = (await response.json()) as {
        image?: FeaturedImagePublic;
        error?: string;
      };
      if (!response.ok || !data.image) {
        throw new Error(data.error || "Impossible d’enregistrer le texte ALT.");
      }
      setImage(data.image);
      setAltText(data.image.altText ?? "");
      setSuccess("Texte ALT enregistré.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible d’enregistrer le texte ALT."
      );
    } finally {
      setBusy("idle");
    }
  }

  async function upload(confirmReplace = false) {
    if (!image || uploadLockRef.current) {
      return;
    }

    const confirmMessage = webflow
      ? canResumeAssociation
        ? "Reprendre uniquement l’association de l’asset déjà transféré au brouillon Webflow ? Aucune nouvelle génération OpenAI."
        : "Transférer cette image vers Webflow Assets et l’associer au brouillon CMS ? Aucune publication automatique."
      : "Envoyer cette image à la une vers le brouillon WordPress ?";
    if (!confirmReplace) {
      const ok = window.confirm(confirmMessage);
      if (!ok) {
        return;
      }
    }

    uploadLockRef.current = true;
    setBusy("uploading");
    setError(null);
    setSuccess(null);

    try {
      const body: Record<string, unknown> = {
        imageId: image.id,
        altText,
        confirmReplace,
      };
      if (webflow) {
        if (frozenSiteId) {
          body.frozenSiteId = frozenSiteId;
        }
        if (frozenCollectionId) {
          body.frozenCollectionId = frozenCollectionId;
        }
      }

      const response = await fetch(
        `/api/articles/${generationId}/featured-image/upload`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = (await response.json()) as {
        image?: FeaturedImagePublic;
        wordpress?: { link?: string };
        webflow?: {
          assetId?: string;
          assetUrl?: string;
          associated?: boolean;
        };
        error?: string;
        code?: string;
      };

      if (response.status === 409 && data.code === "CONFIRM_REPLACE") {
        const ok = window.confirm(
          "Ce brouillon a déjà une image à la une. Remplacer l’image existante ?"
        );
        uploadLockRef.current = false;
        setBusy("idle");
        if (ok) {
          await upload(true);
        }
        return;
      }

      if (!response.ok || !data.image) {
        throw new Error(
          data.error ||
            (webflow
              ? "Le transfert Webflow a échoué."
              : "L’envoi WordPress a échoué.")
        );
      }

      setImage(data.image);
      setAltText(data.image.altText ?? "");

      if (webflow) {
        const associated =
          data.webflow?.associated === true ||
          data.image.status === "attached";
        if (associated) {
          setSuccess("Image associée au brouillon Webflow (staged).");
        } else if (data.image.webflowAssetId) {
          setSuccess(
            "Asset Webflow créé. L’association au brouillon n’est pas confirmée — vous pouvez reprendre sans régénérer."
          );
        } else {
          setSuccess("Transfert Webflow terminé.");
        }
      } else {
        const link = data.wordpress?.link || wpUrl;
        setDraftLink(link);
        setSuccess("Image associée au brouillon WordPress.");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : webflow
            ? "Le transfert Webflow a échoué."
            : "L’envoi WordPress a échoué."
      );
    } finally {
      uploadLockRef.current = false;
      setBusy("idle");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="size-4" aria-hidden />
              Image à la une
            </CardTitle>
            <CardDescription>
              Génération manuelle indépendante de la rédaction. Modèle image :{" "}
              <span className="font-medium text-foreground">
                {FEATURED_IMAGE_MODEL}
              </span>
              {webflow ? (
                <>
                  {" "}
                  · Destination{" "}
                  <span className="font-medium text-foreground">Webflow</span>
                  {cmsExternalId ? ` · brouillon ${cmsExternalId}` : ""}.
                </>
              ) : null}
            </CardDescription>
          </div>
          <Badge variant={workflow.variant}>{workflow.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!image && busy === "idle" && !error ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
            Aucune image pour le moment. Choisissez un style et un format, puis
            générez une image à la une.
          </p>
        ) : null}

        {image?.status === "pending" ? (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
            Image demandée avec l’article. Elle sera générée automatiquement
            après la création du brouillon {cmsLabel}.
          </p>
        ) : null}

        {image?.status === "generating" || busy === "generating" ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Génération de l’image en cours…
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="featured-style">Style visuel</Label>
            <Select
              value={style}
              onValueChange={(value) => {
                if (value) setStyle(value);
              }}
              disabled={disabled}
            >
              <SelectTrigger id="featured-style" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEATURED_IMAGE_STYLES.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="featured-aspect">Format</Label>
            <Select
              value={aspectRatio}
              onValueChange={(value) => {
                if (value) setAspectRatio(value);
              }}
              disabled={disabled}
            >
              <SelectTrigger id="featured-aspect" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
          <Label htmlFor="featured-instructions">
            Instructions visuelles (facultatif)
          </Label>
          <Textarea
            id="featured-instructions"
            value={visualInstructions}
            onChange={(event) => setVisualInstructions(event.target.value)}
            maxLength={MAX_VISUAL_INSTRUCTIONS_LENGTH}
            disabled={disabled}
            placeholder="Bureau moderne, ambiance professionnelle, éclairage naturel."
            rows={3}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void generate(Boolean(image))}
            disabled={disabled}
          >
            {busy === "generating" ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : image ? (
              <RefreshCw data-icon="inline-start" />
            ) : (
              <ImageIcon data-icon="inline-start" />
            )}
            {busy === "generating"
              ? "Génération…"
              : image
                ? "Régénérer"
                : "Générer une image"}
          </Button>
        </div>

        {error ? (
          <p
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {success ? (
          <p
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
            role="status"
          >
            {success}
          </p>
        ) : null}

        {showPreview && image ? (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {image.size} · {image.model}
              </span>
              {transferLabel ? (
                <Badge variant="outline">{transferLabel}</Badge>
              ) : null}
            </div>

            <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.fileUrl}
                alt={altText || "Aperçu de l’image à la une"}
                className="max-h-[28rem] w-full bg-muted object-contain"
              />
            </div>

            <Accordion>
              <AccordionItem value="prompt">
                <AccordionTrigger>Prompt visuel utilisé</AccordionTrigger>
                <AccordionContent>
                  <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 text-xs text-foreground">
                    {image.prompt}
                  </pre>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="space-y-2">
              <Label htmlFor="featured-alt">Texte ALT</Label>
              <Textarea
                id="featured-alt"
                value={altText}
                onChange={(event) => setAltText(event.target.value)}
                maxLength={MAX_ALT_TEXT_LENGTH}
                disabled={disabled}
                rows={3}
                placeholder="Une aide-soignante accompagne une femme âgée devant un ordinateur portable, avec des symboles d'intelligence artificielle en arrière-plan."
              />
              <p className="text-xs text-muted-foreground">
                Phrase descriptive modifiable · longueur indicative 80–150
                caractères ({altText.length}/{MAX_ALT_TEXT_LENGTH})
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void saveAlt()}
                  disabled={disabled}
                >
                  {busy === "savingAlt" ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : null}
                  Enregistrer le texte ALT
                </Button>
              </div>
            </div>

            {webflow && image.webflowAssetId ? (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <p>
                  Asset distant :{" "}
                  <span className="font-medium text-foreground">
                    {image.webflowAssetId}
                  </span>
                </p>
                {image.webflowAssetUrl ? (
                  <p className="mt-1 break-all">URL : {image.webflowAssetUrl}</p>
                ) : null}
                {image.status !== "attached" ? (
                  <p className="mt-1 text-amber-800">
                    Image transférée mais non présentée comme associée tant que
                    l’association au brouillon n’est pas confirmée.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void upload(false)}
                disabled={disabled || image.status === "attached"}
              >
                {busy === "uploading" ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : image.status === "attached" ? (
                  <CheckCircle2 data-icon="inline-start" />
                ) : (
                  <Upload data-icon="inline-start" />
                )}
                {uploadButtonLabel}
              </Button>
              {!webflow && draftLink ? (
                <Button
                  type="button"
                  variant="outline"
                  nativeButton={false}
                  render={
                    <a href={draftLink} target="_blank" rel="noreferrer" />
                  }
                >
                  Ouvrir le brouillon WordPress
                </Button>
              ) : null}
            </div>

            {image.error ? (
              <p className="text-sm text-amber-800">
                Dernière erreur enregistrée : {image.error}
              </p>
            ) : null}
          </div>
        ) : null}

        {image?.status === "failed" ? (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm text-amber-900" role="alert">
              {image.error ?? "Échec de génération de l’image."} L’article et le
              brouillon {cmsLabel} restent disponibles. Vous pouvez régénérer
              manuellement.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function FeaturedImageUnavailable({
  cmsDestination,
}: {
  cmsDestination?: string | null;
}) {
  const webflow = isWebflowCms(cmsDestination);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="size-4" aria-hidden />
          Image à la une
        </CardTitle>
        <CardDescription>
          {webflow
            ? "Disponible uniquement pour un article terminé avec un brouillon Webflow valide (cmsExternalId)."
            : "Disponible uniquement pour un article terminé avec un brouillon WordPress valide."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
          Aucune image ne peut être générée pour cette génération dans son état
          actuel.
        </p>
      </CardContent>
    </Card>
  );
}
