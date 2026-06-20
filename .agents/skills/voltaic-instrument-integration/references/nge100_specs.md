# NGE100 Power Supply — Extracted Specifications & SCPI Reference

This reference outlines the physical limits and SCPI command syntax for the Rohde & Schwarz NGE100 Power Supply, extracted from the instrument specifications.

## 1. Hardware Specifications & Safe Limits
* **Channels**: Isolated dual-channel or triple-channel outputs.
* **Voltage Range**: `0.00 V` to `32.00 V` per channel.
* **Current Limit Range**: `0.05 A` to `3.00 A` per channel.
* **Max Output Power**: `66 W` per channel (up to `100 W` total output power).

## 2. SCPI Command Syntax Reference
All socket messages should use a trailing newline (`\n`) write/read termination.

* **Select Active Channel**:
  `INST OUT1` (or `INST OUT2` / `INST OUT3` depending on channel index).
* **Set Target Voltage Output**:
  `VOLT <value>`
  * Format: Float in volts.
  * Example: `VOLT 12.00`
* **Set Target Current Limit**:
  `CURR <value>`
  * Format: Float in amperes.
  * Example: `CURR 1.50`
* **Toggle Output Channel State**:
  `OUTP <ON|OFF>`
  * Example: `OUTP ON`
* **Instrument Identification Query**:
  `*IDN?`
  * Expected Response: `Rohde&Schwarz,NGE102,123456,1.0`
* **Reset to Factory Defaults**:
  `*RST`
  * Resets voltage to 0V, current to max limit, output state to OFF.
