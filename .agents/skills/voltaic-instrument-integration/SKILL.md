---
name: voltaic-instrument-integration
description: >-
  Guides developers and AI agents in extending the Rohde & Schwarz Voltaic workbench by adding new instruments, configuring safety limit validations, styling visual LCD screen readouts, synchronizing real-time SCPI terminal states, and updating unit tests.
---

# Voltaic Instrument Integration Skill

## Overview
This skill provides a comprehensive developer blueprint to extend or modify the Rohde & Schwarz Voltaic Workbench. Whenever you need to add support for a new instrument (e.g. networks analyzer, attenuator) or adjust the SCPI simulation pipelines, follow this checklist sequence to ensure perfect system alignment.

## Quick Start
To integrate a new instrument into the workbench, you must update:
1. Instrument schema limits in [deviceSchemas.ts](file:///c:/Users/Michael/Virtual%20lab%20hackathon/src/data/deviceSchemas.ts)
2. LCD screen components in [App.tsx](file:///c:/Users/Michael/Virtual%20lab%20hackathon/src/App.tsx)
3. SCPI logs and VISA generators in [scriptGenerator.ts](file:///c:/Users/Michael/Virtual%20lab%20hackathon/src/data/scriptGenerator.ts)
4. State synchronization loop in [App.tsx](file:///c:/Users/Michael/Virtual%20lab%20hackathon/src/App.tsx)
5. Executing glow transitions in [Node.module.css](file:///c:/Users/Michael/Virtual%20lab%20hackathon/src/components/Node.module.css)
6. Vitest test coverage in [scriptGenerator.test.ts](file:///c:/Users/Michael/Virtual%20lab%20hackathon/src/data/scriptGenerator.test.ts)

## Extracted Specifications & SCPI Tables
Always consult the hardware specifications extracted directly from manuals inside the `references/` directory:
* [NGE100 Specs Reference](file:///c:/Users/Michael/Virtual%20lab%20hackathon/.agents/skills/voltaic-instrument-integration/references/nge100_specs.md)
* [FPC1500 Specs Reference](file:///c:/Users/Michael/Virtual%20lab%20hackathon/.agents/skills/voltaic-instrument-integration/references/fpc1500_specs.md)
* [RTB24 Specs Reference](file:///c:/Users/Michael/Virtual%20lab%20hackathon/.agents/skills/voltaic-instrument-integration/references/rtb24_specs.md)
* [HMF2550 Specs Reference](file:///c:/Users/Michael/Virtual%20lab%20hackathon/.agents/skills/voltaic-instrument-integration/references/hmf2550_specs.md)

---

## Detailed Integration Steps

### 1. Define Instrument Parameter Boundaries
Edit [deviceSchemas.ts](file:///c:/Users/Michael/Virtual%20lab%20hackathon/src/data/deviceSchemas.ts). Add the device definition to `deviceSchemas` with all configurable parameters, units, types, and min/max limits:
```typescript
export const deviceSchemas: Record<string, DeviceSchema> = {
  // Add new device schema definition
  myDevice: {
    deviceId: 'myDevice',
    name: 'My Device Model Name',
    type: 'My Category',
    purpose: 'Describe purpose here.',
    params: [
      { key: 'voltage', label: 'Voltage', unit: 'V', type: 'number', default: 5, min: 0, max: 15 }
    ]
  }
}
```

### 2. Style Visual LCD Screens
Update `renderNodeScreen` in [App.tsx](file:///c:/Users/Michael/Virtual%20lab%20hackathon/src/App.tsx). Return a custom styled component matching the physical hardware display face. Use custom LCD colors or grid traces where relevant:
```typescript
case 'myDevice': {
  const value = node.properties.voltage ?? 5.0
  return (
    <div className={nodeStyles.nodeScreen}>
      <div className={nodeStyles.screenReadout}>
        <span>{value.toFixed(2)} V</span>
      </div>
      <div className={nodeStyles.screenLabel}>OUTPUT ACTIVE</div>
    </div>
  )
}
```

### 3. Add Connection Socket Port Tooltips
Update the tooltips mappings in the canvas card rendering loop in [App.tsx](file:///c:/Users/Michael/Virtual%20lab%20hackathon/src/App.tsx):
```typescript
} else if (node.deviceId === 'myDevice') {
  leftPortTitle = "My Device Input Socket Description"
  rightPortTitle = "My Device Output Socket Description"
}
```

### 4. Wire Safety Validation Limits
Update `handleValidate` in [App.tsx](file:///c:/Users/Michael/Virtual%20lab%20hackathon/src/App.tsx) to execute limits check:
```typescript
} else if (node.deviceId === 'myDevice') {
  const v = parseFloat(node.properties.voltage ?? 0)
  if (v < 0 || v > 15) {
    const errMsg = `Voltage exceeds physical limits (0V - 15V).`
    report.push(`- ❌ **MyDevice**: ${errMsg}`)
    nodeErrors.push(errMsg)
    hasErrors = true
  }
}
```

### 5. Extend PyVISA Script & Laboratory Checklist Compilation
Edit `generateScriptAndChecklist` in [scriptGenerator.ts](file:///c:/Users/Michael/Virtual%20lab%20hackathon/src/data/scriptGenerator.ts):
* Write a dedicated Python VISA connection and configuration generator template block.
* Build appropriate pre-flight setup checklist strings containing relevant parameters.

### 6. Extend SCPI Terminal Logs Generator
Edit `generateSCPITerminalLogs` in [scriptGenerator.ts](file:///c:/Users/Michael/Virtual%20lab%20hackathon/src/data/scriptGenerator.ts):
* Push TCP/IP connection command lines (`CONNECT...`).
* Push specific reset (`-> *RST`) and command calibration commands with active variables (e.g. `-> VOLT 5.00`).
* End sequence logs with success queries.

### 7. Bind Real-Time Parameter Synchronization Loop
Update `handleRunWorkflow` in [App.tsx](file:///c:/Users/Michael/Virtual%20lab%20hackathon/src/App.tsx):
* Parse TCP/IP socket addresses to set `activeExecutingNodeId` correctly.
* Extract parameters (e.g. `VOLT `) from command logs and update the local node state properties so LCD screen values animate synchronously as SCPI commands print.

### 8. Add Executing Glow Styles
Define a target device executing breathing class `.nodeCardExecuting_[device]` in [Node.module.css](file:///c:/Users/Michael/Virtual%20lab%20hackathon/src/components/Node.module.css):
```css
.nodeCardExecuting_myDevice {
  border-color: #00e676 !important;
  box-shadow: 0 0 16px rgba(0, 230, 118, 0.45), 0 4px 16px rgba(0, 0, 0, 0.55);
  animation: executingPulseMyDevice 1.2s ease-in-out infinite alternate !important;
}
@keyframes executingPulseMyDevice {
  from { box-shadow: 0 0 6px rgba(0, 230, 118, 0.25); }
  to { box-shadow: 0 0 18px rgba(0, 230, 118, 0.65); }
}
```

### 9. Write Unit Tests & Build
* Extend [scriptGenerator.test.ts](file:///c:/Users/Michael/Virtual%20lab%20hackathon/src/data/scriptGenerator.test.ts) with appropriate test scenarios verifying script outputs and SCPI logs against mock setups.
* Run `npm run test` and `npm run build` to confirm compiler correctness.

---

## Common Mistakes
* **Hardcoded String Interpolation**: Forgetting to convert units (e.g. converting MHz to Hz using scientific notation `e6` for spectrum analyzer commands).
* **Missing State Cleanup**: Failing to reset `activeExecutingNodeId` or `validationErrors` when clearing the canvas or changing input files.
* **Direct DOM updates**: Attempting to manipulate SVG wire paths directly. Wires should only hook to the React `connections` state arrays and query matching node coords.
