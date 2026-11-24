"use client";

import { Label } from "@/components/ui/label";
import type { CmsDestinationId } from "@/lib/cms/types";

type Props = {
  value: CmsDestinationId;
  onChange: (value: CmsDestinationId) => void;
  disabled?: boolean;
};

const OPTIONS: {
  id: CmsDestinationId;
  label: string;
  hint: string;
  enabled: boolean;
}[] = [
  {
    id: "wordpress",
    label: "WordPress",
    hint: "Brouillon créé via l’API REST (comportement actuel).",
    enabled: true,
  },
  {
    id: "webflow",
    label: "Webflow",
    hint: "Bientôt disponible — connecteur non activé dans cette version.",
    enabled: false,
  },
];

export function CmsDestinationPicker({ value, onChange, disabled }: Props) {
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-medium text-slate-900">
        Destination CMS
      </legend>
      <p className="text-xs text-slate-500">
        Choisissez où le brouillon sera créé. Seul WordPress est actif pour
        l’instant.
      </p>
      <div className="space-y-2">
        {OPTIONS.map((option) => (
          <label
            key={option.id}
            className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${
              option.enabled
                ? "cursor-pointer border-slate-200 hover:bg-slate-50"
                : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-70"
            }`}
          >
            <input
              type="radio"
              name="cms-destination"
              className="mt-1"
              value={option.id}
              checked={value === option.id}
              disabled={!option.enabled || disabled}
              onChange={() => {
                if (option.enabled) {
                  onChange(option.id);
                }
              }}
            />
            <span>
              <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                {option.label}
                {!option.enabled ? (
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    Bientôt
                  </span>
                ) : null}
              </span>
              <span className="block text-xs text-slate-500">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <Label className="text-xs text-slate-500">
        Destination technique : {value}
      </Label>
    </fieldset>
  );
}
