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

  it('describes the current canvas and replays history', () => {
    const msgs = buildMessages('why no connection?', {
      canvas: {
        devices: [
          { deviceId: 'nge100', properties: { voltage: 5 } },
          { deviceId: 'hmf2550', properties: { frequency: 25 } },
        ],
        connections: [],
      },
      history: [{ role: 'user', text: 'power a board at 5V and show a 25 kHz wave' }],
    })
    const all = msgs.map((m) => m.content).join('\n')
    expect(all).toContain('NGE100')
    expect(all).toContain('voltage=5')
    expect(all).toContain('power a board at 5V')
    expect(msgs[msgs.length - 1].content).toBe('why no connection?')
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

  it('accepts a conversational plan with no devices', () => {
    const raw = JSON.stringify({ devices: [], connections: [], summary: 'Hi! Describe a measurement.' })
    const plan = parseAndValidatePlan(raw)
    expect(plan.devices).toEqual([])
    expect(plan.summary).toContain('Describe a measurement')
  })

  it('drops self-referential and out-of-range connections', () => {
    const raw = JSON.stringify({
      devices: [
        { deviceId: 'hmf2550', properties: { frequency: 10 }, role: 'gen' },
        { deviceId: 'rtb24', properties: { ch1Scale: 1 }, role: 'scope' },
      ],
      connections: [{ from: 0, to: 0 }, { from: 0, to: 5 }, { from: 0, to: 1 }],
      summary: 'ok',
    })
    expect(parseAndValidatePlan(raw).connections).toEqual([{ from: 0, to: 1 }])
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

  it('retries a 429 with backoff then succeeds', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1
        if (calls === 1) return new Response('rate', { status: 429 })
        return new Response(JSON.stringify({ choices: [{ message: { content: rawPlan } }] }), { status: 200 })
      }),
    )
    const res = await handlePlanRequest('power it', { ...config, retryDelaysMs: [0] })
    expect(res.status).toBe(200)
    expect(calls).toBe(2)
  })

  it('returns 429 rate_limited when the provider keeps rate limiting', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('rate', { status: 429 })))
    const res = await handlePlanRequest('x', { ...config, retryDelaysMs: [0] })
    expect(res.status).toBe(429)
    expect(res.body).toEqual({ error: 'rate_limited' })
  })
})
