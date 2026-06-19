# AI Instrument Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the keyword-matcher planner with a Groq-backed LLM planner that turns any plain-English measurement intent into a validated instrument layout, feeding the existing staged-narration UI.

**Architecture:** A Vite dev-middleware proxy (`/api/plan`) holds the API key server-side and calls an OpenAI-compatible endpoint (Groq). The model returns a JSON `Plan` (devices + parsed params + connections + summary), which is zod-validated and clamped to device limits, then converted to the existing `WorkflowStep[]` and animated by the unchanged `runStagedWorkflow`. Any failure falls back to the existing keyword matcher.

**Tech Stack:** React 19, TypeScript, Vite 8, zod (validation), vitest (tests), Groq `openai/gpt-oss-120b` via REST.

## Global Constraints

- AI scope is **plan only** — never let the model write the SCPI/Python. `src/data/scriptGenerator.ts` stays unchanged.
- Provider config comes from env: `GROQ_API_KEY`, `LLM_BASE_URL` (default `https://api.groq.com/openai/v1`), `LLM_MODEL` (default `openai/gpt-oss-120b`). No key ever reaches the browser bundle.
- Plannable devices are exactly: `nge100`, `fpc1500`, `rtb24`, `hmf2550`. No others.
- Use plain `fetch` to the OpenAI-compatible `/chat/completions` endpoint — no vendor SDK.
- On any planner failure, fall back to `generateWorkflowSteps(intent)` from `src/data/workflow.ts` (keep that function).
- Frequent commits: one commit per task. Branch: `feat/ai-instrument-planner`.

## File Structure

- `src/data/deviceSchemas.ts` (new) — single source of truth: per-device param specs (key, unit, type, default, min/max/options), `clampParams`, `buildDeviceCatalog`, `plannableDeviceIds`.
- `src/data/planSchema.ts` (new) — zod `planSchema` + `Plan`/`PlanDevice` types.
- `src/data/planClient.ts` (new) — browser side: `fetchPlan(intent, currentNodes)` and pure `planToWorkflowSteps(plan)`.
- `server/planHandler.ts` (new) — `buildMessages`, `parseAndValidatePlan`, `callProvider`, `handlePlanRequest` (framework-free, unit-testable).
- `vite.config.ts` (modify) — register dev middleware routing `POST /api/plan` to `handlePlanRequest`, loading env.
- `src/App.tsx` (modify) — `processIntent` becomes async with AI→fallback logic.
- `vitest.config.ts` (new), `package.json` (modify) — test runner.

---

### Task 1: Test runner + dependencies

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `npm run test` runs vitest; `zod` available for import.

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install zod
npm install -D vitest
```

- [ ] **Step 2: Add test scripts to package.json**

In `package.json`, add to `"scripts"`:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Verify runner works**

Run: `npm run test -- --passWithNoTests`
Expected: exits 0, prints "No test files found" (or runs 0 tests) without error.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest + zod for the AI planner"
```

---

### Task 2: Device schemas, clamping, and catalog

**Files:**
- Create: `src/data/deviceSchemas.ts`
- Test: `src/data/deviceSchemas.test.ts`

**Interfaces:**
- Produces:
  - `plannableDeviceIds = ['nge100','fpc1500','rtb24','hmf2550'] as const`
  - `type PlannableDeviceId = (typeof plannableDeviceIds)[number]`
  - `interface ParamSpec { key: string; label: string; unit: string; type: 'number'|'boolean'|'enum'; default: number|boolean|string; min?: number; max?: number; options?: string[] }`
  - `interface DeviceSchema { deviceId: string; name: string; type: string; purpose: string; params: ParamSpec[] }`
  - `deviceSchemas: Record<PlannableDeviceId, DeviceSchema>`
  - `clampParams(deviceId: string, properties: Record<string, unknown>): { clamped: Record<string, unknown>; adjustments: string[] }`
  - `buildDeviceCatalog(): string`

- [ ] **Step 1: Write the failing test**

