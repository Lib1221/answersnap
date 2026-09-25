import { storage } from 'wxt/utils/storage';
import { LlmError, type QuotaScope } from './errors';
import type {
  AnswerRequest,
  CompleteRequest,
  CompleteResult,
  LlmProvider,
  StreamEvent,
  StreamResult,
  SystemBlock,
} from './types';

// Automatic model fallback: when a model's quota runs out, try the next model in its chain and
// remember the used-up model so later requests skip it until its quota comes back.

const MINUTE_COOLDOWN_MS = 65_000;

/** Free-tier daily quotas reset at midnight Pacific time. */
export function msUntilPacificMidnight(now = Date.now()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(now));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const elapsed = (get('hour') * 3600 + get('minute') * 60 + get('second')) * 1000;
  return 24 * 3600 * 1000 - elapsed;
}

export function cooldownUntil(scope: QuotaScope | undefined, now = Date.now()): number {
  return now + (scope === 'day' ? msUntilPacificMidnight(now) : MINUTE_COOLDOWN_MS);
}

export interface CooldownStore {
  get(): Promise<Record<string, number>>;
  set(model: string, until: number): Promise<void>;
}

// Defined on first use: defineItem touches browser storage right away, which breaks Node callers
// (the eval runner) that import this module but never fall back.
let cooldownItem: ReturnType<typeof defineCooldownItem> | null = null;
function defineCooldownItem() {
  return storage.defineItem<Record<string, number>>('local:modelCooldowns', { fallback: {} });
}
const cooldowns = () => (cooldownItem ??= defineCooldownItem());

export const storageCooldowns: CooldownStore = {
  async get() {
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(await cooldowns().getValue()).filter(([, until]) => until > now),
    );
  },
  async set(model, until) {
    await cooldowns().setValue({ ...(await this.get()), [model]: until });
  },
};

export function watchCooldowns(cb: () => void): () => void {
  return cooldowns().watch(cb);
}

/** The chosen model first, then the rest of its chain in order. */
export function orderedChain(model: string, chain: string[], available: string[] = []): string[] {
  const rest = chain.filter(
    (m) => m !== model && (available.length === 0 || available.includes(m)),
  );
  return [model, ...rest];
}

export class AllModelsExhausted extends LlmError {
  constructor(
    readonly models: string[],
    readonly resetsInMs: number,
    last?: LlmError,
  ) {
    super(
      'rate_limit',
      last?.message ?? 'Every model in the fallback list is out of quota.',
      429,
      undefined,
      last?.quota ?? 'day',
    );
    this.name = 'AllModelsExhausted';
  }
}

function isQuotaError(err: unknown): err is LlmError {
  return err instanceof LlmError && err.kind === 'rate_limit';
}

export class FallbackProvider implements LlmProvider {
  constructor(
    private readonly inner: LlmProvider,
    /** Models to try, best first, for a requested model. */
    private readonly chainFor: (model: string) => string[],
    private readonly cooldowns: CooldownStore = storageCooldowns,
    private readonly onSwitch?: (e: Extract<StreamEvent, { kind: 'fallback' }>) => void,
  ) {}

  listModels() {
    return this.inner.listModels();
  }

  prewarm(system: SystemBlock[], model: string) {
    return this.inner.prewarm(system, model);
  }

  private async candidates(model: string): Promise<string[]> {
    const cooling = await this.cooldowns.get();
    const chain = this.chainFor(model);
    const open = chain.filter((m) => !cooling[m]);
    if (!open.length) {
      const soonest = Math.min(...chain.map((m) => cooling[m] ?? Infinity));
      throw new AllModelsExhausted(
        chain,
        Number.isFinite(soonest) ? soonest - Date.now() : msUntilPacificMidnight(),
      );
    }
    return open;
  }

  private async run<T>(
    model: string,
    attempt: (m: string) => Promise<T>,
    notify: (e: Extract<StreamEvent, { kind: 'fallback' }>) => void,
  ): Promise<T & { model: string }> {
    const models = await this.candidates(model);
    let last: LlmError | undefined;
    for (const [i, m] of models.entries()) {
      try {
        return { ...(await attempt(m)), model: m };
      } catch (err) {
        if (!isQuotaError(err)) throw err;
        last = err;
        await this.cooldowns.set(m, cooldownUntil(err.quota));
        const next = models[i + 1];
        if (next) notify({ kind: 'fallback', from: m, to: next, reason: err.quota ?? 'minute' });
      }
    }
    const cooling = await this.cooldowns.get();
    const soonest = Math.min(...models.map((m) => cooling[m] ?? Infinity));
    throw new AllModelsExhausted(
      models,
      Number.isFinite(soonest) ? soonest - Date.now() : msUntilPacificMidnight(),
      last,
    );
  }

  stream(
    req: AnswerRequest,
    signal: AbortSignal,
    onEvent: (e: StreamEvent) => void,
  ): Promise<StreamResult> {
    return this.run(
      req.model,
      (m) => this.inner.stream({ ...req, model: m }, signal, onEvent),
      (e) => {
        onEvent(e);
        this.onSwitch?.(e);
      },
    );
  }

  complete(req: CompleteRequest, signal?: AbortSignal): Promise<CompleteResult> {
    return this.run(
      req.model,
      (m) => this.inner.complete({ ...req, model: m }, signal),
      (e) => this.onSwitch?.(e),
    );
  }
}
