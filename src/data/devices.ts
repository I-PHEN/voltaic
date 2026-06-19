export interface Device {
  id: string;
  name: string;
  type: string;
}

export const devices: Device[] = [
  { id: 'fpc1500', name: 'FPC1500', type: 'Spectrum Analyzer' },
  { id: 'rtb24', name: 'RTB24', type: 'Oscilloscope' },
  { id: 'nge100', name: 'NGE100', type: 'Power Supply' },
  { id: 'hmf2550', name: 'HMF2550', type: 'Function Generator' },
  { id: 'znle6', name: 'ZNLE6', type: 'Vector Network Analyzer' },
  { id: '7352a', name: '7352A', type: 'Step Attenuator' }
];
