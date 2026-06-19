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
