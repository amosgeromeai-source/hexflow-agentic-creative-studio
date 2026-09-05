import { coerceScore, parseQualityScore, parseReviewStatus } from './quality';
import type {
  CreateProductionRequest,
  NormalizedProduction,
  ProductionStatus,
  ReviewVerdict,
} from '@/types';

/**
 * ONE normalization layer.
 *
 * n8n responses vary: fields get renamed as the workflow is edited, items arrive
 * wrapped in arrays or `json`/`data`/`body` envelopes, agent output is sometimes
 * a JSON string rather than an object, and scores often exist only inside prose.
 * Everything below turns any of that into a single stable `NormalizedProduction`
 * that the UI reads. No component touches the raw payload.
 *
 * Two rules keep it honest:
 *   1. A field that genuinely is not in the response becomes '' or null —
 *      never a guess, never a placeholder.
 *   2. A failing verdict in the final review overrides an optimistic backend
 *      status, so a package that needs a human is never labelled Approved.
 */

type Scalar = string | number | boolean;
type FieldMap = Map<string, Scalar>;

/** "Creative_Direction", "creativeDirection" and "Creative Direction" all collapse
 *  to the same lookup key, so renames on the n8n side stop breaking the UI. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Agent output is sometimes handed over as a JSON string. */
function parseEmbeddedJson(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.length < 2) return null;
  const first = trimmed[0];
  if (first !== '{' && first !== '[') return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

const MAX_NODES = 4000;

/**
 * Breadth-first walk of the whole payload, collecting every scalar leaf by its
 * normalized key. Breadth-first means shallower keys win over deeper ones, which
 * is what you want when `metadata.duration` and a top-level `duration` disagree.
 * Objects found inside JSON strings are walked too.
 */
export function collectFields(payload: unknown): FieldMap {
  const found: FieldMap = new Map();
  const queue: unknown[] = [payload];
  const seen = new Set<object>();
  let visited = 0;

  while (queue.length > 0 && visited < MAX_NODES) {
    const node = queue.shift();
    visited += 1;
    if (node === null || node === undefined || typeof node !== 'object') continue;

    if (seen.has(node)) continue;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) queue.push(item);
      continue;
    }

    for (const [rawKey, value] of Object.entries(node as Record<string, unknown>)) {
      const key = normalizeKey(rawKey);
      if (key.length === 0) continue;

      if (typeof value === 'string') {
        if (value.trim().length > 0 && !found.has(key)) found.set(key, value);
        const embedded = parseEmbeddedJson(value);
        if (embedded !== null) queue.push(embedded);
        continue;
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        if (!found.has(key)) found.set(key, value);
        continue;
      }

      if (value && typeof value === 'object') queue.push(value);
    }
  }

  return found;
}

/* ------------------------------------------------------------------ *
 * Field aliases. Add a name here when the workflow renames something;
 * nothing else in the app needs to change.
 * ------------------------------------------------------------------ */

const KEYS = {
  status: ['status', 'workflowstatus', 'runstatus', 'outcome', 'state', 'result'],
  success: ['success', 'ok', 'succeeded', 'issuccess'],
  message: ['message', 'statusmessage', 'note', 'reason', 'detail', 'details', 'info'],
  revisedFlag: ['revised', 'wasrevised', 'revisionapplied', 'didrevise', 'revisionran'],

  projectName: ['projectname', 'project', 'brandname', 'brand', 'projecttitle', 'title'],
  submittedBy: ['name', 'username', 'clientname', 'contactname', 'submittedby', 'requestedby'],
  email: ['email', 'useremail', 'clientemail', 'contactemail', 'emailaddress'],
  website: ['website', 'websiteurl', 'brandurl', 'siteurl', 'url'],
  duration: ['duration', 'durationseconds', 'lengthseconds', 'runtime', 'videoduration', 'length'],
  visualStyle: ['style', 'visualstyle', 'stylepreset', 'aesthetic', 'lookandfeel'],
  idea: ['idea', 'creativeidea', 'brief', 'userbrief', 'creativebrief'],

  creativeDirection: [
    'creativedirection',
    'creativedirector',
    'creativedirectionoutput',
    'creativedirectoroutput',
    'direction',
    'creativeconcept',
  ],
  script: [
    'script',
    'scriptarchitect',
    'scriptoutput',
    'scriptarchitectoutput',
    'timedscript',
    'narrativescript',
    'screenplay',
  ],
  scenePlan: [
    'sceneplan',
    'sceneplanner',
    'sceneplanoutput',
    'sceneplanneroutput',
    'scenes',
    'shotlist',
    'scenebreakdown',
  ],
  generationPrompts: [
    'generationprompts',
    'generationprompt',
    'promptengineer',
    'promptengineeroutput',
    'prompts',
    'aiprompts',
    'productionprompts',
  ],

  /** Reviews are resolved in three buckets: initial-specific, final-specific, plain. */
  initialReview: [
    'originalqualityreview',
    'initialqualityreview',
    'firstqualityreview',
    'originalreview',
    'initialreview',
    'firstreview',
    'previousreview',
    'prerevisionreview',
  ],
  finalReview: [
    'finalqualityreview',
    'finalreview',
    'finalqualityreviewer',
    'finalqualityreviewoutput',
    'finalreviewoutput',
    'finalaudit',
    'finalqualitycheck',
  ],
  plainReview: [
    'qualityreview',
    'qualityreviewer',
    'qualityrevieweroutput',
    'qualityreviewoutput',
    'qualityreport',
    'qualityaudit',
    'review',
  ],

  revisedPackage: [
    'revisedproductionpackage',
    'revisedpackage',
    'revisionagent',
    'revisionagentoutput',
    'revisedoutput',
    'revisionoutput',
    'revision',
    'revisedproduction',
    'revisedcontent',
  ],

  initialScore: [
    'originalqualityscore',
    'initialqualityscore',
    'firstqualityscore',
    'originalscore',
    'initialscore',
    'previousscore',
  ],
  finalScore: [
    'finalqualityscore',
    'finalscore',
    'revisedqualityscore',
    'revisedscore',
    'finalqualityrating',
  ],
  plainScore: ['qualityscore', 'score', 'overallscore', 'qualityrating'],
} as const;

