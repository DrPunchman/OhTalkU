# Engineering Specification: Live Chat Voice Translator Extension & Overlay

## 1. Executive Summary

This document specifies the technical architecture, UI/UX design, and component requirements for **OhTalkU**, a browser extension (Google Chrome / Chromium-based browsers) designed to capture microphone input, filter out background noise via an adjustable audio gate, perform speech-to-text and translation into Japanese, and automatically inject the translated text (prefixed with a customizable emoji) into live chat windows across YouTube, Twitch, and Niconico.

## 2. Platform & Architecture Selection

**Recommended Platform:** Chrome Extension (Manifest V3)

**Why Extension over Desktop App:** Direct access to the DOM of live chat pages makes text injection instantaneous and reliable. Desktop apps require complex OS Accessibility APIs (CGEvent / AXUIElement on macOS) to simulate keyboard strokes, which is prone to focus loss and permission friction.

**Architecture Pattern:** Chrome Extension Manifest V3 using an **Offscreen Document** (for continuous background audio processing) and a **Side Panel** (for UI controls, audio visualizer, and settings).



┌────────────────────────────────────────────────────────────────────────┐
│                        CHROME EXTENSION (MV3)                          │
│                                                                        │
│   ┌──────────────────┐    Audio Data    ┌──────────────────────────┐   │
│   │  Offscreen Doc   │─────────────────>│    Side Panel (UI)       │   │
│   │ (Web Audio API / │                  │ - Real-time Visualizer   │   │
│   │ Noise Gate / STT)│<─────────────────│ - Threshold Slider       │   │
│   └────────┬─────────┘   Thresholds     │ - Selector / Emoji Picker│   │
│            │ Translated                 └──────────────────────────┘   │
│            │ Text String                                               │
│            v                                                           │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                         Content Script                         │   │
│   │ - DOM Autodetect / Selector Override                           │   │
│   │ - Injects: "[Emoji] [Japanese Translation]" into Chat Box      │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘

## 3. Component Breakdown & Functional Specifications

### 3.1 Audio Processing Module (Noise Gate & Visualizer)

**Audio Input:** Intercepts microphone stream using `navigator.mediaDevices.getUserMedia({ audio: true })`.

**DSP Processing:**
- Uses `AudioContext` and `AnalyserNode` to compute Real-Time RMS (Root Mean Square) volume amplitude and FFT frequency data.
- Compares current frame amplitude against a user-defined threshold value $T \in [0.00, 1.00]$.

**Gate Logic:**
- If RMS amplitude $< T$, buffer is muted/discarded.
- If RMS amplitude $\ge T$, speech buffer is passed to the Speech-to-Text engine.

**UI Controls & Visualizer:**
- **Soundprint Visualizer:** Canvas element rendering continuous time-domain waveforms or frequency bars (60 FPS).
- **Threshold Line:** Interactive or overlaid horizontal/vertical line on the canvas reflecting current gate level.
- **Threshold Slider:** Ranges from `0.001` (sensitive) to `0.100` (aggressive cutoff).
- **Preset Buttons:**
  - **Low Noise:** Sets threshold to `0.005` (Quiet room, high sensitivity).
  - **High Noise:** Sets threshold to `0.035` (Fan/keyboard noise present).

### 3.2 Speech-to-Text & Translation Engine

**STT Pipeline:** Web Speech API (`webkitSpeechRecognition`) running in continuous mode, set to user's native language (e.g., `en-US`).

**Translation Pipeline:**
- **Primary:** Chrome Built-in On-Device Translation API (`window.ai.translator` / Chrome Built-in AI) or external API (DeepL / Google Translate REST API).
- **Target Language:** Japanese (`ja`).

**Formatting Engine:**
- Outputs: `${emojiPrefix} ${translatedText}`.
- If `emojiPrefix` is empty, outputs `${translatedText}` directly.

### 3.3 DOM Autodetect & Chat Injection Engine

**Detection Matrix:** Automatically scans active tab DOM for matching chat input elements:

| Platform        | Selectors                                                                                        |
|---              |---                                                                                               |
| YouTube Live    |  `#input.yt-live-chat-text-input-field-element`, `yt-live-chat-text-input-field-element #input`  |
| Twitch          |  `div[data-a-target="chat-input"]`, `textarea[data-a-target="chat-input"]`                       |
| Niconico        |  `.ChatInput-textarea`, `textarea[class*="ChatInput"]`                                           |
| Fallback        |  `document.activeElement` (if focused in an input/textarea/contenteditable)                      |

**Manual Override Input:** Text box in extension UI displaying current detected CSS selector, allowing manual editing (e.g., `#custom-chat-box`).

**Text Injection Logic:**
- Locates element by selector.
- Sets `value` (for `<input>` / `<textarea>`) or `innerText`/`textContent` (for contenteditable `<div>`).
- Dispatches native browser events (`InputEvent`, `ChangeEvent`) to notify React/Vue/Angular state handlers on target sites.

### 3.4 Storage & Configuration

