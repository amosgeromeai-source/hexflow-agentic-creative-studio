/**
 * Shapes exchanged with the n8n backend.
 *
 * The raw response is deliberately typed loosely: n8n workflows rename, nest and
 * stringify fields as they are edited, so the UI never consumes the raw payload.
 * `src/utils/normalize.ts` converts whatever arrives into `NormalizedProduction`,
 * which is the ONLY shape components are allowed to read.
 */

/** POST body sent to VITE_N8N_WEBHOOK_URL. */
export interface CreateProductionRequest {
  project_name: string;
  idea: string;
  duration: number;
  style: string;
  name: string;
  email: string;
  website: string;
}

/** Canonical run outcomes. */
export type ProductionStatus =
  | 'completed'
  | 'completed_after_revision'
  | 'needs_human_review';

/** Parsed "STATUS: …" / "FINAL VERDICT: …" verdict found inside a review. */
export type ReviewVerdict =
  | 'APPROVED'
  | 'READY WITH WARNINGS'
  | 'NEEDS REVISION'
  | 'NEEDS HUMAN REVIEW'
  | 'UNKNOWN';

/**
 * The single stable object every component reads.
 * Empty string means "the workflow did not return this"; never null-checked ad hoc.
 */
export interface NormalizedProduction {
  success: boolean;
  /** Canonical status after reconciling the backend field with the review verdict. */
  status: ProductionStatus;
  /** Exactly what the backend put in its status field, for display/debugging. */
  rawStatus: string;

  projectName: string;
  duration: string | number | null;
  visualStyle: string;
  email: string;
  submittedBy: string;
  website: string;
  idea: string;

  /** Agent outputs. */
  creativeDirection: string;
  script: string;
  scenePlan: string;
  generationPrompts: string;

  /** Review chain. */
  initialReview: string;
  initialQualityScore: number | null;
  initialVerdict: ReviewVerdict;
  revisedPackage: string;
  finalReview: string;
  finalQualityScore: number | null;
  finalVerdict: ReviewVerdict;

  /** True only when the Revision Agent actually ran. */
  revised: boolean;
  /** Agents that ran, out of the seven in the chain. */
  agentsRun: number;
  agentsTotal: number;

  message: string;
  /** Untouched payload, kept for the error/debug panel only. */
  raw: unknown;
}

/** Categories of failure the UI can explain in plain language. */
export type AppErrorKind =
  | 'network'
  | 'cors'
  | 'server'
  | 'invalid_json'
  | 'empty'
  | 'not_configured'
  | 'unknown';

export interface AppError {
  kind: AppErrorKind;
  title: string;
  message: string;
  /** Raw detail — surfaced only in the console and an optional details panel. */
  detail?: string;
}

/** Top-level screen the app is showing. */
export type AppView = 'landing' | 'processing' | 'results' | 'human_review' | 'error';
