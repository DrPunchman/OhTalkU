/**
 * Whisper speech-to-text worker. Runs fully on-device via transformers.js
 * (ONNX Runtime WebAssembly). Model weights are downloaded once from Hugging Face
 * and cached by the browser; no audio ever leaves the machine.
 */
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

let asr = null;
let queue = Promise.resolve();

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') init(m);
  if (m.type === 'transcribe') queue = queue.then(() => run(m));
};

async function init({ model, wasmBase }) {
  env.backends.onnx.wasm.wasmPaths = wasmBase;
  env.backends.onnx.wasm.numThreads = 1; // multi-thread needs cross-origin isolation
  const files = {};
  try {
    asr = await pipeline('automatic-speech-recognition', model, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p) => {
        if (p.status !== 'progress' || !p.total) return;
        files[p.file] = { loaded: p.loaded, total: p.total };
        let loaded = 0, total = 0;
        for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
        self.postMessage({ type: 'progress', progress: loaded / total });
      }
    });
    self.postMessage({ type: 'ready' });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message ? err.message : err) });
  }
}

async function run({ id, audio, language }) {
  if (!asr) return self.postMessage({ type: 'result', id, text: '' });
  try {
    const out = await asr(audio, { language, task: 'transcribe' });
    self.postMessage({ type: 'result', id, text: (out.text || '').trim() });
  } catch (err) {
    self.postMessage({ type: 'result', id, text: '', error: String(err && err.message ? err.message : err) });
  }
}
