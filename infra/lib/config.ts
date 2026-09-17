export const REGION = 'ap-northeast-1';

export const APP_NAME = 'skillbridge';

export const stackName = (suffix: string) => `${APP_NAME}-${suffix}`;

/**
 * Bedrock models, tiered by latency need (see FEATURES.md §13).
 *
 * These are INFERENCE PROFILE ids, not bare foundation-model ids. Verified
 * 2026-09-17: invoking a bare model id in ap-northeast-1 fails with
 * "Invocation of model ID ... with on-demand throughput isn't supported. Retry
 * your request with the ID or ARN of an inference profile."
 *
 * `jp.` profiles keep inference inside the Japan region rather than routing
 * globally, which matters most for the one synchronous agent.
 *
 * Claude Sonnet 5 is NOT entitled on this account (AccessDeniedException:
 * "not available for this account"), so the three asynchronous agents run
 * Sonnet 4.6 — confirmed invoking.
 */
export const MODELS = {
  voiceOrchestrator: 'jp.anthropic.claude-haiku-4-5-20251001-v1:0',
  learningPlanGenerator: 'jp.anthropic.claude-sonnet-4-6',
  assessmentScorer: 'jp.anthropic.claude-sonnet-4-6',
  skillProfiler: 'jp.anthropic.claude-sonnet-4-6',
} as const;

/**
 * The foundation models behind those profiles. A cross-region inference profile
 * needs invoke permission on BOTH the profile and the underlying foundation
 * model in every region the profile may route to — granting only the profile
 * ARN produces an AccessDenied at call time.
 */
export const UNDERLYING_MODELS = [
  'anthropic.claude-haiku-4-5-20251001-v1:0',
  'anthropic.claude-sonnet-4-6',
] as const;

export const ROLES = ['worker', 'manager', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Raw tutor queries and activity events are profiler input, not a permanent record. */
export const EVENT_TTL_DAYS = 90;
