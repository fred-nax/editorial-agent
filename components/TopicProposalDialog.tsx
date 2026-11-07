"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { topicCreateMessage } from "@/lib/topics/create";
import type {
  DuplicateCheckBody,
  DuplicateMatch,
  DuplicateSource,
} from "@/lib/veille/editorial-duplicates";
import { kindLabel } from "@/lib/veille/classify";
import {
  toTopicCreateBody,
  type VeilleTopicProposal,
} from "@/lib/veille/topic-proposal";

const SOURCE_LABELS: Record<DuplicateSource, string> = {
  wordpress: "WordPress",
  topic: "File éditoriale",
  generation: "Historique",
};

type TopicProposalDialogProps = {
  proposal: VeilleTopicProposal;
  onClose: () => void;
};

function formatVerifiedDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function TopicProposalDialog({ proposal, onClose }: TopicProposalDialogProps) {
  const [subject, setSubject] = useState(proposal.subject);
  const [angle, setAngle] = useState(proposal.angle);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<DuplicateCheckBody | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [pendingSimilar, setPendingSimilar] = useState<DuplicateMatch[] | null>(null);

  useEffect(() => {
    const nextSubject = subject.trim();
    if (!nextSubject) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetch("/api/topics/check-duplicates", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposals: [{ title: nextSubject, angle, intent: null }],
        }),
      })
        .then(async (response) => {
          const payload = (await response.json()) as DuplicateCheckBody;
          if (cancelled) {
            return;
          }
          if (!response.ok || !payload.results) {
            setPreview(null);
            setPreviewFailed(true);
            return;
          }
          setPreviewFailed(false);
          setPreview(payload);
        })
        .catch(() => {
          if (!cancelled) {
            setPreview(null);
            setPreviewFailed(true);
          }
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [subject, angle]);

  function editSubject(value: string) {
    setSubject(value);
    setPendingSimilar(null);
    setError(null);
  }

  function editAngle(value: string) {
    setAngle(value);
    setPendingSimilar(null);
    setError(null);
  }

  async function addToQueue(confirmSimilar = false) {
    const nextSubject = subject.trim();
    if (!nextSubject || savingRef.current) {
      setError(nextSubject ? null : "Le titre du sujet est obligatoire.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/topics", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...toTopicCreateBody(proposal, { subject: nextSubject, angle }),
          ...(confirmSimilar ? { confirmSimilar: true } : {}),
        }),
      });
      const payload = (await response.json()) as {
        topic?: { id: string };
        error?: string;
        code?: "exact_topic" | "similar";
        requiresConfirmation?: boolean;
        matches?: DuplicateMatch[];
      };
      if (payload.code === "exact_topic") {
        setPendingSimilar(null);
        setError(payload.error ?? "Ce titre est identique à un sujet déjà présent dans la file.");
        return;
      }
      if (payload.code === "similar" && payload.requiresConfirmation) {
        setPendingSimilar(payload.matches ?? []);
        setError(payload.error ?? "Un sujet proche a été trouvé. Confirmez l’ajout pour continuer.");
        return;
      }
      if (!response.ok || !payload.topic) {
        setError(topicCreateMessage(response.status, payload.error));
        return;
      }
      setPendingSimilar(null);
      setCreatedId(payload.topic.id);
    } catch {
      setError(topicCreateMessage(500));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="topic-proposal-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-lg"
      >
        <h2 id="topic-proposal-title" className="text-lg font-semibold text-slate-900">
          Proposer un sujet
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Le sujet est ajouté à la file. Aucune génération n’est lancée.
        </p>

        {createdId ? (
          <div className="mt-4 space-y-4">
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Sujet ajouté à la file.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/topics"
                className="rounded-md bg-naxialis px-4 py-2 text-sm font-medium text-white hover:bg-naxialis-dark"
              >
                Voir la file de sujets
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void addToQueue();
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-800">
                Titre SEO proposé
              </span>
              <input
                value={subject}
                onChange={(event) => editSubject(event.target.value)}
                maxLength={500}
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-naxialis focus:ring-2 focus:ring-naxialis/20"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-800">
                Angle éditorial
              </span>
              <textarea
                value={angle}
                onChange={(event) => editAngle(event.target.value)}
                maxLength={240}
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-naxialis focus:ring-2 focus:ring-naxialis/20"
              />
            </label>
            <div className="space-y-2 text-sm text-slate-700">
              <p>
                <span className="font-medium text-slate-900">Résumé : </span>
                {proposal.summary}
              </p>
              <p>
                <span className="font-medium text-slate-900">Source : </span>
                {proposal.sourceName}
                {" — "}
                <a
                  href={proposal.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-naxialis underline-offset-2 hover:underline"
                >
                  {proposal.sourceTitle}
                </a>
              </p>
              <p>
                <span className="font-medium text-slate-900">Catégorie : </span>
                {kindLabel(proposal.kind)}
              </p>
              <p>
                <span className="font-medium text-slate-900">Date : </span>
                {proposal.dateVerified && proposal.publishedOn
                  ? formatVerifiedDate(proposal.publishedOn)
                  : "Date non vérifiée"}
              </p>
            </div>
            {previewFailed ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Vérification indisponible. L’originalité du sujet n’est pas établie.
              </p>
            ) : null}
            {preview?.coverage === "partial" ? (
              <p className="text-xs text-slate-500">
                Vérification partielle. L’originalité du sujet n’est pas établie.
              </p>
            ) : null}
            {preview?.results[0] && preview.results[0].matches.length > 0 ? (
              <div
                className={`space-y-2 rounded-md border px-3 py-2 text-sm ${
                  preview.results[0].level === "exact"
                    ? "border-red-200 bg-red-50 text-red-950"
                    : "border-orange-200 bg-orange-50 text-orange-950"
                }`}
              >
                <p className="font-medium">
                  {preview.results[0].level === "exact"
                    ? preview.results[0].matches.some((match) => match.source === "topic")
                      ? "Doublon exact dans la file éditoriale."
                      : "Doublon exact hors file. L’ajout reste possible, avec un risque de redondance."
                    : "Sujet proche."}
                </p>
                <ul className="space-y-2">
                  {preview.results[0].matches.map((match) => (
                    <li key={`${match.source}-${match.title}`} className="rounded border border-white/70 bg-white/70 px-2 py-1.5">
                      <span className="font-medium">{SOURCE_LABELS[match.source]}</span>
                      {" · "}
                      {match.url ? (
                        <a
                          href={match.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          {match.title}
                        </a>
                      ) : (
                        match.title
                      )}
                      <span className="mt-0.5 block text-xs opacity-80">{match.explanation}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}
            {pendingSimilar ? (
              <div className="space-y-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2">
                <p className="text-sm text-orange-950">
                  Le serveur confirme un sujet proche. L’ajout n’a pas été enregistré.
                </p>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void addToQueue(true)}
                  className="rounded-md border border-orange-300 bg-white px-4 py-2 text-sm font-medium text-orange-950 disabled:opacity-60"
                >
                  {saving ? "Ajout…" : "Confirmer l’ajout du sujet proche"}
                </button>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving || pendingSimilar !== null}
                className="rounded-md bg-naxialis px-4 py-2 text-sm font-medium text-white hover:bg-naxialis-dark disabled:opacity-60"
              >
                {saving ? "Ajout…" : "Ajouter à la file"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
