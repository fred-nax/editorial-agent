"use client";

import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_PREFERRED_TITLE_LENGTH } from "@/lib/editorial-context";
import {
  approachLabel,
  type TitleSuggestion,
} from "@/lib/titles/types";

export type TitleSuggestionsPickerProps = {
  formId: string;
  radioName: string;
  busy: boolean;
  titleSuggestBusy: boolean;
  titleSuggestError: string | null;
  suggestionsStale: boolean;
  titleSuggestions: TitleSuggestion[] | null;
  leaveAgentTitle: boolean;
  preferredTitle: string;
  selectedSuggestionIndex: number | null;
  onClearSelection: () => void;
  onSelectSuggestion: (index: number, title: string) => void;
  onPreferredTitleChange: (value: string) => void;
};

export function TitleSuggestionsPicker({
  formId,
  radioName,
  busy,
  titleSuggestBusy,
  titleSuggestError,
  suggestionsStale,
  titleSuggestions,
  leaveAgentTitle,
  preferredTitle,
  selectedSuggestionIndex,
  onClearSelection,
  onSelectSuggestion,
  onPreferredTitleChange,
}: TitleSuggestionsPickerProps) {
  return (
    <div className="space-y-3">
      {titleSuggestBusy ? (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Recherche de propositions de titres…
        </p>
      ) : null}

      {titleSuggestError ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {titleSuggestError}
        </p>
      ) : null}

      {suggestionsStale && titleSuggestions ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Les propositions peuvent être obsolètes après modification du sujet ou
          des indications. Régénérez-les ou laissez l’agent choisir le titre.
        </p>
      ) : null}

      {titleSuggestions && !titleSuggestBusy ? (
        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-transparent px-1 py-1 text-sm text-[#0F172A] hover:bg-white/70">
            <input
              type="radio"
              className="mt-1 accent-naxialis"
              name={radioName}
              checked={leaveAgentTitle}
              disabled={busy}
              onChange={() => onClearSelection()}
            />
            <span>Laisser l’agent choisir le titre</span>
          </label>

          <ul className="space-y-2">
            {titleSuggestions.map((item, index) => {
              const selected =
                !leaveAgentTitle && selectedSuggestionIndex === index;
              return (
                <li key={`${item.approach}-${index}`}>
                  <label
                    className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm transition-colors ${
                      selected
                        ? "border-naxialis/40 bg-white"
                        : "border-[#E2E8F0] bg-white/80 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      className="mt-1 accent-naxialis"
                      name={radioName}
                      checked={selected}
                      disabled={busy}
                      onChange={() => onSelectSuggestion(index, item.title)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-medium text-[#0F172A]">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {approachLabel(item.approach)}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          {!leaveAgentTitle ? (
            <div className="space-y-2">
              <Label
                htmlFor={`${formId}-preferred-title`}
                className="text-[#0F172A]"
              >
                Titre retenu
                <span className="font-normal text-slate-500">
                  {" "}
                  (modifiable)
                </span>
              </Label>
              <Textarea
                id={`${formId}-preferred-title`}
                value={preferredTitle}
                onChange={(event) => onPreferredTitleChange(event.target.value)}
                rows={2}
                maxLength={MAX_PREFERRED_TITLE_LENGTH}
                disabled={busy}
                className="border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-slate-400 focus-visible:border-naxialis focus-visible:ring-naxialis/20"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