Create `src/data/deviceSchemas.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { deviceSchemas, plannableDeviceIds, clampParams, buildDeviceCatalog } from './deviceSchemas'

describe('deviceSchemas', () => {
  it('covers exactly the four plannable devices', () => {
    expect([...plannableDeviceIds]).toEqual(['nge100', 'fpc1500', 'rtb24', 'hmf2550'])
    for (const id of plannableDeviceIds) {
      expect(deviceSchemas[id]).toBeDefined()
      expect(deviceSchemas[id].params.length).toBeGreaterThan(0)
    }
  })

  it('clamps an out-of-range value and reports the adjustment', () => {
    const { clamped, adjustments } = clampParams('nge100', { voltage: 99, current: 1 })
    expect(clamped.voltage).toBe(32)
    expect(adjustments).toHaveLength(1)
    expect(adjustments[0]).toContain('NGE100')
  })

  it('leaves in-range values untouched with no adjustments', () => {
    const { clamped, adjustments } = clampParams('fpc1500', { centerFreq: 500, span: 10 })
    expect(clamped.centerFreq).toBe(500)
    expect(adjustments).toHaveLength(0)
  })

  it('builds a catalog string mentioning every device name', () => {
    const catalog = buildDeviceCatalog()
    expect(catalog).toContain('NGE100')
    expect(catalog).toContain('FPC1500')
    expect(catalog).toContain('RTB24')
    expect(catalog).toContain('HMF2550')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/data/deviceSchemas.test.ts`
Expected: FAIL — cannot resolve `./deviceSchemas`.

- [ ] **Step 3: Write the implementation**

Create `src/data/deviceSchemas.ts`:
```ts
export const plannableDeviceIds = ['nge100', 'fpc1500', 'rtb24', 'hmf2550'] as const
export type PlannableDeviceId = (typeof plannableDeviceIds)[number]

export interface ParamSpec {
  key: string
  label: string
  unit: string
  type: 'number' | 'boolean' | 'enum'
  default: number | boolean | string
  min?: number
  max?: number
  options?: string[]
}

export interface DeviceSchema {
  deviceId: string
  name: string
  type: string
  purpose: string
  params: ParamSpec[]
}

export const deviceSchemas: Record<PlannableDeviceId, DeviceSchema> = {
  nge100: {
    deviceId: 'nge100',
    name: 'NGE100',
    type: 'Power Supply',
    purpose: 'Supplies stable DC power to a device under test.',
    params: [
      { key: 'voltage', label: 'Voltage', unit: 'V', type: 'number', default: 12, min: 0, max: 32 },
      { key: 'current', label: 'Current limit', unit: 'A', type: 'number', default: 1.5, min: 0.05, max: 3 },
      { key: 'output', label: 'Output', unit: '', type: 'boolean', default: true },
    ],
  },
  fpc1500: {
    deviceId: 'fpc1500',
    name: 'FPC1500',
    type: 'Spectrum Analyzer',
    purpose: 'Measures signal power and harmonics across a frequency band.',
    params: [
      { key: 'centerFreq', label: 'Center frequency', unit: 'MHz', type: 'number', default: 500, min: 0.005, max: 1500 },
      { key: 'span', label: 'Span', unit: 'MHz', type: 'number', default: 10, min: 0.00001, max: 1500 },
      { key: 'refLevel', label: 'Reference level', unit: 'dBm', type: 'number', default: -10, min: -130, max: 30 },
    ],
  },
  rtb24: {
    deviceId: 'rtb24',
    name: 'RTB24',
    type: 'Oscilloscope',
    purpose: 'Visualizes time-domain waveforms on its channels.',
    params: [
      { key: 'ch1Scale', label: 'CH1 vertical scale', unit: 'V/div', type: 'number', default: 1, min: 0.001, max: 10 },
      { key: 'timebase', label: 'Timebase', unit: 'ms/div', type: 'number', default: 1, min: 0.000001, max: 500000 },
      { key: 'trigger', label: 'Trigger source', unit: '', type: 'enum', default: 'CH1', options: ['CH1', 'CH2', 'EXT'] },
    ],
  },
  hmf2550: {
    deviceId: 'hmf2550',
    name: 'HMF2550',
    type: 'Function Generator',
    purpose: 'Generates sine/square/triangle reference waveforms.',
    params: [
      { key: 'frequency', label: 'Frequency', unit: 'kHz', type: 'number', default: 10, min: 0.00001, max: 50000 },
      { key: 'amplitude', label: 'Amplitude', unit: 'Vpp', type: 'number', default: 2, min: 0.001, max: 10 },
    ],
  },
}

export function clampParams(
  deviceId: string,
  properties: Record<string, unknown>,
): { clamped: Record<string, unknown>; adjustments: string[] } {
  const clamped: Record<string, unknown> = { ...properties }
  const adjustments: string[] = []
  const schema = (deviceSchemas as Record<string, DeviceSchema>)[deviceId]
  if (!schema) return { clamped, adjustments }

  for (const spec of schema.params) {
    if (spec.type !== 'number') continue
    if (clamped[spec.key] == null) continue
    const v = Number(clamped[spec.key])
    if (Number.isNaN(v) || spec.min == null || spec.max == null) continue
    const c = Math.min(Math.max(v, spec.min), spec.max)
    if (c !== v) {
      adjustments.push(`${schema.name} ${spec.label} ${v}${spec.unit} → ${c}${spec.unit}`)
      clamped[spec.key] = c
    }
  }
  return { clamped, adjustments }
}

export function buildDeviceCatalog(): string {
  return plannableDeviceIds
    .map((id) => {
      const s = deviceSchemas[id]
      const params = s.params
        .map((p) => {
          if (p.type === 'enum') return `${p.key} (one of ${p.options!.join('/')}, default ${p.default})`
          if (p.type === 'boolean') return `${p.key} (boolean, default ${p.default})`
          return `${p.key} (${p.unit}, range ${p.min}–${p.max}, default ${p.default})`
        })
        .join(', ')
      return `- ${s.name} [${s.deviceId}] — ${s.type}: ${s.purpose}\n  params: ${params}`
    })
    .join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/data/deviceSchemas.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/deviceSchemas.ts src/data/deviceSchemas.test.ts
git commit -m "feat: add device schemas, param clamping, and prompt catalog"
```

