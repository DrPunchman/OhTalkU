// Creates ohtalku-extension.zip containing only the files the extension needs.
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
rmSync('ohtalku-extension.zip', { force: true });
execSync(
  'zip -r ohtalku-extension.zip manifest.json background.js content.js offscreen.html offscreen.js languages.js ' +
  'audio-processor.js sidepanel.html sidepanel.js sidepanel.css permission.html permission.js lib flags',
  { stdio: 'inherit' }
);
