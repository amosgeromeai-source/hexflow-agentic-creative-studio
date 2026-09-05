# HexFlow — Agentic Creative Studio

Frontend for a multi-agent creative-production workflow. A user submits one brief;
an n8n backend runs a chain of specialist agents (creative direction → script →
scene plan → generation prompts → quality review, with an automatic revision pass
when the first review falls short) and returns a production package. HexFlow makes
that pipeline legible and presents the result as a dashboard rather than a JSON blob.

React · Vite · TypeScript · Tailwind CSS · lucide-react. No database, no auth, no
paid APIs, no server of its own — it is a static site that talks to one webhook.

---

## 1. Install

```bash
npm install
```

Requires Node 18+ (Node 20 is what Netlify builds with here).

## 2. Configure the backend URL

```bash
cp .env.example .env
```

Then edit `.env`:

```
VITE_N8N_WEBHOOK_URL=https://your-n8n-domain/webhook/hexflow-create
```

This is the only required setting. Vite inlines `VITE_`-prefixed variables at
**build time**, so changing it means rebuilding (or restarting `npm run dev`).

If the variable is missing, the app still runs and renders — the create form shows
a clear "no backend configured" notice instead of failing silently.

## 3. Run locally

```bash
npm run dev      # http://localhost:5173
```

## 4. Build

```bash
npm run build    # type-checks, then outputs to dist/
npm run preview  # serve the production build locally
```

`npm run typecheck` runs the TypeScript check on its own.

## 5. Deploy to Netlify

`netlify.toml` is already set up:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

It also adds an SPA redirect (`/* → /index.html`) and long-lived caching for
hashed assets.

**Via the Netlify UI**

1. Push this repo to GitHub, then *Add new site → Import an existing project*.
2. Netlify reads `netlify.toml`, so build command and publish directory are filled in.
3. Before the first deploy, open **Site configuration → Environment variables** and add:

   | Key | Value |
   | --- | --- |
   | `VITE_N8N_WEBHOOK_URL` | `https://your-n8n-domain/webhook/hexflow-create` |

4. Deploy. If you add or change the variable later, trigger a redeploy —
   the value is baked into the bundle at build time.

**Via the CLI**

```bash
npm i -g netlify-cli
netlify init
netlify env:set VITE_N8N_WEBHOOK_URL "https://your-n8n-domain/webhook/hexflow-create"
netlify deploy --build --prod
```

---

## Personal links

`src/config.ts` holds everything you'll want to swap:

```ts
export const PERSONAL_WEBSITE_URL = 'https://YOUR-WEBSITE-HERE.com';
export const GITHUB_URL = 'https://github.com/your-handle';
export const QUALITY_THRESHOLD = 85;   // shown on the pipeline diagram
```

Duration options and the visual-style presets live there too.

---

## Backend contract

**Request** — `POST` to `VITE_N8N_WEBHOOK_URL`, `Content-Type: application/json`:

```json
{
  "project_name": "Verilyx Automation",
  "idea": "Create a cinematic futuristic advertisement for an AI trading platform…",
  "duration": 30,
  "style": "Cinematic Futuristic",
  "name": "Amos Gerome",
  "email": "you@example.com",
  "website": "https://verilyx.com"
}
```

There is **no request timeout** — the agent chain may run for minutes, and the
processing screen keeps the user informed while it does.

**Responses** — three shapes are supported:

<details>
<summary>A. Approved on first review</summary>

```json
{
  "success": true,
  "status": "completed",
  "creative_direction": "…",
  "script": "…",
  "scene_plan": "…",
  "generation_prompts": "…",
  "quality_review": "…",
  "metadata": { "idea": "…", "duration": 30, "style": "…" }
}
```
</details>

<details>
<summary>B. Automatically revised, then approved</summary>

```json
{
  "success": true,
  "status": "completed_after_revision",
  "revised": true,
  "original_quality_review": "…",
  "revised_production_package": "…",
  "final_quality_review": "…",
  "final_quality_score": 94,
  "metadata": { "idea": "…", "duration": 30, "style": "…" }
}
```
</details>

<details>
<summary>C. Needs human review</summary>

```json
{
  "success": false,
  "status": "needs_human_review",
  "message": "Automatic revision completed, but the project did not reach the required quality threshold."
}
```
</details>

### How the response is read: `src/utils/normalize.ts`

Field names on the n8n side drift as the workflow is edited, so the UI never reads
the raw payload. `normalizeProduction()` is the single layer that turns any of the
shapes above — plus renamed, nested or stringified variants — into one stable
`NormalizedProduction` object, and every component consumes only that.

It works in three steps:

1. **Collect.** A breadth-first walk of the entire payload gathers every scalar
   leaf, keyed by a normalized form of its name (lowercased, separators stripped).
   So `creative_direction`, `creativeDirection` and `"Creative Direction"` all
   resolve to the same lookup. Arrays, `json` / `data` / `body` envelopes and
   values that are themselves JSON strings are walked too — no envelope name has
   to be known in advance. Breadth-first means a top-level `duration` beats a
   nested `metadata.duration`.