---

### Task 3: Plan schema (zod)

**Files:**
- Create: `src/data/planSchema.ts`
- Test: `src/data/planSchema.test.ts`

**Interfaces:**
- Consumes: `plannableDeviceIds` from `./deviceSchemas`.
- Produces:
  - `planSchema` (zod schema)
  - `type Plan = { devices: PlanDevice[]; connections: { from: number; to: number }[]; summary: string }`
  - `type PlanDevice = { deviceId: PlannableDeviceId; properties: Record<string, number|boolean|string>; role: string }`

- [ ] **Step 1: Write the failing test**

Create `src/data/planSchema.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { planSchema } from './planSchema'

const valid = {
  devices: [
    { deviceId: 'nge100', properties: { voltage: 12, output: true }, role: 'Power the amp' },
    { deviceId: 'fpc1500', properties: { centerFreq: 900, span: 10 }, role: 'Measure spectrum' },
  ],
  connections: [{ from: 0, to: 1 }],
  summary: 'Placed a supply and analyzer.',
}

describe('planSchema', () => {
  it('accepts a well-formed plan', () => {
    expect(planSchema.parse(valid)).toBeTruthy()
  })

  it('rejects an unknown deviceId', () => {
    const bad = { ...valid, devices: [{ deviceId: 'znle6', properties: {}, role: 'x' }] }
    expect(() => planSchema.parse(bad)).toThrow()
  })

  it('rejects a plan with no devices', () => {
    expect(() => planSchema.parse({ ...valid, devices: [] })).toThrow()
  })

  it('defaults connections to an empty array when omitted', () => {
    const noConns = { devices: valid.devices, summary: 'ok' }
    expect(planSchema.parse(noConns).connections).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/data/planSchema.test.ts`
Expected: FAIL — cannot resolve `./planSchema`.

- [ ] **Step 3: Write the implementation**

Create `src/data/planSchema.ts`:
```ts
import { z } from 'zod'
import { plannableDeviceIds } from './deviceSchemas'

export const planDeviceSchema = z.object({
  deviceId: z.enum(plannableDeviceIds),
  properties: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])),
  role: z.string().min(1),
})

export const planSchema = z.object({
  devices: z.array(planDeviceSchema).min(1),
  connections: z.array(z.object({ from: z.number().int(), to: z.number().int() })).default([]),
  summary: z.string().min(1),
})

export type Plan = z.infer<typeof planSchema>
export type PlanDevice = z.infer<typeof planDeviceSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/data/planSchema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/planSchema.ts src/data/planSchema.test.ts
git commit -m "feat: add zod plan schema and types"
```

---

### Task 4: Plan client — converter + fetch

