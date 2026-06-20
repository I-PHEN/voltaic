# Voltaic — Project Rules & Track Alignment

This file is the source of truth for what we are building. Read this before making any
architectural or feature decision. If a requested feature does not clearly serve the
track below, flag it before building it.

---

## Hackathon

Rohde & Schwarz x KNUST — AI-Assisted Onboarding in Electrical Engineering

## Our Track

**Intelligent Instrumentation Workflow Builder**

### Official problem statement (from the brief)

Configuring a measurement chain and translating intent into instrument settings is
time-consuming. Build a tool that accepts a high-level intent (e.g., "measure SNR of
amplifier at 1 GHz") and auto-generates a multi-instrument workflow script, instrument
settings, and a reproducible measurement procedure.

### Official objectives (from the brief)

- Translate natural language or structured intent into sequenced instrument commands
  and test scripts.
- Validate generated workflows against device/measurement constraints (frequency
  limits, input ranges).
- Output runnable scripts (Python/SCPI) or instrument API calls plus a
  human-readable checklist.

### Official deliverables & demo criteria (from the brief)

- Demo of at least two intent → script flows, showing validation, simulated run, and
  (optionally) safe real hardware run.
- Generated scripts, README, and test dataset showing expected measurement outputs.

### Official evaluation metrics (from the brief, in priority order as written)

1. **Correctness** — scripts produce expected configuration and measurement in
   simulation.
2. **Coverage** — can handle varied intents and instruments.
3. **Safety** — prevents commands that violate limits or risk damage.
4. **Readability** — generated human checklist clarity.

### Official safety & lab considerations (from the brief)

- Include a pre-run safety checklist; block commands above safe thresholds.
- Require a "confirm & run" step before any real hardware execution.

### Official constraints & performance targets (from the brief)

- Generated workflows should run in simulator mode without error; real-hardware runs
  must require explicit human approval.
- Script generation time target: under 30 seconds for simple requests.

---

## What This Means We Are Building

A web app where a user describes a measurement in plain English. The AI interprets
that intent, builds a visual representation of the required instrument setup, validates
the configuration against real device limits, and produces two outputs: a runnable
Python/SCPI script and a human-readable checklist. Execution is simulated by default;
real hardware is an optional stretch, never a dependency for the core demo.

---

## Core Decisions Already Locked (do not silently change these)

- **No drag-and-drop.** The user never manually places instruments on the canvas.
  The AI decides the setup based on intent and populates the canvas itself. The
  canvas is a visual confirmation surface, not a construction tool.
- **Chat is the primary interaction.** All intent input happens through chat, not
  through manual canvas manipulation. Click-to-edit on a placed node for minor
  parameter tweaks is the only direct manipulation allowed.
- **AI-driven canvas population is staged, not instant.** The chat narrates each
  step (e.g. "Adding FPC1500...") while the canvas updates in sync, so the process
  visibly demonstrates reasoning rather than dumping a static result.
- **Script generation is a separate, deliberate action**, triggered by an explicit
  button click — never automatic. This mirrors the brief's "confirm & run" safety
  language even though we're in simulation, because the evaluation rewards visible
  safety-consciousness.
- **Script + checklist live in a dedicated output panel**, not buried in a chat
  bubble — they are the core deliverable and need room to be read, copied, and
  referenced.
- **A "Run Workflow" step simulates execution** with a live mock SCPI
  command/response console. This directly answers the brief's "simulated run" demo
  requirement. The demo path always ends in success — it does not fail live on stage.
- **Simulation is the default and sufficient path.** Real hardware connection is an
  optional stretch goal only, never a dependency for the core demo, per the brief's
  own "optionally" language around real-hardware runs.

## Devices

**Primary (fully supported, real specs, used in demo):**
- FPC1500 — Spectrum Analyzer
- RTB24 — Oscilloscope
- NGE100 — Power Supply

These three were chosen because they cover three distinct measurement-chain roles —
power/source, frequency-domain measurement, time-domain measurement — which is the
minimum set needed to demonstrate genuine multi-instrument *sequencing*, not just
single-device configuration. This directly serves the brief's "sequenced instrument
commands" objective.

**Listed but not fully wired (sidebar presence only, name + category accurate):**
- HMF2550 — Function Generator
- ZNLE6 — Vector Network Analyzer
- 7352A — Step Attenuator

These remain visible to demonstrate the architecture generalizes to more instruments
without a redesign — extending support is a data/spec problem, not a structural one.

---

## Guardrails — When To Push Back

Before adding any new feature, check it against these questions. If the honest answer
to any of these is "no," flag it to the user instead of building it silently:

1. **Does this serve correctness, coverage, safety, or readability** (the four
   evaluation metrics, in that priority order)? If a feature doesn't map to one of
   these, it's likely decoration, not substance.
2. **Does this keep the user as the describer of intent, not the manual builder?**
   Anything that reintroduces manual instrument placement or wiring contradicts our
   locked decision and the brief's own framing of "intent-based inputs."
3. **Does this respect the simulation-first, confirm-before-execute pattern?**
   Anything that auto-runs on real hardware, skips validation, or skips explicit
   user confirmation before execution conflicts with the brief's safety language.
4. **Is this scoped to our 3 primary devices, or does it require deep support for
   devices we deliberately did not go deep on?** If a feature only makes sense with
   full spec/SCPI support for HMF2550, ZNLE6, or 7352A, it's out of scope unless we
   explicitly decide to extend our primary set.
5. **Is this frontend-appropriate right now, or does it require real backend logic
   (real validation, real state tracking, real SCPI interpretation) that doesn't
   exist yet?** Mock/simulated versions of backend-dependent features are fine;
   pretending a frontend-only feature does real validation is not — it must be
   clearly a placeholder structured to swap in real data later.

If a requested feature fails one of these checks, say so plainly, explain which rule
it conflicts with, and propose the simplest version of the idea that *would* pass —
don't just refuse it outright.

---

## Out of Scope (explicitly, do not build unless revisited)

- Augmented Reality overlays (different track)
- Voice input (planned for later, not part of tonight's or tomorrow's core build —
  only reserve a UI slot for it)
- Full SCPI/spec depth for HMF2550, ZNLE6, 7352A
- Real hardware execution as a dependency of the core demo (stretch only, FPC1500
  only, if time allows)
- Adaptive learning / competency tracking (different track)
- Waveform anomaly detection / fault classification (different track)