Persists settings in `chrome.storage.local`:
- `noiseThreshold` (number)
- `selectedEmoji` (string, default: `🤖`)
- `customSelector` (string)
- `sourceLanguage` (string, default: `en-US`)
- `targetLanguage` (string, default: `ja`)

## 4. UI / UX Design Specifications


## 4. UI / UX Design Specifications
+-------------------------------------------------------+
|  OhTalkU                                   [  ]  |
+-------------------------------------------------------+
| AUDIO NOISE GATE                                      |
| +---------------------------------------------------+ |
| | ~~~~~/\~~/\~~~~~~~~~~~~~~~~~~~~~~~ (Soundprint)   | |
| |----------------------------------- [Threshold Line] |
| +---------------------------------------------------+ |
| [ Low Preset ]   [ High Preset ]                      |
| Threshold: [========|-----------------] 0.025         |
+-------------------------------------------------------+
| EMOJI PREFIX                                          |
| Prefix: [ 🤖 ] [ Change Emoji ] [ Clear ]             |
+-------------------------------------------------------+
| CHAT TARGET DETECTOR                                  |
| Status: ● Connected (YouTube Live)                    |
| Selector Override:                                    |
| [ #input.yt-live-chat-text-input-field-element      ] |
+-------------------------------------------------------+
| TRANSLATION LOG                                       |
| [14:02] 🤖 こんにちは、みんな！                          |
+-------------------------------------------------------+
| [ O MIC ON ]                                          |
+-------------------------------------------------------+

## AI Developer Prompt

   Copy and paste the prompt below into an AI coding assistant (Cursor, Claude 3.5 Sonnet, or ChatGPT) to generate the complete repository codebase:

You are an expert browser extension developer specializing in Chrome Manifest V3, Web Audio API, Web Speech API, and DOM manipulation. Build a production-ready Chrome Extension (Manifest V3) called "OhTalkU" that captures microphone audio, filters background noise, transcribes and translates speech into Japanese, and injects the formatted output into live chat boxes.

### Project Architecture & File Structure
Create the following files with clean, modular, and documented code:
- manifest.json (Manifest V3)
- offscreen.html & offscreen.js (Web Audio API noise gate, audio processing, Web Speech API)
- sidepanel.html, sidepanel.js, sidepanel.css (Control panel UI, Audio Visualizer, settings)
- content.js (DOM Inspector, selector override runner, chat input injector)
- background.js (Service worker managing extension lifecycle, offscreen document creation, and messaging)

### Technical & Functional Requirements

1. AUDIO NOISE GATE & SOUNDPRINT VISUALIZER (offscreen.js + sidepanel.js)
   - Capture mic input via `getUserMedia`.
   - Implement an AudioContext with AnalyserNode to calculate real-time RMS audio level.
   - Draw a live 60fps canvas waveform/soundprint in sidepanel.html showing audio amplitude over time.
   - Overlay a horizontal threshold line on the canvas that moves when the threshold slider changes.
   - Filter logic: Audio below threshold must be dropped/ignored. Audio above threshold triggers Speech Recognition.
   - UI Controls in Side Panel:
     - Range slider for noise threshold (`0.001` to `0.100`).
     - "Low Noise" preset button (sets threshold to 0.005).
     - "High Noise" preset button (sets threshold to 0.035).

2. SPEECH RECOGNITION & TRANSLATION
   - Use `webkitSpeechRecognition` to transcribe continuous English speech (`en-US`).
   - Use DeepL API or Google Translate free endpoint (`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ja&dt=t&q=...`) to convert transcribed text to Japanese.
   - Prepend an emoji prefix to the translated output string.

3. EMOJI SELECTOR UI
   - Default emoji: "🤖".
   - UI must include an emoji picker trigger (or native HTML emoji selector/dropdown with common icons: 
   🤖,💬,💭,🎮,🎙️,💩,👽,🤬,🤓,👺,🦊,🐶,🐱,🐭,🐹,🐰,🐨,🐯,🦁,🐮,🐷,🐻,🐸,🦄,🗿,💀,🍻, 
   or empty string "").
   - Include a "Clear Emoji" button to set prefix to empty.

4. CHAT INPUT AUTODETECTION & OVERRIDE INJECTOR (content.js)
   - Implement autodetect selectors for target sites:
     - Twitch: `div[data-a-target="chat-input"]`, `textarea[data-a-target="chat-input"]`
     - YouTube Live: `#input.yt-live-chat-text-input-field-element`
     - Niconico: `.ChatInput-textarea`, `textarea[class*="ChatInput"]`
     - Fallback: `document.activeElement`
   - Provide a text input field in the side panel showing the active selector.
   - Allow user to manually type/overwrite the CSS selector in the text field.
   - Injected text format: `${emoji} ${translatedText}`.
   - Properly trigger `InputEvent` and `ChangeEvent` on the DOM node so framework event listeners (React/Vue) detect the new value.

5. STATE PERSISTENCE
   - Save noise threshold, selected emoji, custom selector, and mic state in `chrome.storage.local`.

Please write the full, runnable code for all files listed in the file structure above.