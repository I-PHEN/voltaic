import { planSchema, type Plan } from '../src/data/planSchema'
import { clampParams, buildDeviceCatalog, deviceSchemas, type DeviceSchema } from '../src/data/deviceSchemas'

export interface PlanHandlerConfig {
  apiKey: string
  baseUrl: string
  model: string
  // Backoff delays (ms) for retrying provider rate limits (429). Defaults applied if omitted.
  retryDelaysMs?: number[]
}

// Thrown when the provider keeps returning 429 after the backoff retries are exhausted.
export class RateLimitError extends Error {
  constructor() {
    super('rate_limited')
    this.name = 'RateLimitError'
  }
}

const DEFAULT_RETRY_DELAYS_MS = [500, 1200]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface PlanHandlerResult {
  status: number
  body: { plan: Plan } | { error: string }
}

// The conversation + canvas context the assistant reasons over.
export interface PlanContext {
  canvas?: {
    devices: { deviceId: string; properties: Record<string, unknown> }[]
    connections: { from: number; to: number }[]
  }
  history?: { role: 'user' | 'assistant'; text: string }[]
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

const SYSTEM_RULES = `You are Voltaic, a knowledgeable Rohde & Schwarz instrumentation assistant. You help an engineer build and understand a test bench. You are given the CURRENT BENCH on their canvas and the recent conversation, and you must respond to their latest message.

Decide what the user's LATEST message needs:

BUILD or MODIFY the bench (return the devices) whenever the message expresses a measurement to PERFORM or a setup to create or change. This is the DEFAULT for any measurement intent. It includes phrasings like "measure ...", "measure the parameters of ...", "show/view/display ...", "generate ...", "test/characterize ...", "set up ...", or "add/connect/configure ...". In these cases you MUST place and connect the instruments — do NOT merely explain how to do it. You MAY include the measurement how-to inside "summary", but you must still return the devices. When building/modifying, return the COMPLETE desired list of devices (include devices that should stay, preserving their existing parameters exactly) and the connections.

ANSWER in chat (return EMPTY "devices" and EMPTY "connections", real answer in "summary", canvas untouched) ONLY when the message is a genuine question or comment with NO new measurement to perform — it asks "why/what/how/which", asks you to explain a concept or a decision, comments on the existing bench, or is a greeting/small talk. Use genuine test-and-measurement knowledge (for example: a power supply provides DC bias to a device-under-test and is NOT wired into a function generator's signal input).

When you are unsure whether a measurement-related message wants a build or an explanation, BUILD it — this is a bench-building tool.

Rules:
- ALWAYS return ONLY a JSON object, no prose, matching exactly:
  { "devices": [ { "deviceId": string, "properties": object, "role": string } ], "connections": [ { "from": number, "to": number } ], "summary": string }
- If you are only answering or chatting and the bench should NOT change, you MUST return empty "devices" and empty "connections". Do not rebuild an unchanged bench.
- When building/modifying: use ONLY the devices and parameter keys in the catalog; never invent them. Parse concrete numbers from the message (frequencies, voltages, amplitudes) and set the matching parameter. Use defaults for anything unspecified. Preserve existing devices and their parameters unless the user asked to change them.
- UNIT CONVERSION IS CRITICAL — each parameter has a FIXED unit (shown in the catalog); always convert the user's stated value into THAT unit before setting it, never copy the raw number across units:
  • HMF2550 "frequency" is in kHz. A value given in MHz MUST be multiplied by 1000 (1 MHz = 1000 kHz, 2 MHz = 2000 kHz, 10 MHz = 10000 kHz); a value in Hz divided by 1000. A value already in kHz is used as-is.
  • FPC1500 "centerFreq"/"span" are in MHz. A value given in GHz MUST be multiplied by 1000 (2.4 GHz = 2400 MHz); a value in kHz divided by 1000.
  • RTB24 "timebase" is in ms; convert seconds (×1000) or µs (÷1000) accordingly.
  • Even when two instruments observe the SAME signal, each takes the value in ITS OWN unit (a 10 MHz signal → HMF2550 frequency=10000, FPC1500 centerFreq=10).
- Include ONLY the instruments the task needs. Do NOT add a power supply (nge100) unless an amplifier, circuit/board, or powering a device is involved. Do NOT add a spectrum analyzer (fpc1500) unless SNR, spectrum, harmonics, or RF power is involved.
- "connections" are index pairs into "devices", in signal-flow order (source/generator first, measurement instrument last). A power supply usually has NO connection — it biases an off-canvas device-under-test, not the signal path.
- "role" is a short human sentence describing why each device is placed. "summary" is a friendly recap or, for an answer, your actual reply to the engineer.

Device catalog:
`

const FEW_SHOT_SNR_USER = 'measure SNR of amplifier at 500 MHz'
const FEW_SHOT_SNR_ASSISTANT = JSON.stringify({
  devices: [
    { deviceId: 'nge100', properties: { voltage: 12, current: 1.5, output: true }, role: 'Provide +12V DC power to the amplifier.' },
    { deviceId: 'fpc1500', properties: { centerFreq: 500, span: 10, refLevel: -10 }, role: 'Capture the amplifier output spectrum around 500 MHz.' },
  ],
  connections: [{ from: 0, to: 1 }],
  summary: 'Placed the NGE100 supply powering the amplifier and the FPC1500 analyzer centered at 500 MHz with a 10 MHz span.',
})

// Second example: a plain waveform-on-scope request needs ONLY the generator + scope.
const FEW_SHOT_WAVE_USER = 'show a 10 kHz sine wave on the oscilloscope'
const FEW_SHOT_WAVE_ASSISTANT = JSON.stringify({
  devices: [
    { deviceId: 'hmf2550', properties: { frequency: 10, amplitude: 2 }, role: 'Generate a 10 kHz sine reference signal.' },
    { deviceId: 'rtb24', properties: { ch1Scale: 1, timebase: 1, trigger: 'CH1' }, role: 'Display the waveform on Channel 1.' },
  ],
  connections: [{ from: 0, to: 1 }],
  summary: 'Set the HMF2550 generator to a 10 kHz sine wave and routed it to Channel 1 of the RTB24 oscilloscope.',
})

// Third example: "measure ... parameters" is a BUILD request, not an explanation.
const FEW_SHOT_MEASURE_USER = 'measure 10 kHz sine wave parameters'
const FEW_SHOT_MEASURE_ASSISTANT = JSON.stringify({
  devices: [
    { deviceId: 'hmf2550', properties: { frequency: 10, amplitude: 2 }, role: 'Generate the 10 kHz sine wave to characterize.' },
    { deviceId: 'rtb24', properties: { ch1Scale: 0.5, timebase: 0.1, trigger: 'CH1' }, role: 'Capture the waveform and read its parameters on Channel 1.' },
  ],
  connections: [{ from: 0, to: 1 }],
  summary: "Built the bench: the HMF2550 drives a 10 kHz sine wave into Channel 1 of the RTB24. Enable the scope's measurement functions to read frequency, Vpp, RMS, and period on CH1.",
})

// Fourth example: an MHz frequency on the function generator must convert to kHz.
const FEW_SHOT_FG_MHZ_USER = 'drive a 2 MHz sine wave into the oscilloscope'
const FEW_SHOT_FG_MHZ_ASSISTANT = JSON.stringify({
  devices: [
    { deviceId: 'hmf2550', properties: { frequency: 2000, amplitude: 2 }, role: 'Generate a 2 MHz (2000 kHz) sine wave.' },
    { deviceId: 'rtb24', properties: { ch1Scale: 0.5, timebase: 0.0002, trigger: 'CH1' }, role: 'Display the 2 MHz waveform on Channel 1.' },
  ],
  connections: [{ from: 0, to: 1 }],
  summary: 'The HMF2550 generates a 2 MHz sine wave (2000 kHz) routed to Channel 1 of the RTB24 oscilloscope.',
})

// Fifth example: a follow-up question is answered, with NO change to the bench.
const FEW_SHOT_QA_USER = 'why is the power supply not connected to the function generator?'
const FEW_SHOT_QA_ASSISTANT = JSON.stringify({
  devices: [],
  connections: [],
  summary: "The NGE100 is a power supply — it provides DC bias to your device-under-test, not to the HMF2550. A function generator is mains-powered and produces its own signal, so the supply intentionally sits outside the signal path. The measurement chain is the generator into the oscilloscope.",
})

// Fourth example: a greeting / small talk gets a friendly reply, no instruments.
const FEW_SHOT_CHAT_USER = 'hello'
const FEW_SHOT_CHAT_ASSISTANT = JSON.stringify({
  devices: [],
  connections: [],
  summary: "Hi! I'm Voltaic. Describe a measurement — for example \"view a 1 kHz sine wave on the scope\" or \"measure SNR of an amplifier at 900 MHz\" — and I'll set up the right R&S instruments for you.",
})

// A human-readable description of the current canvas, fed to the model so it can
// reason about and answer questions on the actual bench.
function describeCanvas(canvas: PlanContext['canvas']): string {
  if (!canvas || canvas.devices.length === 0) return 'Current bench: the canvas is empty.'
  const schemas = deviceSchemas as Record<string, DeviceSchema>
  const lines = canvas.devices.map((d, i) => {
    const name = schemas[d.deviceId]?.name ?? d.deviceId
    const type = schemas[d.deviceId]?.type ?? ''
    const props = Object.entries(d.properties)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')
    return `- [${i}] ${name} (${type})${props ? `: ${props}` : ''}`
  })
  const conns =
    canvas.connections.length > 0
      ? canvas.connections
          .map((c) => {
            const from = schemas[canvas.devices[c.from]?.deviceId]?.name ?? `#${c.from}`
            const to = schemas[canvas.devices[c.to]?.deviceId]?.name ?? `#${c.to}`
            return `${from} -> ${to}`
          })
          .join(', ')
      : 'none'
  return `Current bench on the canvas:\n${lines.join('\n')}\nConnections: ${conns}`
}

export function buildMessages(intent: string, context: PlanContext = {}): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_RULES + buildDeviceCatalog() },
    { role: 'user', content: FEW_SHOT_SNR_USER },
    { role: 'assistant', content: FEW_SHOT_SNR_ASSISTANT },
    { role: 'user', content: FEW_SHOT_WAVE_USER },
    { role: 'assistant', content: FEW_SHOT_WAVE_ASSISTANT },
    { role: 'user', content: FEW_SHOT_MEASURE_USER },
    { role: 'assistant', content: FEW_SHOT_MEASURE_ASSISTANT },
    { role: 'user', content: FEW_SHOT_FG_MHZ_USER },
    { role: 'assistant', content: FEW_SHOT_FG_MHZ_ASSISTANT },
    { role: 'user', content: FEW_SHOT_QA_USER },
    { role: 'assistant', content: FEW_SHOT_QA_ASSISTANT },
    { role: 'user', content: FEW_SHOT_CHAT_USER },
    { role: 'assistant', content: FEW_SHOT_CHAT_ASSISTANT },
    // Ground the model in the real, current bench.
    { role: 'system', content: describeCanvas(context.canvas) },
  ]

  // Replay the recent conversation so the assistant has memory.
  for (const turn of context.history ?? []) {
    messages.push({ role: turn.role, content: turn.text })
  }

  messages.push({ role: 'user', content: intent })
  return messages
}

