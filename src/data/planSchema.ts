import { z } from 'zod'
import { plannableDeviceIds } from './deviceSchemas'

export const planDeviceSchema = z.object({
  deviceId: z.enum(plannableDeviceIds),
  properties: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])),
  role: z.string().min(1),
})

export const planSchema = z.object({
  // Empty devices = a conversational reply (e.g. a greeting), not a bench build.
  devices: z.array(planDeviceSchema),
  connections: z.array(z.object({ from: z.number().int(), to: z.number().int() })).default([]),
  summary: z.string().min(1),
})

export type Plan = z.infer<typeof planSchema>
export type PlanDevice = z.infer<typeof planDeviceSchema>
