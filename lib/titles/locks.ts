import { MAX_CONCURRENT_TITLE_SUGGESTIONS } from "./config";

let active = 0;

export function tryAcquireTitleSuggestionSlot(): boolean {
  if (active >= MAX_CONCURRENT_TITLE_SUGGESTIONS) {
    return false;
  }
  active += 1;
  return true;
}

export function releaseTitleSuggestionSlot(): void {
  active = Math.max(0, active - 1);
}
