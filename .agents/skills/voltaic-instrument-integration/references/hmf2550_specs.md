# HMF2550 Function Generator — Extracted Specifications & SCPI Reference

This reference outlines the physical limits and SCPI command syntax for the Rohde & Schwarz HMF2550 Function Generator, extracted from the instrument specifications.

## 1. Hardware Specifications & Safe Limits
* **Sine Wave Frequency Range**: `10 Hz` to `50 MHz` (`0.00001 kHz` to `50000.00 kHz`).
* **Output Amplitude**: `1 mVpp` to `10 Vpp` (`0.001 Vpp` to `10.00 Vpp`) into `50 Ω` load.
* **Output Impedance**: `50 Ω` output BNC connector.

## 2. SCPI Command Syntax Reference
All socket messages should use a trailing newline (`\n`) write/read termination.

* **Set Signal Frequency**:
  `FREQ <value_in_hz>`
  * Note: Must convert kHz to Hz before sending command.
  * Example: `FREQ 10e3` (for 10 kHz signal output)
* **Set Signal Amplitude**:
  `VOLT <value_in_vpp>`
  * Example: `VOLT 2.0` (for 2 Vpp output amplitude)
* **Toggle Output Channel State**:
  `OUTP <ON|OFF>`
  * Example: `OUTP ON`
* **Instrument Identification Query**:
  `*IDN?`
  * Expected Response: `Rohde&Schwarz,HMF2550,445566,1.2`
* **Reset to Factory Defaults**:
  `*RST`
