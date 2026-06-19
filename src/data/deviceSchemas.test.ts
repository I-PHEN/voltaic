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
