import { describe, it, expect } from 'vitest'
import { deviceSchemas, plannableDeviceIds, clampParams, buildDeviceCatalog, validateDeviceProperties } from './deviceSchemas'

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

  it('exposes the function-generator waveform options in the catalog', () => {
    const catalog = buildDeviceCatalog()
    expect(catalog).toContain('waveform')
    expect(catalog).toContain('Square')
  })
})

describe('validateDeviceProperties', () => {
  it('flags an out-of-range numeric parameter', () => {
    const errors = validateDeviceProperties('nge100', { voltage: 48, current: 1 })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('Voltage')
    expect(errors[0]).toContain('32')
  })

  it('returns no errors when every value is within limits', () => {
    expect(validateDeviceProperties('hmf2550', { frequency: 25, amplitude: 2, waveform: 'Square' })).toEqual([])
  })

  it('ignores enum and boolean params', () => {
    expect(validateDeviceProperties('rtb24', { ch1Scale: 1, timebase: 1, trigger: 'EXT' })).toEqual([])
  })
})
