import {
  MAX_CONCURRENT_SIMILARITY_AI,
  MAX_CONCURRENT_SIMILARITY_CHECKS,
} from "./editorial-similarity-config";

let activeChecks = 0;
let activeAi = 0;

export function tryAcquireSimilarityCheckSlot(): boolean {
  if (activeChecks >= MAX_CONCURRENT_SIMILARITY_CHECKS) {
    return false;
  }
  activeChecks += 1;
  return true;
}

export function releaseSimilarityCheckSlot(): void {
  activeChecks = Math.max(0, activeChecks - 1);
}

export function tryAcquireSimilarityAiSlot(): boolean {
  if (activeAi >= MAX_CONCURRENT_SIMILARITY_AI) {
    return false;
  }
  activeAi += 1;
  return true;
}

export function releaseSimilarityAiSlot(): void {
  activeAi = Math.max(0, activeAi - 1);
}