2. **Resolve by alias.** Each output is looked up through an alias list in
   `KEYS` — for example `revisedPackage` accepts `revised_package`,
   `revised_production_package`, `revision_agent`, `revision_output` and others.
   **When the workflow renames a field, add the new name to that one list; nothing
   else changes.** Reviews resolve through three buckets — initial-specific,
   final-specific, and the un-prefixed `quality_review` — so the same payload key
   maps correctly whether or not a revision ran.
3. **Derive.** Scores, verdicts, the canonical status and the agent count are
   computed from what was actually found. A field the workflow did not send stays
   `''` or `null` — never a placeholder, and never a guess.

**Quality scores** — a numeric API field wins when present
(`final_quality_score`, `original_quality_score`, `quality_score`). Otherwise
`parseQualityScore()` reads it out of the review prose, handling
`QUALITY SCORE: 94`, `QUALITY SCORE: 94/100`, `Quality Score: 94`,
`Quality Score: 94/100`, `**QUALITY SCORE:** 94`, `FINAL QUALITY SCORE — 92`,
a score on the next line, and a bare `94/100`. Patterns are ordered by
specificity, so `FINAL QUALITY SCORE` always beats a bare `SCORE` later in the
document. `parseReviewStatus()` reads `STATUS:`, `FINAL VERDICT:`, `VERDICT:` and
`RECOMMENDATION:` lines, with the alternation ordered longest-first so
`NEEDS HUMAN REVIEW` is never truncated to `NEEDS REVISION`. Both live in
`src/utils/quality.ts`.

**Which score is which** — if the Revision Agent ran, the initial score comes from
the Quality Reviewer and the final score from the Final Quality Reviewer
(`70 → Automatic Revision → 92`). If it did not run, the single Quality Reviewer
score is the final score, the revision timeline is not shown, and no revision is
implied anywhere in the UI.

**Status is reconciled, not trusted.** `completed_after_revision` renders as
*Approved After Revision* only if the final review agrees. A final review carrying
`STATUS: NEEDS HUMAN REVIEW` — or still asking for a revision after one already
ran — routes to the human-review screen no matter what the backend called it, so a
package that needs a person is never labelled Approved.

**Tabs follow the data.** A result tab is created only when its agent actually
returned content, so an agent that did not run leaves no empty panel behind.

### Two things to check on the n8n side

1. **Respond to Webhook.** The workflow must end with a *Respond to Webhook* node
   returning JSON, otherwise the browser gets an empty body and HexFlow shows the
   "backend returned nothing" state.
2. **CORS.** The response needs `Access-Control-Allow-Origin` covering your Netlify
   domain (and a handled `OPTIONS` preflight). A browser reports a blocked
   cross-origin request as a generic network failure, so HexFlow's
   "couldn't reach the backend" screen lists this as a likely cause.

---

## Demo mode (optional)

To walk someone through all three outcomes without a live backend:

```
VITE_HEXFLOW_DEMO_MODE=true
```

Then open `?demo=first`, `?demo=revised` or `?demo=human`. The sample payloads live
in `src/utils/demoFixtures.ts` and are code-split, so they are never downloaded
unless the flag is on. Leave the flag unset for a real deployment.

---

## Project structure

```
src/
  components/        Header, Hero, PipelineVisualization, HowItWorks, About,
                     ProjectForm, ProcessingScreen, ResultsDashboard, ResultTabs,
                     ResultSection, QualityScore, RevisionTimeline,
                     HumanReviewScreen, ErrorState, RichText, Footer …
  pages/
    LandingPage.tsx  Composes the marketing sections + the create form
  hooks/
    useProduction    Submit → processing → result lifecycle
    useElapsed       Wall-clock timer (survives tab throttling)
    useStageSimulation  Estimated stage progression
    useCopy, useScrollSpy
  utils/
    normalize.ts     THE response normalization layer — field aliases live here
    api.ts           fetch client (no timeout); hands the payload to normalize.ts
    quality.ts       score / verdict parsing
    format.ts        AI text → renderable blocks, elapsed formatting, clipboard
    validation.ts    create-form rules
    exportPackage.ts Copy All / markdown download
    pipeline.ts      Agent definitions shared across the UI
  types/api.ts       Request and response interfaces
  config.ts          Links, style presets, threshold, webhook URL
```

### Notes on two deliberate decisions

**Stage progress is estimated, and says so.** The workflow reports back once, at the
end — there are no realtime stage events. The processing screen advances through the
agent chain on a timer to keep the wait legible, labels the strip *Estimated
progress*, and never marks the final stage complete until a real response arrives.
Once the estimate runs out (150s) it stops naming an agent altogether: the heading
becomes *Workflow still processing…*, the strip reads *Stage unknown*, and the
conditional agents move under *May be running now* — because past that point the
Revision Agent or Final Quality Reviewer may well be the one working, and claiming
"Quality Reviewer" indefinitely would be a lie. Real per-agent status needs a job
store on the backend; this is the honest interim.

**AI output is rendered, not dumped.** `RichText` parses headings, bullet and
numbered lists, blockquotes, fenced code and inline emphasis out of the loosely
structured text the agents produce, so each section reads as a document. Every
section has its own Copy button, plus Copy All and a markdown download.

---

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Type-check, then production build into `dist/` |
| `npm run preview` | Serve the built site locally |
| `npm run typecheck` | TypeScript only, no emit |

---

Output is AI-assisted and quality reviewed before release. Review production
packages before use.
