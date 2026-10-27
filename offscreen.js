/**
 * OhTalkU offscreen document: mic capture, noise gate, utterance segmentation,
 * and on-device Whisper transcription (via whisper-worker).
 *
 * The gate is a real audio gate: samples are only kept while the level is at or
 * above the threshold (plus a short pre-roll and hangover so words aren't clipped).
 * Each finished utterance is transcribed locally; quiet audio never reaches Whisper.
 */

const SAMPLE_RATE = 16000;        // Whisper's native rate
const FRAME = 512;                // samples per gate frame (32 ms)
const PREROLL_FRAMES = 8;         // ~256 ms kept before the gate opens
const HANG_FRAMES = 22;           // ~700 ms of quiet ends an utterance
const TAIL_FRAMES = 4;            // quiet frames kept at the end
const MIN_SPEECH_FRAMES = 6;      // ~190 ms of loud audio needed to bother transcribing
const MAX_FRAMES = 450;           // ~14 s hard cap per utterance

const LANG_NAMES = {
  en: 'english', es: 'spanish', fr: 'french', de: 'german',
  pt: 'portuguese', ko: 'korean', zh: 'chinese'
};
const HALLUCINATIONS = /^(\.+|you|thank you\.?|thanks for watching\.?|bye\.?|\[.*\]|\(.*\))$/i;

let threshold = 0.02;
let lang = 'en-US';
let running = false;
let ctx, stream, node, sink, worker;
let modelReady = false;
let lastModelStatus = { type: 'model', state: 'idle' };
let nextId = 1;

const ports = new Set();
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'levels') return;
  ports.add(port);
  port.postMessage(lastModelStatus);
  port.onDisconnect.addListener(() => ports.delete(port));
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;
  if (msg.type === 'start') start(msg);
  if (msg.type === 'stop') stop();
  if (msg.type === 'threshold') threshold = msg.value;
  if (msg.type === 'language') lang = msg.value;
});

function report(level, message) {
  chrome.runtime.sendMessage({ type: 'status', level, message }).catch(() => {});
}
function setModelStatus(s) {
  lastModelStatus = { type: 'model', ...s };
  for (const p of ports) p.postMessage(lastModelStatus);
}

/* ---------- Whisper worker ---------- */
function startWorker(model) {
  modelReady = false;
  setModelStatus({ state: 'loading', progress: 0 });
  worker = new Worker('lib/whisper-worker.js', { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') setModelStatus({ state: 'loading', progress: m.progress });
    if (m.type === 'ready') { modelReady = true; setModelStatus({ state: 'ready' }); }
    if (m.type === 'error') {
      setModelStatus({ state: 'error', message: m.message });
      report('fatal', 'Could not load the speech model: ' + m.message);
    }
    if (m.type === 'result') onResult(m);
  };
  worker.onerror = (e) => report('fatal', 'Speech worker crashed: ' + (e.message || 'unknown error'));
  worker.postMessage({ type: 'init', model, wasmBase: chrome.runtime.getURL('lib/') });
}

function onResult({ text, error }) {
  if (error) return report('error', 'Transcription failed: ' + error);
  const clean = text.trim();
  if (!clean || HALLUCINATIONS.test(clean)) return;
  chrome.runtime.sendMessage({ type: 'final-transcript', text: clean }).catch(() => {});
}

/* ---------- gate + segmentation ---------- */
const preroll = [];
let utterance = null; // { frames: Float32Array[], loud: number, quiet: number }
let frameBuf = new Float32Array(FRAME);
let framePos = 0;

function onBlock(block) {
  let i = 0;
  while (i < block.length) {
    const n = Math.min(FRAME - framePos, block.length - i);
    frameBuf.set(block.subarray(i, i + n), framePos);
    framePos += n; i += n;
    if (framePos === FRAME) {
      onFrame(frameBuf);
      frameBuf = new Float32Array(FRAME);
      framePos = 0;
    }
  }
}

function onFrame(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  const rms = Math.sqrt(sum / frame.length);
  const open = rms >= threshold;
  for (const p of ports) p.postMessage({ rms, open });

  if (!utterance) {
    preroll.push(frame);
    if (preroll.length > PREROLL_FRAMES) preroll.shift();
    if (open) {
      utterance = { frames: [...preroll], loud: 1, quiet: 0 };
      preroll.length = 0;
    }
    return;
  }
  utterance.frames.push(frame);
  if (open) { utterance.loud++; utterance.quiet = 0; } else { utterance.quiet++; }
  if (utterance.quiet >= HANG_FRAMES || utterance.frames.length >= MAX_FRAMES) finishUtterance();
}

function finishUtterance() {
  const u = utterance;
  utterance = null;
  if (u.loud < MIN_SPEECH_FRAMES || !modelReady) return;
  const keep = u.frames.length - Math.max(u.quiet - TAIL_FRAMES, 0);
  const audio = new Float32Array(keep * FRAME);
  for (let i = 0; i < keep; i++) audio.set(u.frames[i], i * FRAME);
  const language = LANG_NAMES[lang.split('-')[0]] || 'english';
  worker.postMessage({ type: 'transcribe', id: nextId++, audio, language }, [audio.buffer]);
}

/* ---------- lifecycle ---------- */
async function start({ threshold: t, lang: l, model }) {
  if (running) return;
  threshold = t ?? threshold;
  lang = l ?? lang;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }
    });
  } catch (err) {
    return report('fatal', 'Microphone unavailable: ' + err.name);
  }
  ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  await ctx.audioWorklet.addModule('audio-processor.js');
  const source = ctx.createMediaStreamSource(stream);
  node = new AudioWorkletNode(ctx, 'capture');
  node.port.onmessage = (e) => onBlock(e.data);
  sink = ctx.createGain();       // muted output keeps the worklet running
  sink.gain.value = 0;
  source.connect(node).connect(sink).connect(ctx.destination);
  running = true;
  startWorker(model || 'Xenova/whisper-tiny');
}

function stop() {
  running = false;
  if (worker) { worker.terminate(); worker = null; }
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (ctx) ctx.close();
  stream = ctx = node = sink = null;
  utterance = null; preroll.length = 0; framePos = 0;
  setModelStatus({ state: 'idle' });
}
