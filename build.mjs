// Bundles the Whisper worker and copies the ONNX Runtime WebAssembly files into lib/.
// Everything runs from the extension package: no remotely hosted code (Chrome Web Store rule).
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('lib', { recursive: true });

await build({
  entryPoints: ['src/whisper-worker.js'],
  outfile: 'lib/whisper-worker.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome116',
  minify: true,
  legalComments: 'none'
});

const dist = 'node_modules/@huggingface/transformers/dist/';
for (const f of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
  copyFileSync(dist + f, 'lib/' + f);
}
console.log('Built lib/');
