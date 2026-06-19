import { planSchema, type Plan } from './planSchema'
import { deviceSchemas } from './deviceSchemas'
import type { WorkflowStep } from './workflow'
import type { CanvasNode } from './scriptGenerator'

export function planToWorkflowSteps(plan: Plan): WorkflowStep[] {
  const steps: WorkflowStep[] = []
  const tempIds = plan.devices.map((d, i) => `${d.deviceId}_temp_${i}`)

  plan.devices.forEach((d, i) => {
    const schema = deviceSchemas[d.deviceId]
    steps.push({
      type: 'add_device',
      label: d.role,
      payload: {
        deviceId: d.deviceId,
        nodeName: schema.name,
        nodeType: schema.type,
        x: 60 + i * 280,
        y: 110,
        properties: d.properties,
        fromId: tempIds[i],
      },
    })
  })

  plan.connections.forEach((c) => {
    if (!tempIds[c.from] || !tempIds[c.to]) return
    const fromName = deviceSchemas[plan.devices[c.from].deviceId].name
    const toName = deviceSchemas[plan.devices[c.to].deviceId].name
    steps.push({
      type: 'connect',
      label: `Connecting ${fromName} output to ${toName} input`,
      payload: { fromId: tempIds[c.from], toId: tempIds[c.to] },
    })
  })

  steps.push({ type: 'summary', payload: { summaryText: plan.summary } })
  return steps
}

export async function fetchPlan(intent: string, currentNodes: CanvasNode[]): Promise<Plan> {
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent, currentNodes }),
  })
  if (!res.ok) throw new Error(`plan request failed: ${res.status}`)
  const data = (await res.json()) as { plan?: unknown }
  return planSchema.parse(data.plan)
}
