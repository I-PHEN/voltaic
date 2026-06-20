# RTB24 Oscilloscope — Extracted Specifications & SCPI Reference

This reference outlines the physical limits and SCPI command syntax for the Rohde & Schwarz RTB24 Oscilloscope, extracted from the instrument specifications and user manuals.

## 1. Hardware Specifications & Safe Limits
* **Channels**: 4 analog channels.
* **Vertical Scale Range**: `1 mV/div` to `10 V/div` (`0.001 V` to `10.00 V`).
* **Horizontal Sweep Range (Timebase)**: `1 ns/div` to `500 s/div` (`0.000001 ms` to `500000 ms`).
* **Input Impedance**: `1 MΩ` analog input ports.
* **Trigger Source options**: `CH1` (Channel 1), `CH2` (Channel 2), `EXT` (External Trigger).

## 2. SCPI Command Syntax Reference
All socket messages should use a trailing newline (`\n`) write/read termination.

* **Set Timebase (Horizontal Scale)**:
  `TIM:SCAL <value_in_seconds>`
  * Note: Must convert ms to seconds before sending command.
  * Example: `TIM:SCAL 1e-3` (for 1 ms/div horizontal scale)
* **Toggle Channel State**:
  `CHAN1:STAT <ON|OFF>` (substitute channel index as needed, e.g. `CHAN2:STAT`).
  * Example: `CHAN1:STAT ON`
* **Set Vertical Channel Scale**:
  `CHAN1:SCAL <value_in_volts_per_division>`
  * Example: `CHAN1:SCAL 1.0` (for 1 V/div scale)
* **Select Active Trigger Source**:
  `TRIG:A:SOUR <source>`
  * Values: `CH1` | `CH2` | `EXT`
  * Example: `TRIG:A:SOUR CH1`
* **Instrument Identification Query**:
  `*IDN?`
  * Expected Response: `Rohde&Schwarz,RTB2004,112233,1.5`
* **Reset to Factory Defaults**:
  `*RST`
