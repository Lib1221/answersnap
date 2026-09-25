/** Rough token estimate used for budgets and the cache-size check (spec 10.6). */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 3.5);
}
