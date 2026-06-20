# FPC1500 Spectrum Analyzer — Extracted Specifications & SCPI Reference

This reference outlines the physical limits and SCPI command syntax for the Rohde & Schwarz FPC1500 Spectrum Analyzer, extracted from the instrument specifications.

## 1. Hardware Specifications & Safe Limits
* **Frequency Range**: `5 kHz` to `1.0 GHz` (extendable to `1.5 GHz` or `3.0 GHz` via keycode upgrades). The workbench default maximum span is capped at `1500.00 MHz`.
* **Span limits**: `10 Hz` to `1.5 GHz` (`0.00001 MHz` to `1500.00 MHz`). Zero-span mode is also supported.
* **Reference Level Range**: `-130 dBm` to `+30 dBm` (steps of 1 dB).
* **Input Impedance**: `50 Ω` RF input socket. Maximum RF safe input power is `+30 dBm` (1 W).

## 2. SCPI Command Syntax Reference
All socket messages should use a trailing newline (`\n`) write/read termination.

* **Set Center Frequency**:
  `FREQ:CENT <value_in_hz>`
  * Note: Must convert MHz to Hz before sending command.
  * Example: `FREQ:CENT 1000e6` (for 1000 MHz / 1 GHz center frequency)
* **Set Sweep Span**:
  `FREQ:SPAN <value_in_hz>`
  * Note: Must convert MHz to Hz before sending command.
  * Example: `FREQ:SPAN 10e6` (for 10 MHz span)
* **Set Amplitude Reference Level**:
  `DISP:TRAC:Y:RLEV <value_in_dbm>`
  * Format: Numeric value in dBm.
  * Example: `DISP:TRAC:Y:RLEV -10.0`
* **Instrument Identification Query**:
  `*IDN?`
  * Expected Response: `Rohde&Schwarz,FPC1500,654321,2.0`
* **Reset to Factory Defaults**:
  `*RST`
  * Resets trace configurations and re-centers sweep settings to factory defaults.
