export interface CanvasNode {
  id: string;
  deviceId: string;
  name: string;
  type: string;
  x: number;
  y: number;
  properties: Record<string, any>;
}

export interface NarrationStep {
  type: 'thinking' | 'step' | 'summary';
  label: string;
  stepType?: 'validate' | 'generate' | 'write' | 'checklist';
}

export interface ScriptGenerationResult {
  narrationSteps: NarrationStep[];
  script: string;
  checklist: string[];
}

export const generateScriptAndChecklist = (nodes: CanvasNode[]): ScriptGenerationResult => {
  const narrationSteps: NarrationStep[] = [
    {
      type: 'step',
      label: 'Validating instrument parameters against safety limits...',
      stepType: 'validate'
    },
    {
      type: 'step',
      label: 'Generating SCPI command sequence...',
      stepType: 'generate'
    },
    {
      type: 'step',
      label: 'Writing Python script with PyVISA socket connections...',
      stepType: 'write'
    },
    {
      type: 'step',
      label: 'Building human-readable laboratory checklist...',
      stepType: 'checklist'
    }
  ];

  let script = `# ====================================================================
# ROHDE & SCHWARZ - VOLTAIC WORKFLOW AUTOMATION SCRIPT
# Generated: ${new Date().toLocaleDateString()}
# VISA Library: PyVISA (pip install pyvisa)
# ====================================================================
import pyvisa
import time

def run_experiment():
    # Initialize Visa Resource Manager
    rm = pyvisa.ResourceManager()
    print("Available Instruments on Visa Bus:")
    try:
        resources = rm.list_resources()
        for idx, res in enumerate(resources):
            print(f" [{idx}] {res}")
    except Exception as e:
        print("Warning listing resources:", e)
        print("Continuing with configured direct TCP/IP VISA strings...")

`;

  const checklist: string[] = [];

  nodes.forEach((node) => {
    if (node.deviceId === 'nge100') {
      const v = parseFloat(node.properties.voltage ?? 12.0).toFixed(2);
      const c = parseFloat(node.properties.current ?? 1.5).toFixed(2);
      const output = node.properties.output ? 'ON' : 'OFF';

      script += `    # ------------------------------------------------------------
    # Configure NGE100 Power Supply
    # ------------------------------------------------------------
    print("\\nConnecting to Power Supply (NGE100)...")
    try:
        nge = rm.open_resource('TCPIP0::192.168.8.101::5025::SOCKET')
        nge.read_termination = '\\n'
        nge.write_termination = '\\n'
        nge.timeout = 5000
        
        # Reset and configure Channel 1
        nge.write("*RST")
        nge.write("INST OUT1")
        nge.write("VOLT ${v}")
        nge.write("CURR ${c}")
        nge.write("OUTP ${output}")
        
        print(f" NGE100 Status: {nge.query('*IDN?')}")
        print(" NGE100 Output Set: ${v} V @ ${c} A limit [${output}]")
        nge.close()
    except Exception as e:
        print(f" Error connecting to NGE100: {e}")

`;
      checklist.push(`Prepare the R&S NGE100 power cables. Ensure the output is safely limited to **${v} V** and **${c} A** limits before activating.`);
    }

    if (node.deviceId === 'fpc1500') {
      const cf = parseFloat(node.properties.centerFreq ?? 500.0);
      const span = parseFloat(node.properties.span ?? 10.0);
      const ref = parseFloat(node.properties.refLevel ?? -10.0);

      script += `    # ------------------------------------------------------------
    # Configure FPC1500 Spectrum Analyzer
    # ------------------------------------------------------------
    print("\\nConnecting to Spectrum Analyzer (FPC1500)...")
    try:
        fpc = rm.open_resource('TCPIP0::192.168.8.102::5025::SOCKET')
        fpc.read_termination = '\\n'
        fpc.write_termination = '\\n'
        fpc.timeout = 5000
        
        # Reset and configure Center Freq, Span, Ref Level
        fpc.write("*RST")
        fpc.write("FREQ:CENT ${cf}e6") # Convert MHz to Hz
        fpc.write("FREQ:SPAN ${span}e6")
        fpc.write("DISP:TRAC:Y:RLEV ${ref}")
        
        print(f" FPC1500 Status: {fpc.query('*IDN?')}")
        print(" FPC1500 configured: CF = ${cf} MHz, Span = ${span} MHz, Ref = ${ref} dBm")
        fpc.close()
    except Exception as e:
        print(f" Error connecting to FPC1500: {e}")

`;
      checklist.push(`Verify the RF connection line from the signal board is routed to the R&S FPC1500 RF input port. Verify span is **${span} MHz**.`);
    }

    if (node.deviceId === 'rtb24') {
      const tb = parseFloat(node.properties.timebase ?? 1.0);
      const scale = parseFloat(node.properties.ch1Scale ?? 1.0);
      const trigger = node.properties.trigger ?? 'CH1';

      script += `    # ------------------------------------------------------------
    # Configure RTB24 Oscilloscope
    # ------------------------------------------------------------
    print("\\nConnecting to Oscilloscope (RTB24)...")
    try:
        rtb = rm.open_resource('TCPIP0::192.168.8.103::5025::SOCKET')
        rtb.read_termination = '\\n'
        rtb.write_termination = '\\n'
        rtb.timeout = 5000
        
        # Reset and configure horizontal / vertical channels
        rtb.write("*RST")
        rtb.write("TIM:SCAL ${tb}e-3") # Convert ms to seconds
        rtb.write("CHAN1:STAT ON")
        rtb.write("CHAN1:SCAL ${scale}")
        rtb.write("TRIG:A:SOUR ${trigger}")
        
        print(f" RTB24 Status: {rtb.query('*IDN?')}")
        print(" RTB24 sweep loaded: Timebase = ${tb} ms/div, CH1 scale = ${scale} V/div")
        rtb.close()
    except Exception as e:
        print(f" Error connecting to RTB24: {e}")

`;
      checklist.push(`Connect a matching high-impedance probe to R&S RTB24 Channel 1 and clip ground. Verify vertical scale is **${scale} V/div**.`);
    }

    if (node.deviceId === 'hmf2550') {
      const freq = parseFloat(node.properties.frequency ?? 10.0);
      const amp = parseFloat(node.properties.amplitude ?? 2.0);

      script += `    # ------------------------------------------------------------
    # Configure HMF2550 Function Generator
    # ------------------------------------------------------------
    print("\\nConnecting to Function Generator (HMF2550)...")
    try:
        hmf = rm.open_resource('TCPIP0::192.168.8.104::5025::SOCKET')
        hmf.read_termination = '\\n'
        hmf.write_termination = '\\n'
        hmf.timeout = 5000
        
        # Reset and configure reference sine wave output
        hmf.write("*RST")
        hmf.write("FREQ ${freq}e3") # Convert kHz to Hz
        hmf.write("VOLT ${amp}")
        hmf.write("OUTP ON")
        
        print(f" HMF2550 Status: {hmf.query('*IDN?')}")
        print(" HMF2550 sine wave active: Freq = ${freq} kHz, Amplitude = ${amp} Vpp")
        hmf.close()
    except Exception as e:
        print(f" Error connecting to HMF2550: {e}")

`;
      checklist.push(`Verify the coaxial signal cables are plugged into R&S HMF2550 Channel 1 output port and verify reference wave frequency is **${freq} kHz**.`);
    }
  });

  script += `    print("\\nExperiment workflow initialized successfully.")

if __name__ == "__main__":
    run_experiment()
`;

  if (checklist.length === 0) {
    checklist.push("Add devices to your workflow on the canvas before compiling SCPI laboratory steps.");
  }

  return {
    narrationSteps,
    script,
    checklist
  };
};