**Files:**
- Create: `src/data/planClient.ts`
- Test: `src/data/planClient.test.ts`

**Interfaces:**
- Consumes: `Plan` from `./planSchema`, `planSchema` from `./planSchema`, `deviceSchemas` from `./deviceSchemas`, `WorkflowStep` from `./workflow`, `CanvasNode` from `./scriptGenerator`.
- Produces:
  - `planToWorkflowSteps(plan: Plan): WorkflowStep[]` — emits `add_device` steps (deterministic layout `x = 60 + i*280`, `y = 110`) then `connect` steps then a `summary` step. No leading `thinking` step (the network wait covers that).
  - `fetchPlan(intent: string, currentNodes: CanvasNode[]): Promise<Plan>` — POSTs `/api/plan`, throws on non-200 or invalid body.

- [ ] **Step 1: Write the failing test**

Create `src/data/planClient.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { planToWorkflowSteps, fetchPlan } from './planClient'
import type { Plan } from './planSchema'

const plan: Plan = {
  devices: [
    { deviceId: 'hmf2550', properties: { frequency: 2 }, role: 'Generate 2 kHz wave' },
    { deviceId: 'rtb24', properties: { ch1Scale: 1 }, role: 'Show the waveform' },
  ],
  connections: [{ from: 0, to: 1 }],
  summary: 'Done.',
}

describe('planToWorkflowSteps', () => {
  it('emits add_device steps then connect then summary', () => {
    const steps = planToWorkflowSteps(plan)
    expect(steps.map((s) => s.type)).toEqual(['add_device', 'add_device', 'connect', 'summary'])
  })

  it('lays devices out left-to-right without overlap', () => {
    const steps = planToWorkflowSteps(plan).filter((s) => s.type === 'add_device')
    expect(steps[0].payload?.x).toBe(60)
    expect(steps[1].payload?.x).toBe(340)
  })

  it('maps connection indices to the generated temp ids', () => {
    const steps = planToWorkflowSteps(plan)
    const adds = steps.filter((s) => s.type === 'add_device')
    const conn = steps.find((s) => s.type === 'connect')
    expect(conn?.payload?.fromId).toBe(adds[0].payload?.fromId)
    expect(conn?.payload?.toId).toBe(adds[1].payload?.fromId)
  })

  it('carries the summary text', () => {
    const summary = planToWorkflowSteps(plan).find((s) => s.type === 'summary')
    expect(summary?.payload?.summaryText).toBe('Done.')
  })
})

describe('fetchPlan', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the parsed plan on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ plan }), { status: 200 })))
    const result = await fetchPlan('measure 2 kHz wave', [])
    expect(result.devices).toHaveLength(2)
  })

  it('throws on a non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'no_key' }), { status: 503 })))
    await expect(fetchPlan('x', [])).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/data/planClient.test.ts`
Expected: FAIL — cannot resolve `./planClient`.

- [ ] **Step 3: Write the implementation**

Create `src/data/planClient.ts`:
```ts
import { planSchema, type Plan } from './planSchema'
import { deviceSchemas } from './deviceSchemas'
import type { WorkflowStep } from './workflow'
import type { CanvasNode } from './scriptGenerator'

export function planToWorkflowSteps(plan: Plan): WorkflowStep[] {
  const steps: WorkflowStep[] = []
  const tempIds = plan.devices.map((d, i) => `${d.deviceId}_temp_${i}`)

  plan.devices.forEach((d, i) => {
    const schema = deviceSchemas[d.deviceId]
    steps.push({
      type: 'add_device',
      label: d.role,
      payload: {
        deviceId: d.deviceId,
        nodeName: schema.name,
        nodeType: schema.type,
        x: 60 + i * 280,
        y: 110,
        properties: d.properties,
        fromId: tempIds[i],
      },
    })
  })

  plan.connections.forEach((c) => {
    if (!tempIds[c.from] || !tempIds[c.to]) return
    const fromName = deviceSchemas[plan.devices[c.from].deviceId].name
    const toName = deviceSchemas[plan.devices[c.to].deviceId].name
    steps.push({
      type: 'connect',
      label: `Connecting ${fromName} output to ${toName} input`,
      payload: { fromId: tempIds[c.from], toId: tempIds[c.to] },
    })
  })

  steps.push({ type: 'summary', payload: { summaryText: plan.summary } })
  return steps
}

export async function fetchPlan(intent: string, currentNodes: CanvasNode[]): Promise<Plan> {
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent, currentNodes }),
  })
  if (!res.ok) throw new Error(`plan request failed: ${res.status}`)
  const data = (await res.json()) as { plan?: unknown }
  return planSchema.parse(data.plan)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/data/planClient.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/planClient.ts src/data/planClient.test.ts
git commit -m "feat: add plan->workflow converter and fetchPlan client"
```

