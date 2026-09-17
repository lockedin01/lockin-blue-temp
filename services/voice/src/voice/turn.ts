/**
 * One voice turn, arranged so that almost nothing waits on anything else.
 *
 * The naive shape — upload the clip, recognise it, think, synthesise, return —
 * is about seven seconds during which the screen cannot distinguish a working
 * mic from a broken one. Nothing here is faster than the APIs it calls; what
 * changes is that the stages OVERLAP and each reports as it lands:
 *
 *   speaking    recognition runs on live audio, words appear as they are said
 *   release     the transcript is already final — recognition costs ~0 extra
 *   thinking    the model streams, so the answer appears word by word
 *   sentence 1  synthesised while the model is still writing sentence 2
 *   audio       playback starts on sentence one, not on the last one
 *
 * Both vendor sockets (recognition and speech) are opened at BEGIN, so their
 * handshakes overlap the question rather than following it.
 */

export interface TurnOptions {
  readonly send: (message: Record<string, unknown>) => void;
  readonly fail: (message: string, code?: string) => void;
  readonly language: string;
  readonly history: { role: 'user' | 'assistant'; content: string }[];
  /** A language the worker is known to speak — picked explicitly, or heard last turn. */
  readonly known?: string | null;
  readonly onHeard?: (language: string) => void;
}

export interface Turn {
  sendAudio(base64Frame: string): void;
  finish(): Promise<void>;
  cancel(): void;
}

/**
 * Notes that matter when implementing this:
 *
 * - Speculation: people pause before releasing the button. If the interim
 *   transcript holds still while the button is still down, start the model then
 *   and buffer its tokens; adopt that generation at release if the words still
 *   match. Nothing speculative is ever shown or spoken — a wrong guess costs a
 *   wasted request, never a wrong answer.
 * - Do not wait for the final transcript before starting the model; the final
 *   lands before the first token anyway, so reconciling it is free.
 * - Per-sentence TTS finishes OUT OF ORDER. Every piece carries an index and the
 *   client plays strictly in index order.
 * - Silence is not a question. A silent mic can "transcribe" as punctuation with
 *   a confidently detected language; if the transcript has no letters at all,
 *   answer nothing and say so.
 * - Check the answer's script on its first few words: a model told "Telugu" has
 *   been observed replying in Hinglish. A wrong script is replaced by exactly one
 *   restart, never a loop.
 */
export function createTurn(_options: TurnOptions): Turn {
  throw new Error('not implemented');
}
