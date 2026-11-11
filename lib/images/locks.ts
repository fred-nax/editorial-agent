const locks = new Set<string>();
let activeImageGenerations = 0;
const MAX_CONCURRENT_IMAGE_GENERATIONS = 2;

export function tryAcquireFeaturedImageLock(key: string): boolean {
  if (locks.has(key)) {
    return false;
  }
  locks.add(key);
  return true;
}

export function releaseFeaturedImageLock(key: string): void {
  locks.delete(key);
}

export function tryAcquireImageGenerationSlot(): boolean {
  if (activeImageGenerations >= MAX_CONCURRENT_IMAGE_GENERATIONS) {
    return false;
  }
  activeImageGenerations += 1;
  return true;
}

export function releaseImageGenerationSlot(): void {
  activeImageGenerations = Math.max(0, activeImageGenerations - 1);
}
