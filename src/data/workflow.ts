export interface WorkflowStep {
  type: 'thinking' | 'add_device' | 'connect' | 'summary';
  label?: string;
  payload?: {
    deviceId?: string;
    nodeName?: string;
    nodeType?: string;
    properties?: Record<string, any>;
    x?: number;
    y?: number;
    fromId?: string;
    toId?: string;
    summaryText?: string;
  };
}

export const generateWorkflowSteps = (intent: string): WorkflowStep[] => {
  const cleaned = intent.toLowerCase();
  
  if (cleaned.includes('snr') || cleaned.includes('amplifier') || cleaned.includes('spectrum')) {
    const ngeTempId = `nge_temp_${Date.now()}`;
    const fpcTempId = `fpc_temp_${Date.now()}`;
    return [
      {
        type: 'thinking'
      },
      {
        type: 'add_device',
        label: 'Adding NGE100 Power Supply to provide stable +12V DC power to the amplifier circuit',
        payload: {
          deviceId: 'nge100',
          nodeName: 'NGE100',
          nodeType: 'Power Supply',
          x: 60,
          y: 110,
          properties: { voltage: 12.0, current: 1.5, output: true },
          fromId: ngeTempId
        }
      },
      {
        type: 'add_device',
        label: 'Adding FPC1500 Spectrum Analyzer configured to capture the active frequency response',
        payload: {
          deviceId: 'fpc1500',
          nodeName: 'FPC1500',
          nodeType: 'Spectrum Analyzer',
          x: 340,
          y: 110,
          properties: { centerFreq: 500.0, span: 10.0, refLevel: -10 },
          fromId: fpcTempId
        }
      },
      {
        type: 'connect',
        label: 'Routing coaxial link from NGE100 Channel 1 output port to FPC1500 RF input socket',
        payload: {
          fromId: ngeTempId,
          toId: fpcTempId
        }
      },
      {
        type: 'summary',
        payload: {
          summaryText: "I've analyzed your request and placed the NGE100 Power Supply (connected to power the amplifier at 12V) and the FPC1500 Spectrum Analyzer (configured to a span of 10 MHz centered at 500 MHz) on the canvas. Click on the cards to inspect or edit parameters."
        }
      }
    ];
  } else if (cleaned.includes('sine') || cleaned.includes('wave') || cleaned.includes('oscilloscope') || cleaned.includes('waveform')) {
    const hmfTempId = `hmf_temp_${Date.now()}`;
    const rtbTempId = `rtb_temp_${Date.now()}`;
    return [
      {
        type: 'thinking'
      },
      {
        type: 'add_device',
        label: 'Adding HMF2550 Function Generator supplying a clean 10 kHz reference sine wave',
        payload: {
          deviceId: 'hmf2550',
          nodeName: 'HMF2550',
          nodeType: 'Function Generator',
          x: 60,
          y: 110,
          properties: { frequency: 10.0, amplitude: 2.0 },
          fromId: hmfTempId
        }
      },
      {
        type: 'add_device',
        label: 'Adding RTB24 Oscilloscope to visualize the waveform sweeps in real-time',
        payload: {
          deviceId: 'rtb24',
          nodeName: 'RTB24',
          nodeType: 'Oscilloscope',
          x: 340,
          y: 110,
          properties: { timebase: 1.0, ch1Scale: 1.0, trigger: 'CH1' },
          fromId: rtbTempId
        }
      },
      {
        type: 'connect',
        label: 'Connecting HMF2550 signal output to RTB24 Channel 1 probe socket',
        payload: {
          fromId: hmfTempId,
          toId: rtbTempId
        }
      },
      {
        type: 'summary',
        payload: {
          summaryText: "I've set up the function generator to supply a 10 kHz sine wave and linked it to Channel 1 of the RTB24 Oscilloscope. Visual parameters are loaded on the screen. Select a card to edit."
        }
      }
    ];
  } else if (cleaned.includes('unsafe') || cleaned.includes('limit') || cleaned.includes('45')) {
    const ngeTempId = `nge_temp_${Date.now()}`;
    return [
      {
        type: 'thinking'
      },
      {
        type: 'add_device',
        label: 'Adding NGE100 Power Supply configured to an unsafe voltage of 45.00V to test safety limits...',
        payload: {
          deviceId: 'nge100',
          nodeName: 'NGE100',
          nodeType: 'Power Supply',
          x: 180,
          y: 110,
          properties: { voltage: 45.0, current: 1.5, output: true },
          fromId: ngeTempId
        }
      },
      {
        type: 'summary',
        payload: {
          summaryText: "Placed the NGE100 Power Supply on the canvas. Note: The configured voltage of 45.0 V exceeds the safe physical limits of 32.00 V, which will trigger a validation alert. Click the 'Validate' button to run validation checks!"
        }
      }
    ];
  } else if (cleaned.includes('board') || cleaned.includes('power a board') || cleaned.includes('25')) {
    const ngeTempId = `nge_temp_${Date.now()}`;
    const hmfTempId = `hmf_temp_${Date.now()}`;
    const rtbTempId = `rtb_temp_${Date.now()}`;
    return [
      {
        type: 'thinking'
      },
      {
        type: 'add_device',
        label: 'Adding NGE100 Power Supply supplying +5.0V DC bias voltage to the signal board',
        payload: {
          deviceId: 'nge100',
          nodeName: 'NGE100',
          nodeType: 'Power Supply',
          x: 60,
          y: 110,
          properties: { voltage: 5.0, current: 1.0, output: true },
          fromId: ngeTempId
        }
      },
      {
        type: 'add_device',
        label: 'Adding HMF2550 Function Generator generating a 25.0 kHz reference wave on the board input',
        payload: {
          deviceId: 'hmf2550',
          nodeName: 'HMF2550',
          nodeType: 'Function Generator',
          x: 310,
          y: 110,
          properties: { frequency: 25.0, amplitude: 3.5 },
          fromId: hmfTempId
        }
      },
      {
        type: 'add_device',
        label: 'Adding RTB24 Oscilloscope configured to trace the signal output from Channel 1',
        payload: {
          deviceId: 'rtb24',
          nodeName: 'RTB24',
          nodeType: 'Oscilloscope',
          x: 560,
          y: 110,
          properties: { timebase: 2.0, ch1Scale: 1.0, trigger: 'CH1' },
          fromId: rtbTempId
        }
      },
      {
        type: 'connect',
        label: 'Routing power supply output bias lines to board bias terminals',
        payload: {
          fromId: ngeTempId,
          toId: hmfTempId
        }
      },
      {
        type: 'connect',
        label: 'Routing function generator RF output to oscilloscope probe input socket',
        payload: {
          fromId: hmfTempId,
          toId: rtbTempId
        }
      },

      {
        type: 'summary',
        payload: {
          summaryText: "I've configured a multi-instrument setup for your signal board: NGE100 provides 5V bias power, HMF2550 generates a 25 kHz signal, and RTB24 traces the output. Ready for limits validation."
        }
      }
    ];
  } else if (cleaned.includes('clear') || cleaned.includes('reset')) {
    return [
      {
        type: 'thinking'
      },
      {
        type: 'summary',
        payload: {
          summaryText: 'CLEAR_CANVAS'
        }
      }
    ];
  } else {
    return [
      {
        type: 'thinking'
      },
      {
        type: 'summary',
        payload: {
          summaryText: "I couldn't identify a hardware plan for that request. Try selecting one of the suggestion chips below to populate the workbench canvas!"
        }
      }
    ];
  }
}