export function parseAndValidatePlan(rawContent: string): Plan {
  const parsed = planSchema.parse(JSON.parse(rawContent))
  const adjustments: string[] = []
  const devices = parsed.devices.map((d) => {
    const { clamped, adjustments: adj } = clampParams(d.deviceId, d.properties)
    adjustments.push(...adj)
    return { ...d, properties: clamped as typeof d.properties }
  })
  // Drop connections with self-referential or out-of-range indices.
  const connections = parsed.connections.filter(
    (c) => c.from !== c.to && c.from >= 0 && c.from < devices.length && c.to >= 0 && c.to < devices.length,
  )
  let summary = parsed.summary
  if (adjustments.length > 0) summary += ` (Safety adjustments: ${adjustments.join('; ')}.)`
  return { ...parsed, devices, connections, summary }
}

async function callProvider(messages: ChatMessage[], config: PlanHandlerConfig): Promise<string> {
  const delays = config.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS

  // Retry transient rate limits (429) with backoff; rate limits usually clear within ~1s.
  for (let attempt = 0; ; attempt++) {
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

    if (res.status === 429) {
      if (attempt < delays.length) {
        await sleep(delays[attempt])
        continue
      }
      throw new RateLimitError()
    }

    if (!res.ok) throw new Error(`provider ${res.status}`)
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return data.choices?.[0]?.message?.content ?? ''
  }
}

export async function handlePlanRequest(
  intent: string,
  config: PlanHandlerConfig,
  context: PlanContext = {},
): Promise<PlanHandlerResult> {
  if (!config.apiKey) return { status: 503, body: { error: 'no_key' } }
  const base = buildMessages(intent, context)

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages =
      attempt === 0
        ? base
        : [...base, { role: 'user' as const, content: 'Your previous reply was not valid JSON for the schema. Return ONLY the JSON object.' }]
    try {
      const content = await callProvider(messages, config)
      const plan = parseAndValidatePlan(content)
      return { status: 200, body: { plan } }
    } catch (e) {
      // A sustained rate limit is distinct from a bad plan — surface it so the UI can say so.
      if (e instanceof RateLimitError) return { status: 429, body: { error: 'rate_limited' } }
      if (attempt === 1) return { status: 422, body: { error: 'invalid_plan' } }
    }
  }
  return { status: 422, body: { error: 'invalid_plan' } }
}
