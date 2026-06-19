import { describe, it, expect } from 'vitest'
import { generateScriptAndChecklist, generateSCPITerminalLogs, generateSCPITerminalLogsFromScript, type CanvasNode } from './scriptGenerator'

describe('scriptGenerator', () => {
  const mockNodes: CanvasNode[] = [
    {
      id: 'node-1',
      deviceId: 'nge100',
      name: 'NGE100 Power Supply',
      type: 'Power Supply',
      x: 100,
      y: 100,
      properties: {
        voltage: 15.5,
        current: 2.1,
        output: true
      }
    },
    {
      id: 'node-2',
      deviceId: 'fpc1500',
      name: 'FPC1500 Spectrum Analyzer',
      type: 'Spectrum Analyzer',
      x: 350,
      y: 100,
      properties: {
        centerFreq: 1000,
        span: 20,
        refLevel: -5
      }
    },
    {
      id: 'node-3',
      deviceId: 'rtb24',
      name: 'RTB24 Oscilloscope',
      type: 'Oscilloscope',
      x: 600,
      y: 100,
      properties: {
        ch1Scale: 2.0,
        timebase: 5,
        trigger: 'CH2'
      }
    },
    {
      id: 'node-4',
      deviceId: 'hmf2550',
      name: 'HMF2550 Function Generator',
      type: 'Function Generator',
      x: 100,
      y: 300,
      properties: {
        frequency: 25.0,
        amplitude: 4.5
      }
    }
  ]

  describe('generateScriptAndChecklist', () => {
    it('generates PyVISA Python script correctly interpreting all instrument parameters', () => {
      const result = generateScriptAndChecklist(mockNodes)

      // Script asserts
      expect(result.script).toContain('import pyvisa')
      expect(result.script).toContain('def run_experiment():')
      
      // NGE100 parameter validation in generated script
      expect(result.script).toContain('INST OUT1')
      expect(result.script).toContain('VOLT 15.50')
      expect(result.script).toContain('CURR 2.10')
      expect(result.script).toContain('OUTP ON')
      
      // FPC1500 parameter validation in generated script
      expect(result.script).toContain('FREQ:CENT 1000e6')
      expect(result.script).toContain('FREQ:SPAN 20e6')
      expect(result.script).toContain('DISP:TRAC:Y:RLEV -5')
      
      // RTB24 parameter validation in generated script
      expect(result.script).toContain('TIM:SCAL 5e-3')
      expect(result.script).toContain('CHAN1:SCAL 2')
      expect(result.script).toContain('TRIG:A:SOUR CH2')

      // HMF2550 parameter validation in generated script
      expect(result.script).toContain('FREQ 25e3')
      expect(result.script).toContain('VOLT 4.5')
      expect(result.script).toContain('OUTP ON')

      // Checklist asserts
      expect(result.checklist).toHaveLength(4)
      expect(result.checklist[0]).toContain('15.50 V')
      expect(result.checklist[0]).toContain('2.10 A')
      expect(result.checklist[1]).toContain('20 MHz')
      expect(result.checklist[2]).toContain('2 V/div')
      expect(result.checklist[3]).toContain('25 kHz')

      // Rationale asserts
      expect(result.rationale).toHaveLength(4)
      expect(result.rationale[0]).toContain('NGE100')
      expect(result.rationale[0]).toContain('15.50 V')
      expect(result.rationale[1]).toContain('FPC1500')
      expect(result.rationale[1]).toContain('1000 MHz')
      expect(result.rationale[2]).toContain('RTB24')
      expect(result.rationale[3]).toContain('HMF2550')
    })

    it('returns a fallback checklist if node list is empty', () => {
      const result = generateScriptAndChecklist([])
      expect(result.checklist).toHaveLength(1)
      expect(result.checklist[0]).toContain('Add devices to your workflow')
    })
  })

  describe('generateSCPITerminalLogs', () => {
    it('generates mock SCPI terminal sequences matching nodes on the canvas', () => {
      const logs = generateSCPITerminalLogs(mockNodes)

      // Header log lines check
      expect(logs[0].text).toContain('Starting simulated instrument calibration')
      expect(logs[1].text).toContain('resource manager opened')

      // NGE100 logs check
      expect(logs.some(l => l.text.includes('192.168.8.101'))).toBe(true)
      expect(logs.some(l => l.text.includes('Connected to Rohde&Schwarz,NGE102'))).toBe(true)
      expect(logs.some(l => l.text.includes('-> VOLT 15.50'))).toBe(true)
      expect(logs.some(l => l.text.includes('-> CURR 2.10'))).toBe(true)
      expect(logs.some(l => l.text.includes('-> OUTP ON'))).toBe(true)

      // FPC1500 logs check
      expect(logs.some(l => l.text.includes('192.168.8.102'))).toBe(true)
      expect(logs.some(l => l.text.includes('Connected to Rohde&Schwarz,FPC1500'))).toBe(true)
      expect(logs.some(l => l.text.includes('-> FREQ:CENT 1000e6'))).toBe(true)
      expect(logs.some(l => l.text.includes('-> FREQ:SPAN 20e6'))).toBe(true)
      expect(logs.some(l => l.text.includes('-> DISP:TRAC:Y:RLEV -5'))).toBe(true)

      // RTB24 logs check
      expect(logs.some(l => l.text.includes('192.168.8.103'))).toBe(true)
      expect(logs.some(l => l.text.includes('Connected to Rohde&Schwarz,RTB2004'))).toBe(true)
      expect(logs.some(l => l.text.includes('-> TIM:SCAL 5e-3'))).toBe(true)
      expect(logs.some(l => l.text.includes('-> CHAN1:SCAL 2'))).toBe(true)
      expect(logs.some(l => l.text.includes('-> TRIG:A:SOUR CH2'))).toBe(true)

      // HMF2550 logs check
      expect(logs.some(l => l.text.includes('192.168.8.104'))).toBe(true)
      expect(logs.some(l => l.text.includes('Connected to Rohde&Schwarz,HMF2550'))).toBe(true)
      expect(logs.some(l => l.text.includes('-> FREQ 25e3'))).toBe(true)
      expect(logs.some(l => l.text.includes('-> VOLT 4.5'))).toBe(true)
      expect(logs.some(l => l.text.includes('-> OUTP ON'))).toBe(true)

      // End log line check
      expect(logs[logs.length - 1].text).toContain('simulated successfully')
    })
  })

  describe('generateSCPITerminalLogsFromScript', () => {
    const sampleScript = `
import pyvisa
def run():
    rm = pyvisa.ResourceManager()
    nge = rm.open_resource('TCPIP0::192.168.8.101::5025::SOCKET')
    nge.write("VOLT 24.50")
    nge.write("CURR 1.80")
    nge.write("OUTP ON")
    print("NGE100 configured successfully")
    nge.close()
`

    it('successfully parses valid Python SCPI calls and prints', () => {
      const logs = generateSCPITerminalLogsFromScript(sampleScript, false)
      expect(logs[0].text).toContain('Starting simulated instrument calibration')
      expect(logs.some(l => l.text.includes('CONNECT TCPIP0::192.168.8.101'))).toBe(true)
      expect(logs.some(l => l.text.includes('Connected to Rohde&Schwarz,NGE102'))).toBe(true)
      expect(logs.some(l => l.text.includes('-> VOLT 24.50'))).toBe(true)
      expect(logs.some(l => l.text.includes('-> CURR 1.80'))).toBe(true)
      expect(logs.some(l => l.text.includes('-> OUTP ON'))).toBe(true)
      expect(logs.some(l => l.text.includes('>> NGE100 configured successfully'))).toBe(true)
      expect(logs[logs.length - 1].text).toContain('simulated successfully')
    })

    it('simulates hardware timeout errors when simulateError is true', () => {
      const logs = generateSCPITerminalLogsFromScript(sampleScript, true)
      expect(logs[0].text).toContain('Starting simulated instrument calibration')
      expect(logs.some(l => l.text.includes('CONNECT TCPIP0::192.168.8.101'))).toBe(true)
      expect(logs.some(l => l.text.includes('VISA IO Error: VI_ERROR_TMO'))).toBe(true)
      expect(logs.some(l => l.text.includes('Aborting workflow run'))).toBe(true)
      expect(logs[logs.length - 1].text).toContain('Workflow simulation failed')
    })

    it('returns error log if script is empty or null', () => {
      const logs = generateSCPITerminalLogsFromScript(null, false)
      expect(logs[0].text).toContain('No script generated yet')
    })
  })
})

