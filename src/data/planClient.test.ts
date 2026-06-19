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

  it('emits only a summary step (no devices) for a conversational plan', () => {
    const chatOnly: Plan = { devices: [], connections: [], summary: 'Hi! Describe a measurement.' }
    const steps = planToWorkflowSteps(chatOnly)
    expect(steps.map((s) => s.type)).toEqual(['summary'])
    expect(steps[0].payload?.summaryText).toBe('Hi! Describe a measurement.')
  })
})

describe('fetchPlan', () => {
  afterEach(() => vi.unstubAllGlobals())

  const emptyCanvas = { devices: [], connections: [] }

  it('returns the parsed plan on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ plan }), { status: 200 })))
    const result = await fetchPlan('measure 2 kHz wave', emptyCanvas, [])
    expect(result.devices).toHaveLength(2)
  })

  it('sends intent, canvas, and history in the request body', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify({ plan }), { status: 200 })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const canvas = { devices: [{ deviceId: 'nge100', properties: { voltage: 5 } }], connections: [] }
    const history = [{ role: 'user' as const, text: 'power a board at 5V' }]
    await fetchPlan('why no connection?', canvas, history)
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string)
    expect(body).toEqual({ intent: 'why no connection?', canvas, history })
  })

  it('throws on a non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'no_key' }), { status: 503 })))
    await expect(fetchPlan('x', emptyCanvas, [])).rejects.toThrow()
  })
})
