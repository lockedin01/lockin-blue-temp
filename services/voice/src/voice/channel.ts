import type { WebSocket } from 'ws';
import type { Server } from 'node:http';

/**
 * The live voice channel.  ws://<service>/voice/stream
 *
 * A channel is warmed when the panel OPENS, not at button-down: TCP, TLS, the
 * HTTP upgrade and token verification all happen while the worker is still
 * deciding what to ask, so button-down has nothing left to do but listen. A
 * channel also outlives a turn, so the second question is as fast as the first.
 *
 * Wire protocol — client → server:
 *   { t: 'start',  token }              panel open; authenticates the channel
 *   { t: 'begin',  language, history }  button down
 *   { t: 'audio',  b64 }                50ms linear16 @16k frames
 *   { t: 'stop' }                       button up
 *   { t: 'cancel' }                     turn abandoned
 *
 * Server → client:
 *   ready, listening, partial, final, thinking, delta,
 *   audio_start { rate }, audio { seq, b64 }, audio_end,
 *   reply, empty, expired, error, done
 *
 * 50ms frames rather than the 100ms Sarvam suggests: that buffer is paid on the
 * FIRST word, which is the one being watched for.
 */

export const PATH = '/voice/stream';

/** A turn is a few seconds of audio; past this it is a stuck button, not a question. */
const MAX_AUDIO_FRAMES = 800;

/** One channel serves one panel. */
const MAX_SOCKETS_PER_USER = 3;

/**
 * A warmed channel is authenticated once and held across several questions — so
 * it must not live long enough for that authorization to go stale. On expiry the
 * client silently warms a fresh one, which re-verifies the token.
 */
const CHANNEL_MAX_MS = 15 * 60 * 1000;
const CHANNEL_IDLE_MS = 5 * 60 * 1000;

void MAX_AUDIO_FRAMES;
void MAX_SOCKETS_PER_USER;
void CHANNEL_MAX_MS;
void CHANNEL_IDLE_MS;

/**
 * Attach the WebSocket endpoint to the HTTP server.
 *
 * Takes the http.Server, not the Express app: a WebSocket arrives as a protocol
 * upgrade and never reaches Express middleware. That also means this path gets
 * no rate limiting, no body parsing and no 401 handling for free — auth and
 * limits are re-implemented here deliberately.
 *
 * The Origin check is not optional. A WebSocket is not subject to the
 * same-origin policy and an upgrade never reaches CORS middleware, so without it
 * any site on the internet could open a socket here. The loopback exemption is
 * hard-gated on NODE_ENV.
 */
export function attach(_server: Server): void {
  throw new Error('not implemented');
}

export function handleConnection(_ws: WebSocket): void {
  throw new Error('not implemented');
}
