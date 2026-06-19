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
};