---

### Task 5: Server plan handler

**Files:**
- Create: `server/planHandler.ts`
- Test: `server/planHandler.test.ts`

**Interfaces:**
- Consumes: `planSchema`/`Plan` from `../src/data/planSchema`, `clampParams`/`buildDeviceCatalog` from `../src/data/deviceSchemas`.
- Produces:
  - `interface PlanHandlerConfig { apiKey: string; baseUrl: string; model: string }`
  - `interface PlanHandlerResult { status: number; body: { plan: Plan } | { error: string } }`
  - `buildMessages(intent: string): { role: 'system'|'user'; content: string }[]`
  - `parseAndValidatePlan(rawContent: string): Plan` — JSON.parse + planSchema.parse + clamp; appends a safety note to `summary` when params are clamped; throws on invalid.
  - `handlePlanRequest(intent: string, config: PlanHandlerConfig): Promise<PlanHandlerResult>` — 503 when no key; one retry on invalid model output; 422 when still invalid.

- [ ] **Step 1: Write the failing test**

Create `server/planHandler.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildMessages, parseAndValidatePlan, handlePlanRequest } from './planHandler'

const rawPlan = JSON.stringify({
  devices: [{ deviceId: 'nge100', properties: { voltage: 99, current: 1 }, role: 'Power it' }],
  connections: [],
  summary: 'Set up a supply.',
})

describe('buildMessages', () => {
  it('includes the device catalog and the intent', () => {
    const msgs = buildMessages('measure SNR at 900 MHz')
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('FPC1500')
    expect(msgs[msgs.length - 1].content).toContain('900 MHz')
  })
})

describe('parseAndValidatePlan', () => {
  it('clamps out-of-range params and notes it in the summary', () => {
    const plan = parseAndValidatePlan(rawPlan)
    expect(plan.devices[0].properties.voltage).toBe(32)
    expect(plan.summary).toContain('Safety')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseAndValidatePlan('not json')).toThrow()
  })
})

describe('handlePlanRequest', () => {
  afterEach(() => vi.unstubAllGlobals())
  const config = { apiKey: 'k', baseUrl: 'https://x/v1', model: 'm' }

  it('returns 503 when no api key is configured', async () => {
    const res = await handlePlanRequest('x', { ...config, apiKey: '' })
    expect(res.status).toBe(503)
  })

  it('returns 200 with a plan when the provider responds well', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: rawPlan } }] }), { status: 200 }),
      ),
    )
    const res = await handlePlanRequest('power it', config)
    expect(res.status).toBe(200)
    expect('plan' in res.body).toBe(true)
  })

  it('retries once then returns 422 on persistently invalid output', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'garbage' } }] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const res = await handlePlanRequest('x', config)
    expect(res.status).toBe(422)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- server/planHandler.test.ts`
Expected: FAIL — cannot resolve `./planHandler`.

- [ ] **Step 3: Write the implementation**

Create `server/planHandler.ts`:
```ts
import { planSchema, type Plan } from '../src/data/planSchema'
import { clampParams, buildDeviceCatalog } from '../src/data/deviceSchemas'

export interface PlanHandlerConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export interface PlanHandlerResult {
  status: number
  body: { plan: Plan } | { error: string }
}

type ChatMessage = { role: 'system' | 'user'; content: string }

const SYSTEM_RULES = `You are Voltaic's instrumentation planner for Rohde & Schwarz test benches.
Given a measurement request, choose instruments from the catalog below and configure them.

Rules:
- Use ONLY the devices and parameter keys listed. Never invent devices or keys.
- Parse concrete numeric values from the request (frequencies, voltages, amplitudes) and set the matching parameter. Convert units to the parameter's unit.
- When a value is not specified, use the parameter's default.
- Order devices in signal flow (source/supply first, measurement instrument last) and connect them with "connections" as index pairs into "devices".
- Return ONLY a JSON object, no prose, matching exactly:
  { "devices": [ { "deviceId": string, "properties": object, "role": string } ], "connections": [ { "from": number, "to": number } ], "summary": string }
