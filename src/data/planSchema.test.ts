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

  it('accepts a conversational plan with no devices', () => {
    const chatOnly = { devices: [], connections: [], summary: 'Hi! Describe a measurement.' }
    expect(planSchema.parse(chatOnly).devices).toEqual([])
  })

  it('defaults connections to an empty array when omitted', () => {
    const noConns = { devices: valid.devices, summary: 'ok' }
    expect(planSchema.parse(noConns).connections).toEqual([])
  })
})
