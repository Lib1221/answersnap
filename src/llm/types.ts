// Provider-neutral request and response shapes (spec 11.1). Each provider maps these to its
// own wire format, so an answer request looks the same for Anthropic and Gemini.

export interface SystemBlock {
  text: string;
  /** Cache breakpoint after this block (Anthropic). Only the candidate-data block sets it. */
  cache?: boolean;
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: 'image/png' | 'image/jpeg'; data: string };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: ContentPart[];
}

export interface AnswerRequest {
  model: string;
  maxTokens: number;
  system: SystemBlock[];
  messages: ChatMessage[];
}

export interface CompleteRequest extends AnswerRequest {
  /** When set, ask for JSON matching this schema (structured outputs). */
  jsonSchema?: Record<string, unknown>;
  schemaName?: string;
}

export interface Usage {
  /** Uncached input tokens. */
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
}

export const EMPTY_USAGE: Usage = {
  inputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  outputTokens: 0,
};

export type StreamEvent =
  | { kind: 'text'; delta: string }
  | { kind: 'usage'; usage: Usage }
  | { kind: 'stop'; reason: string }
  | { kind: 'fallback'; from: string; to: string; reason: 'minute' | 'day' }
  | {
      kind: 'retry';
      reason: 'rate_limit' | 'overloaded' | 'network';
      waitMs: number;
      attempt: number;
    };

export interface StreamResult {
  text: string;
  stopReason: string;
  usage: Usage;
  /** The model that answered, when a fallback switched it. */
  model?: string;
}

export interface CompleteResult {
  /** The model that answered, when a fallback switched it. */
  model?: string;
  text: string;
  json?: unknown;
  stopReason: string;
  usage: Usage;
}

export interface ModelListing {
  id: string;
  displayName: string;
}

export interface LlmProvider {
  listModels(): Promise<ModelListing[]>;
  stream(
    req: AnswerRequest,
    signal: AbortSignal,
    onEvent: (e: StreamEvent) => void,
  ): Promise<StreamResult>;
  /** Not streamed; used for JSON (profile builder) and transcription. */
  complete(req: CompleteRequest, signal?: AbortSignal): Promise<CompleteResult>;
  /** Write the prompt cache for these system blocks without generating anything. */
  prewarm(system: SystemBlock[], model: string): Promise<Usage | null>;
}

export function totalInput(u: Usage): number {
  return u.inputTokens + u.cacheWriteTokens + u.cacheReadTokens;
}