- "role" is a short human sentence describing why that device is placed.
- "summary" is a friendly one-paragraph recap for the engineer.

Device catalog:
`

const FEW_SHOT_USER = 'measure SNR of amplifier at 500 MHz'
const FEW_SHOT_ASSISTANT = JSON.stringify({
  devices: [
    { deviceId: 'nge100', properties: { voltage: 12, current: 1.5, output: true }, role: 'Provide +12V DC power to the amplifier.' },
    { deviceId: 'fpc1500', properties: { centerFreq: 500, span: 10, refLevel: -10 }, role: 'Capture the amplifier output spectrum around 500 MHz.' },
  ],
  connections: [{ from: 0, to: 1 }],
  summary: 'Placed the NGE100 supply powering the amplifier and the FPC1500 analyzer centered at 500 MHz with a 10 MHz span.',
})

export function buildMessages(intent: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_RULES + buildDeviceCatalog() },
    { role: 'user', content: FEW_SHOT_USER },
    { role: 'system', content: FEW_SHOT_ASSISTANT },
    { role: 'user', content: intent },
  ]
}

export function parseAndValidatePlan(rawContent: string): Plan {
  const parsed = planSchema.parse(JSON.parse(rawContent))
  const adjustments: string[] = []
  const devices = parsed.devices.map((d) => {
    const { clamped, adjustments: adj } = clampParams(d.deviceId, d.properties)
    adjustments.push(...adj)
    return { ...d, properties: clamped as typeof d.properties }
  })
  let summary = parsed.summary
  if (adjustments.length > 0) summary += ` (Safety adjustments: ${adjustments.join('; ')}.)`
  return { ...parsed, devices, summary }
}

async function callProvider(messages: ChatMessage[], config: PlanHandlerConfig): Promise<string> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages,
    }),
  })
  if (!res.ok) throw new Error(`provider ${res.status}`)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

export async function handlePlanRequest(intent: string, config: PlanHandlerConfig): Promise<PlanHandlerResult> {
  if (!config.apiKey) return { status: 503, body: { error: 'no_key' } }
  const base = buildMessages(intent)

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages =
      attempt === 0
        ? base
        : [...base, { role: 'user' as const, content: 'Your previous reply was not valid JSON for the schema. Return ONLY the JSON object.' }]
    try {
      const content = await callProvider(messages, config)
      const plan = parseAndValidatePlan(content)
      return { status: 200, body: { plan } }
    } catch {
      if (attempt === 1) return { status: 422, body: { error: 'invalid_plan' } }
    }
  }
  return { status: 422, body: { error: 'invalid_plan' } }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- server/planHandler.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/planHandler.ts server/planHandler.test.ts
git commit -m "feat: add server-side LLM plan handler with validation + retry"
```

---

### Task 6: Wire the dev-server proxy

**Files:**
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: `handlePlanRequest` from `./server/planHandler`.
- Produces: `POST /api/plan` accepting `{ intent, currentNodes }`, returning the handler's `{ status, body }`.

- [ ] **Step 1: Replace vite.config.ts**

Replace `vite.config.ts` with:
```ts
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handlePlanRequest } from './server/planHandler'

function planApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'voltaic-plan-api',
    configureServer(server) {
      server.middlewares.use('/api/plan', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let raw = ''
        req.on('data', (chunk) => (raw += chunk))
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json')
          try {
            const { intent } = JSON.parse(raw || '{}') as { intent?: string }
            const result = await handlePlanRequest(intent ?? '', {
              apiKey: env.GROQ_API_KEY || '',
              baseUrl: env.LLM_BASE_URL || 'https://api.groq.com/openai/v1',
              model: env.LLM_MODEL || 'openai/gpt-oss-120b',
            })
            res.statusCode = result.status
            res.end(JSON.stringify(result.body))
          } catch {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'bad_request' }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return { plugins: [react(), planApiPlugin(env)] }
})
```

- [ ] **Step 2: Verify the endpoint responds**

