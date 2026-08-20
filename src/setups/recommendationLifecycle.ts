/**
 * Recommendation work is scoped to a zero-P segment, not to piece movement.
 * Inputs that only change board/active-piece revision intentionally do not
 * participate in this key.
 */
export interface RecommendationSegmentIdentity {
  seed: string;
  pcCount: number;
  cycle: number;
  resetNonce: number;
}

export function recommendationSegmentKey({
  seed,
  pcCount,
  cycle,
  resetNonce,
}: RecommendationSegmentIdentity): string {
  return `${seed}:${pcCount}:${cycle}:${resetNonce}`;
}