export interface SCPILogLine {
  text: string;
  type: 'cmd' | 'res' | 'success' | 'warning';
}

export const generateSCPITerminalLogs = (nodes: CanvasNode[]): SCPILogLine[] => {
  const logs: SCPILogLine[] = [
    { text: '>> Starting simulated instrument calibration execution...', type: 'cmd' },
    { text: '>> PyVISA resource manager opened.', type: 'res' }
  ];

  let hasNGE = false;
  let hasFPC = false;

  nodes.forEach((node) => {
    if (node.deviceId === 'nge100') {
      hasNGE = true;
      const v = parseFloat(node.properties.voltage ?? 12.0).toFixed(2);
      const c = parseFloat(node.properties.current ?? 1.5).toFixed(2);
      const output = node.properties.output ? 'ON' : 'OFF';

      logs.push(
        { text: 'CONNECT TCPIP0::192.168.8.101::5025::SOCKET', type: 'cmd' },
        { text: '<- Connected to Rohde&Schwarz,NGE102,123456,1.0', type: 'res' },
        { text: '-> *RST', type: 'cmd' },
        { text: '<- OK', type: 'res' },
        { text: '-> INST OUT1', type: 'cmd' },
        { text: '<- OK', type: 'res' },
        { text: `-> VOLT ${v}`, type: 'cmd' },
        { text: '<- OK', type: 'res' },
        { text: `-> CURR ${c}`, type: 'cmd' },
        { text: '<- OK', type: 'res' },
        { text: `-> OUTP ${output}`, type: 'cmd' },
        { text: '<- OK', type: 'res' }
      );
    }

    if (node.deviceId === 'fpc1500') {
      hasFPC = true;
      const cf = parseFloat(node.properties.centerFreq ?? 500.0);
      const span = parseFloat(node.properties.span ?? 10.0);
      const ref = parseFloat(node.properties.refLevel ?? -10.0);

      logs.push(
        { text: 'CONNECT TCPIP0::192.168.8.102::5025::SOCKET', type: 'cmd' },
        { text: '<- Connected to Rohde&Schwarz,FPC1500,654321,2.0', type: 'res' },
        { text: '-> *RST', type: 'cmd' },
        { text: '<- OK', type: 'res' },
        { text: `-> FREQ:CENT ${cf}e6`, type: 'cmd' },
        { text: '<- OK', type: 'res' },
        { text: `-> FREQ:SPAN ${span}e6`, type: 'cmd' },
        { text: '<- OK', type: 'res' },
        { text: `-> DISP:TRAC:Y:RLEV ${ref}`, type: 'cmd' },
        { text: '<- OK', type: 'res' }
      );
    }

    if (node.deviceId === 'rtb24') {
      const tb = parseFloat(node.properties.timebase ?? 1.0);
      const scale = parseFloat(node.properties.ch1Scale ?? 1.0);
      const trigger = node.properties.trigger ?? 'CH1';

      logs.push(
        { text: 'CONNECT TCPIP0::192.168.8.103::5025::SOCKET', type: 'cmd' },
        { text: '<- Connected to Rohde&Schwarz,RTB2004,112233,1.5', type: 'res' },
        { text: '-> *RST', type: 'cmd' },
        { text: '<- OK', type: 'res' },
        { text: `-> TIM:SCAL ${tb}e-3`, type: 'cmd' },
        { text: '<- OK', type: 'res' },
        { text: '-> CHAN1:STAT ON', type: 'cmd' },
        { text: '<- OK', type: 'res' },
        { text: `-> CHAN1:SCAL ${scale}`, type: 'cmd' },
        { text: '<- OK', type: 'res' },
        { text: `-> TRIG:A:SOUR ${trigger}`, type: 'cmd' },
        { text: '<- OK', type: 'res' }
      );
    }

    if (node.deviceId === 'hmf2550') {
      const freq = parseFloat(node.properties.frequency ?? 10.0);
      const amp = parseFloat(node.properties.amplitude ?? 2.0);

      logs.push(
        { text: 'CONNECT TCPIP0::192.168.8.104::5025::SOCKET', type: 'cmd' },
        { text: '<- Connected to Rohde&Schwarz,HMF2550,445566,1.2', type: 'res' },
        { text: '-> *RST', type: 'cmd' },
        { text: '<- OK', type: 'res' },
        { text: `-> FREQ ${freq}e3`, type: 'cmd' },
        { text: '<- OK', type: 'res' },
        { text: `-> VOLT ${amp}`, type: 'cmd' },
        { text: '<- OK', type: 'res' },
        { text: '-> OUTP ON', type: 'cmd' },
        { text: '<- OK', type: 'res' }
      );
    }
  });

  // Randomly add a realistic warning for extra immersion (50% chance, and only if we have nodes)
  if (nodes.length > 0 && Math.random() > 0.5) {
    if (hasFPC) {
      logs.push({ text: '⚠ FPC1500: Reference level adjusted to safe range (-20 to +10 dBm)', type: 'warning' });
    } else if (hasNGE) {
      logs.push({ text: '⚠ NGE100: Overcurrent protection (OCP) threshold initialized on CH1', type: 'warning' });
    } else {
      logs.push({ text: '⚠ Device limit thresholds validated against hardware presets', type: 'warning' });
    }
  }

  logs.push({ text: '✓ Workflow simulated successfully — 0 errors', type: 'success' });
  return logs;
};
