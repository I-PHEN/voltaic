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
