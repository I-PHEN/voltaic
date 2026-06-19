# Voltaic — Demo Guide

AI-assisted Rohde & Schwarz instrumentation workflow builder. Describe a measurement in
plain English (or by voice) → Voltaic places and configures the right instruments, validates
them against hardware limits, answers your questions, and generates a runnable Python/SCPI
script with a checklist.

---

## ▶️ Run it

```bash
npm install
# copy .env.example -> .env and add your GROQ_API_KEY
npm run dev
```
Open the URL it prints (usually **http://localhost:5173** or **5174**).

---

## 🎬 Demo flow (run in order — tells a story, hits every feature)

1. **`Set up a bench to measure the signal-to-noise ratio of an RF amplifier operating at 850 MHz`**
   → Places **NGE100** (supply) + **FPC1500** (analyzer), with the analyzer centered at **850 MHz** — parsed from your words.

2. **`Why isn't the power supply wired into the spectrum analyzer?`**
   → A real engineering answer (the supply biases the amplifier, it's not in the signal path). *It remembers the bench and reasons about it — not a script.*

3. **`Actually, raise the supply to 15 volts and set the analyzer span to 50 MHz`**
   → Edits in place, preserving everything else. *Memory + conversational editing.*

4. **`Is 15 volts safe for this supply?`**
   → Answers from the hardware limits (yes — under the 32 V max).

5. Click **Validate** → all parameters within limits.

6. Click **Generate Script** → real **Python / PyVISA + SCPI**, a pre-flight checklist, and design rationale.

7. **Run** the execution terminal → replays the SCPI command/response sequence.

8. *(Optional)* Tap the **mic** and **speak** your next request — transcribed by Groq Whisper.

---

## 🧪 Test-prompt bank (to really probe it)

### Building (natural-language → configured bench)
- `Set up a bench to measure the SNR of an RF amplifier operating at 850 MHz`
- `Characterize a 47 kHz signal at 3 volts peak-to-peak on the oscilloscope`
- `Power a sensor board at 3.3 V with a half-amp current limit and watch its rail on the scope`
- `Drive a 10 MHz sine wave into the oscilloscope`  *(MHz on the generator now converts correctly)*
- `Power an amplifier at 12 V, inject a 20 kHz sine, and capture both its spectrum and its waveform`  *(builds all four instruments)*

### Safety / hardware limits (a scoring criterion — show this off)
- `Drive my circuit with 48 volts from the power supply` → clamps to **32 V**
- `Show me the spectrum of a 2.4 GHz signal with a 100 MHz span` → clamps to **1500 MHz**
- `Set the supply current limit to 10 amps` → clamps to **3 A**

### Conversational depth (the differentiator)
- `What's the practical difference between center frequency and span on a spectrum analyzer?`
- `Which of these instruments would I use to measure total harmonic distortion, and why?`
- `My signal looks clipped on the scope — what setting should I adjust first?`
- `Why does the reference level matter when measuring a weak RF signal?`

### Incremental edits (natural flow)
- `Add a spectrum analyzer so I can also check for harmonics`
- `Lower the timebase so I can see individual cycles`
- `Bump the supply to 5 volts and tighten the current limit to 1 amp`

### Robustness / edge cases
- `Thanks, that's exactly what I needed!` → friendly close, canvas untouched
- `Can you make me a coffee?` → polite redirect, no instruments fabricated
- `hey` (after a build) → greets without wiping your bench

---

## 💡 What to expect (talking points)

- **Real parameter parsing** — the numbers in your sentence land on the right instrument in the right unit.
- **Safety clamping** — out-of-range values are pulled to the hardware limit, and the summary tells you ("Safety adjustments: 2400 MHz → 1500 MHz").
- **Build vs. answer** — instructions ("measure…", "set up…") build the bench; questions ("why/what/which") are answered in chat with the canvas left alone.
- **Memory + canvas-awareness** — follow-ups understand what's already on the bench.
- **Resilience** — if the AI is briefly rate-limited it retries, then falls back gracefully with an honest note. A demo can't hard-crash.
- **Plannable instruments:** NGE100 (power supply), FPC1500 (spectrum analyzer), RTB24 (oscilloscope), HMF2550 (function generator).

---

## ⚙️ Under the hood (if asked)
- **Planner:** Groq `gpt-oss-120b` via an OpenAI-compatible API, behind a Vite dev proxy (key stays server-side). Provider-swappable to Claude with one env change.
- **Voice:** Groq `whisper-large-v3-turbo`.
- **Script:** deterministic PyVISA/SCPI generation — the model plans, the template compiles, so the Python is always valid.