Run (in one terminal): `npm run dev`
Then run: `curl -s -X POST http://localhost:5173/api/plan -H "Content-Type: application/json" -d "{\"intent\":\"measure SNR of amplifier at 900 MHz\"}"`
Expected: a JSON object with a `plan` whose FPC1500 `centerFreq` is `900` (proves real parameter parsing). If the key is missing/invalid you get `{"error":"no_key"}` or `{"error":"invalid_plan"}` — fix `.env` before continuing.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "feat: expose /api/plan dev middleware proxy"
```

---

### Task 7: Make the assistant call the planner

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `fetchPlan`, `planToWorkflowSteps` from `./data/planClient`; existing `generateWorkflowSteps` from `./data/workflow`.
- Produces: async `processIntent` that tries the AI planner and falls back to the keyword matcher.

- [ ] **Step 1: Add the import**

In `src/App.tsx`, below the existing workflow import (around line 6), add:
```ts
import { fetchPlan, planToWorkflowSteps } from './data/planClient'
```

- [ ] **Step 2: Replace processIntent**

Replace the existing `processIntent` function (currently `src/App.tsx:662-673`) with:
```ts
  // AI Intent processing: try the LLM planner, fall back to the keyword matcher.
  const processIntent = async (intentText: string) => {
    setIsTyping(true)

    let steps: WorkflowStep[]
    try {
      const plan = await fetchPlan(intentText, nodes)
      steps = planToWorkflowSteps(plan)
    } catch (err) {
      console.warn('AI planner unavailable, using offline planner:', err)
      steps = generateWorkflowSteps(intentText)
    }

    // Clear canvas before placing new device layouts to prevent overlapping coordinates
    const hasAdditions = steps.some((s) => s.type === 'add_device')
    if (hasAdditions) {
      handleClear()
    }

    runStagedWorkflow(steps)
  }
```

- [ ] **Step 3: Verify the build typechecks**

Run: `npm run build`
Expected: completes with no TypeScript errors.

- [ ] **Step 4: Manual smoke test in the browser**

Run: `npm run dev`, open the app, type `measure SNR of amplifier at 900 MHz`.
Expected: typing indicator shows during the network call, then NGE100 + FPC1500 appear; click the FPC1500 and confirm Center Frequency reads **900** (not 500).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: drive the assistant with the AI planner + keyword fallback"
```

---

### Task 8: End-to-end prompt matrix + full test run

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm run test`
Expected: all suites pass (deviceSchemas, planSchema, planClient, planHandler).

- [ ] **Step 2: Manual prompt matrix**

With `npm run dev` running, try each and confirm behavior:
- `measure SNR of amplifier at 900 MHz` → NGE100 + FPC1500, centerFreq 900.
- `show me a 2 kHz square wave on the scope` → HMF2550 + RTB24, frequency 2.
- `power a board at 5 V and 2 A` → NGE100, voltage 5, current 2.
- `make me a sandwich` → graceful fallback message, no crash, canvas intact.
- Temporarily blank `GROQ_API_KEY` in `.env`, restart dev, send any prompt → falls back to the keyword matcher with no error dialog.

- [ ] **Step 3: Restore .env and final commit**

Restore `GROQ_API_KEY`, then:
```bash
git add -A
git commit -m "test: verify AI planner prompt matrix and fallback" --allow-empty
```

---

## Self-Review

**Spec coverage:**
- §3 architecture/data flow → Tasks 4–7. ✓
- §4 plan contract → Task 3 (schema), Task 4 (converter). ✓
- §5 files → all created/modified across Tasks 2–7. ✓
- §6 prompt design (catalog + rules + few-shot) → Task 2 (`buildDeviceCatalog`), Task 5 (`buildMessages`). ✓
- §7 validation/clamping/retry/fallback → Task 2 (clamp), Task 5 (validate + retry), Task 7 (fallback). ✓
- §8 testing (vitest + prompt matrix) → Task 1 (runner), Tasks 2–5 (unit), Task 8 (manual matrix). ✓
- Device coverage = 4 devices → enforced in Task 2 (`plannableDeviceIds`) and Task 3 (enum). ✓

**Type consistency:** `Plan`/`PlanDevice` defined in Task 3 and consumed unchanged in Tasks 4–5. `clampParams` signature identical in Tasks 2 and 5. `WorkflowStep` payload shape matches the existing `src/data/workflow.ts` interface (`deviceId`, `nodeName`, `nodeType`, `x`, `y`, `properties`, `fromId`, `toId`, `summaryText`). ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓
