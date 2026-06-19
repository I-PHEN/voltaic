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
