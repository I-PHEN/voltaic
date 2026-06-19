# Voltaic — AI-Powered Instrument Planner (Design Spec)

**Date:** 2026-06-19
**Status:** Approved, ready for implementation planning
**Author:** Michael + Claude

## 1. Goal

Replace the brittle two-branch keyword matcher in `src/data/workflow.ts` with a real
LLM planner. Given *any* plain-English measurement intent, the planner selects the right
Rohde & Schwarz instruments, **parses the actual parameter values out of the prompt**
(today "500 MHz" is hardcoded regardless of what the user typed), wires them in
signal-flow order, and feeds the result into the existing staged-narration UI.

The deterministic SCPI/Python template (`src/data/scriptGenerator.ts`) is **not** changed:
the model plans, the template compiles. This keeps generated Python guaranteed-valid and
directly serves the hackathon judging criteria of Correctness and Safety.

### Non-goals (this spec)
- Incremental/conversational edits to an existing canvas (deferred; data flow is reserved).
- ZNLE6 and 7352A device support (stay sidebar-only, per PRD out-of-scope).
- Tool/function calling, token streaming, production hosting of the proxy.
- Changing the canvas, inspector, validation, or script-modal UI.

## 2. Decisions (locked during brainstorming)

| Decision | Choice |
| --- | --- |
| Provider | Groq, model `openai/gpt-oss-120b`, via OpenAI-compatible REST API |
| Swappability | `LLM_BASE_URL` / `LLM_MODEL` / `GROQ_API_KEY` from env; switch provider = change env only |
| API access | Vite dev-server middleware proxy; key stays server-side, never in the browser bundle |
| AI scope | **Plan only** — devices + parsed params + connections + summary. Template still compiles SCPI |
| Output mechanism | JSON structured output (`response_format: json_object`) + schema validation |
| Interaction model | Fresh layout per prompt now; `currentNodes` sent but unused (reserved for later incremental edits) |
| Device coverage | The 4 fully-wired devices only: NGE100, FPC1500, RTB24, HMF2550 |
| Failure behavior | Fall back to the existing keyword matcher so the demo never hard-fails |
| Validation deps | `zod` for schema validation; plain `fetch` (no vendor SDK) |

## 3. Architecture & data flow

```
User types intent
  → App.processIntent(intent)            // becomes async
  → fetchPlan(intent, currentNodes)
  → POST /api/plan { intent, currentNodes }
       └─ Vite dev middleware  (server/planHandler.ts)
            → reads GROQ_API_KEY / LLM_BASE_URL / LLM_MODEL from env
            → builds prompt from deviceSchemas (catalog + limits + few-shot)
            → POST {LLM_BASE_URL}/chat/completions
                 { model, response_format: { type: 'json_object' }, messages }
            → parse JSON → zod-validate → clamp params to device limits
            → 200 { plan }   |   4xx/5xx { error }
  → planToWorkflowSteps(plan)            // deterministic x/y layout
  → runStagedWorkflow(steps)             // EXISTING animation — unchanged

On ANY failure (no key / invalid JSON / rate-limit / timeout / network):
  → generateWorkflowSteps(intent)        // EXISTING keyword matcher (fallback)
  → runStagedWorkflow(steps)
```

The model's output plugs into the **existing** `WorkflowStep[]` pipeline, so the canvas,
narration, inspector, Validate button, and script modal all keep working with no UI rewrite.

## 4. The plan contract

The model must return a JSON object matching this shape (defined once, shared by client
and server via `src/data/planSchema.ts`):

```ts
interface Plan {
  devices: {
    deviceId: 'nge100' | 'fpc1500' | 'rtb24' | 'hmf2550';
    properties: Record<string, number | boolean | string>; // only keys valid for that device
    role: string;        // short reason; used as the add_device narration line
  }[];
  connections: { from: number; to: number }[];  // indices into devices[]
  summary: string;       // the assistant's closing chat message
}
```

The model does **not** choose `x`/`y`. Positions are computed deterministically by
`planToWorkflowSteps` (left-to-right, evenly spaced) so nodes never overlap — an
improvement over the current mock, which hardcodes coordinates.

## 5. Components / files

### New
- `src/data/deviceSchemas.ts` — **single source of truth** for each device: param keys,
  types, defaults, units, and min/max hardware limits. Consumed by the planner prompt,
  server-side clamping, and the client `Validate` button.
