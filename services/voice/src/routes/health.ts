import { Router } from 'express';
import { LANGUAGES } from '../sarvam/client.js';
import { config } from '../config.js';

export const health = Router();

/** App Runner health check. */
health.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

/**
 * Lets the client grey the mic button out honestly rather than discovering at
 * button-down that the service cannot answer.
 */
health.get('/voice/config', (_req, res) => {
  res.json({
    configured: Boolean(config.sarvam.apiKey),
    languages: LANGUAGES,
    models: {
      stt: config.sarvam.sttModel,
      tts: config.sarvam.ttsModel,
      translate: config.sarvam.translateModel,
      reply: config.bedrock.modelId,
    },
  });
});
