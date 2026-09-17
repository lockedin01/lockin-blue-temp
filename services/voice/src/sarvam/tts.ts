/**
 * Sarvam streaming text-to-speech — `bulbul:v3` over `/text-to-speech/ws`.
 *
 * Model deltas are piped in as they arrive so audio starts on the first sentence
 * rather than the last.
 *
 * TRAP, and it is severe: the streaming endpoint KILLS THE ENTIRE REPLY on a
 * text message it considers empty — and "empty" is broader than it looks. A lone
 * " ", "\n\n", ",", "." or "(" is rejected outright, and one such message loses
 * ALL of the reply's audio. Streaming models emit exactly these as deltas. So
 * only send text containing a letter or a combining mark; anything else rides
 * along with the word before it. Do not loosen this.
 *
 * Also: v3 caps one input at ~500 characters, rejects `pitch` and `loudness`
 * outright (only `pace` survives), and the v2 voices such as `anushka` now 400.
 */

export const SAMPLE_RATE = 22050;

/** True only if the text contains a letter or combining mark — see the trap above. */
export function speakable(text: string): boolean {
  return /[\p{L}\p{M}]/u.test(text);
}

export interface StreamingTtsOptions {
  readonly onAudio: (seq: number, base64Pcm: string) => void;
  readonly onDone: () => void;
  readonly onError: (message: string) => void;
}

export interface StreamingTtsSession {
  /** Set the voice's language once the reply's script is unambiguous. */
  configure(language: string): boolean;
  language(): string | null;
  sendText(text: string): void;
  flush(): void;
  ok(): boolean;
  close(): void;
}

export function openStreamingTts(_options: StreamingTtsOptions): StreamingTtsSession {
  throw new Error('not implemented');
}