- `src/data/planSchema.ts` — `Plan` TypeScript type + zod schema. Shared by client + server.
- `src/data/planClient.ts` — `fetchPlan(intent, nodes)` (POSTs `/api/plan`, returns `Plan`
  or throws) and `planToWorkflowSteps(plan): WorkflowStep[]` (pure converter with layout).
- `server/planHandler.ts` — request handler: build prompt from `deviceSchemas`, call the
  provider, validate + clamp, return `{ plan }` or an error. Framework-free (takes intent,
  returns a result) so it is unit-testable without Vite.
- `.env.example` — committed template (`GROQ_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`).

### Changed
- `vite.config.ts` — register a dev-middleware plugin that loads env and routes
  `POST /api/plan` to `server/planHandler.ts`.
- `src/App.tsx` — `processIntent` becomes async: try `fetchPlan` → `planToWorkflowSteps`,
  catch → keyword fallback. Show the existing typing indicator while awaiting.
- `src/data/workflow.ts` — keep `generateWorkflowSteps` as the fallback (no removal).
- `.gitignore` — `.env` ignored; `docs/superpowers/` tracked (already applied).

### Dependencies
- Add `zod`. No vendor SDK — OpenAI-compatible `fetch` keeps the integration light and swappable.

## 6. Prompt design

System message:
- Role: "You are Voltaic's instrumentation planner for Rohde & Schwarz test benches."
- Auto-generated device catalog from `deviceSchemas`: each device's purpose, valid param
  keys, units, and limits.
- Rules: use only the listed devices and param keys; parse numeric values from the user's
  request; choose sensible defaults when a value is unspecified; connect devices in
  signal-flow order (source → measurement); return ONLY a JSON object matching the schema.
- Few-shot: the two existing intents (SNR/amplifier → NGE100+FPC1500; sine wave →
  HMF2550+RTB24) serve as worked examples. This substantially improves gpt-oss-120b
  reliability.

User message: the intent string. (`currentNodes` is accepted by the endpoint but not yet
injected into the prompt — reserved for the incremental-edit stretch goal.)

## 7. Validation, safety & fallback

- **Server validation:** zod guard rejects wrong shape, unknown `deviceId`, or unknown
  property keys. Parameters outside a device's hardware limits are **clamped** to the limit
  and the adjustment is appended to `summary` (e.g., "NGE100 voltage clamped to 32 V max").
  This is the demoable "Safety" behavior.
- **One retry:** if the model returns unparseable/invalid JSON, retry once with an explicit
  "return valid JSON only" instruction before failing.
- **Fallback ladder:** no key (503) → invalid after retry (422) → rate-limit (429) →
  timeout/network — all fall through to `generateWorkflowSteps(intent)`. The keyword matcher
  is the safety net, so the live demo never dead-ends. A subtle "offline planner" hint may
  be shown when the fallback is used.

## 8. Testing

No test runner exists yet. Add **vitest** (dev dependency) and cover the pure logic:

- `planSchema` accepts a valid plan and rejects: unknown device, unknown property key,
  out-of-range value (asserting it clamps), malformed connections.
- `planToWorkflowSteps` emits `thinking` → `add_device` × N → `connect` × M → `summary`
  in order, with non-overlapping deterministic coordinates.
- The fallback path in `processIntent` triggers `generateWorkflowSteps` when `fetchPlan`
  throws (logic extracted so it is testable without the network).

Manual prompt matrix (run `npm run dev`):
- "measure SNR of amplifier at 900 MHz" → FPC1500 center freq = **900**, not 500.
- "show me a 2 kHz square wave on the scope" → HMF2550 + RTB24, freq = 2 kHz.
- "power a board at 5 V and 2 A" → NGE100 with voltage 5, current 2.
- "make me a sandwich" (nonsense) → graceful fallback, no crash.

## 9. Operational notes

- The proxy runs only under `npm run dev` (Vite `configureServer` middleware). The demo
  runs in dev mode. Production hosting of the endpoint is out of scope.
- The Groq free tier is rate-limited; the fallback ladder covers 429s during heavy demo use.
- Swapping to Claude later: change the three env vars (e.g., point `LLM_BASE_URL` at
  OpenRouter and set an Anthropic model), or add a tiny adapter — no app-code rewrite.