function pick(map: FieldMap, aliases: readonly string[]): Scalar | undefined {
  for (const alias of aliases) {
    const value = map.get(alias);
    if (value !== undefined) return value;
  }
  return undefined;
}

function pickText(map: FieldMap, aliases: readonly string[]): string {
  const value = pick(map, aliases);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function pickScore(map: FieldMap, aliases: readonly string[]): number | null {
  return coerceScore(pick(map, aliases));
}

function pickDuration(map: FieldMap, aliases: readonly string[]): string | number | null {
  const value = pick(map, aliases);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) ? numeric : value.trim();
  }
  return null;
}

function pickBoolean(map: FieldMap, aliases: readonly string[]): boolean | undefined {
  const value = pick(map, aliases);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true' || lower === 'yes') return true;
    if (lower === 'false' || lower === 'no') return false;
  }
  return undefined;
}

/** "Completed After Revision" → "completed_after_revision" */
function slugStatus(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** True when this response carries nothing the UI could render. */
function hasAnyContent(fields: {
  creativeDirection: string;
  script: string;
  scenePlan: string;
  generationPrompts: string;
  initialSpecific: string;
  plainReview: string;
  finalSpecific: string;
  revisedPackage: string;
}): boolean {
  return Object.values(fields).some((value) => value.length > 0);
}

export function normalizeProduction(payload: unknown): NormalizedProduction | null {
  if (payload === null || payload === undefined) return null;

  const map = collectFields(payload);
  if (map.size === 0) return null;

  const rawStatus = pickText(map, KEYS.status);
  const statusSlug = slugStatus(rawStatus);
  const successField = pickBoolean(map, KEYS.success);

  const creativeDirection = pickText(map, KEYS.creativeDirection);
  const script = pickText(map, KEYS.script);
  const scenePlan = pickText(map, KEYS.scenePlan);
  const generationPrompts = pickText(map, KEYS.generationPrompts);

  const initialSpecific = pickText(map, KEYS.initialReview);
  const plainReview = pickText(map, KEYS.plainReview);
  const finalSpecific = pickText(map, KEYS.finalReview);
  const revisedPackage = pickText(map, KEYS.revisedPackage);

  const usable =
    hasAnyContent({
      creativeDirection,
      script,
      scenePlan,
      generationPrompts,
      initialSpecific,
      plainReview,
      finalSpecific,
      revisedPackage,
    }) || statusSlug.length > 0;

  if (!usable) return null;

  /* --- did the Revision Agent actually run? ----------------------------- */

  const statusSaysRevision = /revis/.test(statusSlug);
  const statusSaysHuman = /human/.test(statusSlug) || /escalat/.test(statusSlug);
  const revisedFlag = pickBoolean(map, KEYS.revisedFlag);

  const revised = Boolean(
    revisedPackage.length > 0 ||
      finalSpecific.length > 0 ||
      statusSaysRevision ||
      statusSaysHuman ||
      revisedFlag === true ||
      (initialSpecific.length > 0 && plainReview.length > 0 && initialSpecific !== plainReview),
  );

  /* --- map the review buckets onto initial / final ---------------------- */

  let initialReview = '';
  let finalReview = '';

  if (revised) {
    // On a revised run the un-prefixed review is the FIRST one; the Final
    // Quality Reviewer's output is whatever carries a "final" name.
    initialReview = initialSpecific || plainReview;
    finalReview = finalSpecific;
    // Only one review text present and it is named "final": leave initial empty
    // rather than duplicating it and implying a first review we never saw.
  } else {
    // No revision: the single review IS the final word on the package.
    finalReview = plainReview || finalSpecific || initialSpecific;
    initialReview = '';
  }

  /* --- scores: API field first, prose second --------------------------- */

  const initialScoreField = pickScore(map, KEYS.initialScore);
  const finalScoreField = pickScore(map, KEYS.finalScore);
  const plainScoreField = pickScore(map, KEYS.plainScore);

  let initialQualityScore: number | null;
  let finalQualityScore: number | null;

  if (revised) {
    initialQualityScore =
      initialScoreField ?? parseQualityScore(initialReview) ?? plainScoreField ?? null;
    finalQualityScore =
      finalScoreField ?? parseQualityScore(finalReview) ?? parseQualityScore(revisedPackage) ?? null;
  } else {
    finalQualityScore = finalScoreField ?? plainScoreField ?? parseQualityScore(finalReview) ?? null;
    // Nothing was revised, so the one score is both the first and the final word.
    initialQualityScore = finalQualityScore;
  }

  const initialVerdict: ReviewVerdict = parseReviewStatus(initialReview);
  const finalVerdict: ReviewVerdict = parseReviewStatus(finalReview);

  /* --- canonical status ------------------------------------------------ */

  let status: ProductionStatus;
  if (statusSaysHuman) {
    status = 'needs_human_review';
  } else if (successField === false) {
    status = 'needs_human_review';
  } else if (revised) {
    status = 'completed_after_revision';
  } else {
    status = 'completed';
  }

  // Honesty override: whatever the backend called it, a final review that asks
  // for a human — or that still fails after a revision — is not an approval.
  if (finalVerdict === 'NEEDS HUMAN REVIEW') {
    status = 'needs_human_review';
  } else if (revised && finalVerdict === 'NEEDS REVISION') {
    status = 'needs_human_review';
  }

  const agentsRun = revised ? 7 : 5;

  return {
    success: status !== 'needs_human_review' && successField !== false,
    status,
    rawStatus,
    projectName: pickText(map, KEYS.projectName),
    duration: pickDuration(map, KEYS.duration),
    visualStyle: pickText(map, KEYS.visualStyle),
    email: pickText(map, KEYS.email),
    submittedBy: pickText(map, KEYS.submittedBy),
    website: pickText(map, KEYS.website),
    idea: pickText(map, KEYS.idea),
    creativeDirection,
    script,
    scenePlan,
    generationPrompts,
    initialReview,
    initialQualityScore,
    initialVerdict,
    revisedPackage,
    finalReview,
    finalQualityScore,
    finalVerdict,
    revised,
    agentsRun,
    agentsTotal: 7,
    message: pickText(map, KEYS.message),
    raw: payload,
  };
}

/**
 * The form values are the source of truth for anything the user typed — the
 * workflow may not echo them back. Applied after normalization, never before.
 */
export function withRequestFallbacks(
  production: NormalizedProduction,
  request: CreateProductionRequest | null,
): NormalizedProduction {
  if (!request) return production;

  return {
    ...production,
    projectName: production.projectName || request.project_name,
    duration: production.duration ?? request.duration,
    visualStyle: production.visualStyle || request.style,
    email: production.email || request.email,
    submittedBy: production.submittedBy || request.name,
    website: production.website || request.website,
    idea: production.idea || request.idea,
  };
}

/** Headline badge text for the results header. */
export function statusBadgeLabel(production: NormalizedProduction): string {
  if (production.status === 'needs_human_review') return 'Needs Human Review';

  if (production.status === 'completed_after_revision') {
    if (production.finalVerdict === 'READY WITH WARNINGS') return 'Ready With Warnings';
    return 'Approved After Revision';
  }

  switch (production.finalVerdict) {
    case 'READY WITH WARNINGS':
      return 'Ready With Warnings';
    case 'NEEDS REVISION':
      return 'Needs Revision';
    case 'APPROVED':
      return 'Approved';
    default:
      return production.finalQualityScore !== null ? 'Approved' : 'Completed';
  }
}
