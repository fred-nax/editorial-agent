export type UsagePeriodPreset = "7d" | "30d" | "90d" | "custom";

export function resolveUsagePeriod(input: {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): { from: Date; to: Date; preset: UsagePeriodPreset } {
  const now = input.now ?? new Date();
  const to = input.to ? new Date(input.to) : now;
  if (input.preset === "custom" && input.from) {
    return { from: new Date(input.from), to, preset: "custom" };
  }
  const days =
    input.preset === "7d" ? 7 : input.preset === "90d" ? 90 : 30;
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    from,
    to,
    preset: (input.preset === "7d" || input.preset === "90d"
      ? input.preset
      : "30d") as UsagePeriodPreset,
  };
}
