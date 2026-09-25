import { shortModelName } from '@/config/models';
import type { ModelPrice } from '@/storage/schema';
import { totalInput, type Usage } from './types';

/** USD for one request, from usage and a per-million-token price. */
export function estimateCost(u: Usage, p: ModelPrice): number {
  return (
    (u.inputTokens * p.input +
      u.cacheWriteTokens * p.cacheWrite5m +
      u.cacheReadTokens * p.cacheRead +
      u.outputTokens * p.output) /
    1_000_000
  );
}

export function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
}

/** Footer line, e.g. "Sonnet 5. In 1.9k (7.9k cached), out 12." */
export function usageLine(model: string, u: Usage): string {
  const cached = u.cacheReadTokens ? ` (${compactNumber(u.cacheReadTokens)} cached)` : '';
  return `${shortModelName(model)}. In ${compactNumber(totalInput(u))}${cached}, out ${compactNumber(u.outputTokens)}.`;
}

export function costLine(
  u: Usage,
  price: ModelPrice | undefined,
  freeTier: boolean,
): string | null {
  if (freeTier) return 'Free tier';
  if (!price) return null;
  const cost = estimateCost(u, price);
  if (cost < 0.001) return 'Under $0.001';
  return `About $${cost < 0.01 ? cost.toFixed(4).replace(/0+$/, '') : cost.toFixed(3)}`;
}
