# Voltaic — Project Requirements Document (PRD)

## Hackathon
- **Event**: Rohde & Schwarz x KNUST — AI-Assisted Onboarding in Electrical Engineering
- **Track**: Intelligent Instrumentation Workflow Builder

## Team
- **Name**: Voltaic
- **Members**: [Michael, Antigravity AI]

## Problem Statement
Configuring a multi-instrument test bench and translating measurement intent into instrument commands is time-consuming and error-prone for new engineers and students.

## Our Solution
A web application where the user describes a measurement in plain English. Voltaic places the right R&S instruments on a visual canvas, configures their parameters, validates them against device limits, and generates a runnable Python/SCPI script with a human-readable checklist.

---

## Target Devices (V1)
- **FPC1500** — Spectrum Analyzer (Primary, fully configured)
- **RTB24** — Oscilloscope (Primary, fully configured)
- **NGE100** — Power Supply (Primary, fully configured)
- **HMF2550** — Function Generator (Sidebar list only)
- **ZNLE6** — Vector Network Analyzer (Sidebar list only)
- **7352A** — Step Attenuator (Sidebar list only)

---

## Roadmap & Frontend Versions (Today)
- **V1: Static Layout** (Completed)
  - Sidebar, canvas grid, and Voltaic Assistant chat panel layout.
- **V2: Drag and Drop**
  - Devices can be dragged from the sidebar and land on the canvas as visual nodes.
- **V3: Chat Assistant Alive**
  - Real-time messages list, visual state synchronization with the canvas, and quick-action suggestion chips.
- **V4: Property Inspector on Click**
  - Selecting a device node on the canvas opens its parameter properties (e.g., frequency, voltage) to edit inline or in a side properties panel.
- **V5: Full AI Integration** (Tomorrow)
  - Natural English intent → AI planner placement → SCPI code generation directly in the assistant chat pane.

---

## Backend Requirements (Tomorrow)
- **API Endpoint**: Accepts the canvas state (nodes, parameters) + natural language intent string.
- **LLM Agent & Device Schemas**: Runs an LLM call equipped with device limits and tool schemas.
- **SCPI Generation & Validation**:
  - Automatically compiles standard SCPI commands.
  - Validates parameter limits (e.g., ensuring NGE100 voltage does not exceed hardware limits).
- **Return Payload**: Python script + human-readable setup/checklist.

---

## Voice Input (Later Phase)
- Microphone button in the chat input (placeholder in V1/V2).
- Links speech-to-text to the natural language message handler.

---

## Key Demo Flow (Judge Walkthrough)
1. User types: `"measure SNR of amplifier at 500 MHz"`
2. AI automatically places the **FPC1500** (Spectrum Analyzer) and **NGE100** (Power Supply) on the canvas.
3. Parameters (frequency, supply voltage) are auto-populated based on the prompt context.
4. Validation rules run against device limits.
5. Python/SCPI script is generated and displayed in the assistant interface.
6. A step-by-step human verification checklist is displayed alongside the code.

---

## Evaluation Criteria
- **Correctness**: Generated SCPI scripts produce expected configurations in simulated environments.
- **Coverage**: Competently handles diverse measurement intents and multiple instruments.
- **Safety**: Rejects/blocks commands that exceed physical instrument thresholds (e.g., over-voltage, out-of-band frequency).
- **Readability**: Clear, formatted step-by-step user checklist.

## Out of Scope
- Real hardware network execution (execution is simulated).
- AR or real-time voice streaming (voice input is placeholder only).
- Complete parameters configuration support for more than the 3 primary devices.
