/**
 * OhTalkU offscreen document: mic capture, RMS noise gate, speech recognition.
 *
 * The Web Speech API opens its own mic stream, so audio can't be literally
 * muted below the threshold. Instead the gate is applied to results: a
 * transcript is only forwarded if the gate opened at least once while it was
 * being spoken. Noise that never crosses the threshold is dropped.
 */

let threshold = 0.02;
let lang = 'en-US';
let running = false;
let ctx, stream, analyser, buf, timer, rec;
let gateOpenSinceFinal = false;
const ports = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'levels') return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;
  if (msg.type === 'start') start(msg);
  if (msg.type === 'stop') stop();
  if (msg.type === 'threshold') threshold = msg.value;
  if (msg.type === 'language') {
    lang = msg.value;
    if (rec) rec.stop(); // onend restarts with the new language
  }
});

function report(level, message) {
  chrome.runtime.sendMessage({ type: 'status', level, message }).catch(() => {});
}

async function start({ threshold: t, lang: l }) {
  if (running) return;
  threshold = t ?? threshold;
  lang = l ?? lang;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }
    });
  } catch (err) {
    report('fatal', 'Microphone unavailable: ' + err.name);
    return;
  }
  ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  buf = new Float32Array(analyser.fftSize);
  running = true;
  timer = setInterval(tick, 1000 / 60);
  startRecognition();
}

function tick() {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  const open = rms >= threshold;
  if (open) gateOpenSinceFinal = true;
  for (const p of ports) p.postMessage({ rms, open });
}

function startRecognition() {
  const SR = self.webkitSpeechRecognition;
  if (!SR) return report('fatal', 'Speech recognition is not available in this browser.');
  rec = new SR();
  rec.continuous = true;
  rec.interimResults = false;
  rec.lang = lang;
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (!e.results[i].isFinal) continue;
      const text = e.results[i][0].transcript.trim();
      if (text && gateOpenSinceFinal) {
        chrome.runtime.sendMessage({ type: 'final-transcript', text }).catch(() => {});
      }
      gateOpenSinceFinal = false;
    }
  };
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    report('error', 'Speech recognition error: ' + e.error);
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      report('fatal', 'Speech recognition was blocked (' + e.error + ').');
    }
  };
  rec.onend = () => {
    if (running) setTimeout(() => { try { startRecognition(); } catch {} }, 250);
  };
  try { rec.start(); } catch (err) { report('error', err.message); }
}

function stop() {
  running = false;
  clearInterval(timer);
  if (rec) { rec.onend = null; try { rec.abort(); } catch {} rec = null; }
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (ctx) ctx.close();
  stream = ctx = analyser = null;
}
