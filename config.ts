/**
 * HexFlow — single place for the handful of values you'll want to change.
 * Everything here is safe to edit and commit; secrets belong in .env.
 */

/** Your personal / business website. Replace before deploying. */
export const PERSONAL_WEBSITE_URL = 'https://YOUR-WEBSITE-HERE.com';

/** Public GitHub profile or repository link shown in the footer. */
export const GITHUB_URL = 'https://github.com/amosgerome03-byte';

/** Product naming used across the UI. */
export const BRAND = {
  name: 'HexFlow',
  tagline: 'Agentic Creative Studio',
  footerNote: 'Built as an agentic AI creative-production prototype.',
} as const;

/**
 * n8n webhook that receives the production request.
 * Set VITE_N8N_WEBHOOK_URL in .env (local) and in Netlify → Site settings →
 * Environment variables (production). Vite inlines it at build time.
 */
export const N8N_WEBHOOK_URL: string = import.meta.env.VITE_N8N_WEBHOOK_URL ?? '';

/** True when the webhook URL has actually been configured. */
export const IS_WEBHOOK_CONFIGURED: boolean =
  typeof N8N_WEBHOOK_URL === 'string' &&
  N8N_WEBHOOK_URL.trim().length > 0 &&
  !N8N_WEBHOOK_URL.includes('YOUR-N8N-DOMAIN');

/** Duration choices offered in the create form. */
export const DURATION_OPTIONS = [
  { value: 15, label: '15 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '60 seconds' },
] as const;

/** Visual style presets. "Custom" reveals a free-text input. */
export const STYLE_OPTIONS = [
  'Cinematic Futuristic',
  'Luxury Minimal',
  'Cyberpunk',
  'Corporate Premium',
  'Documentary',
  'Editorial',
  'Photorealistic',
  'Technology',
  'Custom',
] as const;

/** Quality threshold the backend uses before a package is approved. */
export const QUALITY_THRESHOLD = 85;
