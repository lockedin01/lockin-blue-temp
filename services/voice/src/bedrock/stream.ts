import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { config } from '../config.js';

/**
 * The model behind the tutor's replies. Bedrock, via SigV4 on the App Runner
 * task role — no API keys anywhere in this service.
 *
 * Claude Haiku 4.5 is used here specifically because this is the one synchronous
 * agent path (FEATURES.md §13); the other three agents run Sonnet 5 off the
 * request path.
 */

export const client = new BedrockRuntimeClient({ region: config.region });

export interface StreamRequest {
  readonly system: string;
  readonly messages: { role: 'user' | 'assistant'; content: string }[];
  readonly maxTokens: number;
}

/**
 * Stream a reply as text deltas.
 *
 * Do NOT translate the question into English before the model — it is pure
 * latency for no benefit, since Claude reads Devanagari and Hinglish directly.
 * The system prompt pins the OUTPUT language instead.
 */
export async function* streamText(
  _request: StreamRequest,
  _signal?: AbortSignal
): AsyncGenerator<string> {
  throw new Error('not implemented');
}
