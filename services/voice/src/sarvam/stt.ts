/**
 * Sarvam realtime speech-to-text — `saaras:v3-realtime`.
 *
 * `saaras:v3` and `saaras:v3-realtime` are DIFFERENT endpoints. The batch one
 * cannot start until the audio stops, which puts the whole of recognition on the
 * critical path and leaves the worker unable to tell a live mic from a dead one.
 * The realtime endpoint transcribes while audio is still arriving.
 *
 *   audio in : raw linear16 PCM, 16 kHz mono, base64 inside a JSON frame
 *   text out : transcript.partial (interim) then transcript.final (per utterance)
 *
 * endpointing=manual: this is push-to-talk, so we know when the turn starts and
 * ends — better than having a VAD infer it from silence.
 */

export interface RealtimeSttOptions {
  /** BCP-47 code, or 'auto' to let Sarvam detect. */
  readonly language?: string;
  readonly onPartial?: (text: string, language: string | null) => void;
  readonly onFinal?: (text: string, language: string | null) => void;
  readonly onError?: (message: string) => void;
}

export interface RealtimeSttSession {
  sendAudio(base64Frame: string): void;
  /** Close the turn and resolve with whatever was recognised. */
  finish(): Promise<{ transcript: string; language: string | null }>;
  close(): void;
}

/**
 * Audio captured before the socket finishes its handshake must be QUEUED, not
 * dropped — that first half-second is usually where the question starts.
 *
 * Interim partials are not monotonic: Sarvam periodically replays a segment from
 * the beginning in a fast burst, and re-sends the same partial during silence. A
 * partial that is a character-prefix of what is already held is a replay, not
 * news, and must not be treated as the transcript changing.
 */
export function openRealtimeStt(_options: RealtimeSttOptions): RealtimeSttSession {
  throw new Error('not implemented');
}
