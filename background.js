/**
 * OhTalkU background service worker.
 * - Opens the side panel when the toolbar icon is clicked.
 * - Creates/destroys the offscreen document that owns the mic.
 * - Translates final transcripts and hands them to the content script.
 */

const DEFAULTS = {
  noiseThreshold: 0.02,
  selectedEmoji: '🤖',
  customSelector: '',
  sourceLanguage: 'en-US',
  targetLanguage: 'ja',
  autoSend: false,
  micOn: false
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  await chrome.storage.local.set({ ...DEFAULTS, ...current, micOn: false });
});
chrome.runtime.onStartup.addListener(() => chrome.storage.local.set({ micOn: false }));
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

async function hasOffscreen() {
  const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return ctx.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Continuous microphone capture, noise gate and speech recognition.'
  });
}

async function translate(text, target) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
    encodeURIComponent(target) + '&dt=t&q=' + encodeURIComponent(text);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Translate HTTP ' + res.status);
  const data = await res.json();
  return data[0].map((seg) => seg[0]).join('');
}

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return null;
  try {
    return await Promise.race([
      chrome.tabs.sendMessage(tab.id, message),
      new Promise((resolve) => setTimeout(() => resolve(null), 1500))
    ]);
  } catch {
    return null;
  }
}

async function handleTranscript(text) {
  const cfg = await chrome.storage.local.get(DEFAULTS);
  try {
    const translated = await translate(text, cfg.targetLanguage);
    const output = cfg.selectedEmoji ? `${cfg.selectedEmoji} ${translated}` : translated;
    const result = await sendToActiveTab({ type: 'inject', text: output, autoSend: cfg.autoSend });
    chrome.runtime.sendMessage({
      type: 'log', original: text, output, injected: !!(result && result.ok)
    }).catch(() => {});
  } catch (err) {
    chrome.runtime.sendMessage({ type: 'status', level: 'error', message: 'Translation failed: ' + err.message }).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'start-mic':
      (async () => {
        try {
          await ensureOffscreen();
          const cfg = await chrome.storage.local.get(DEFAULTS);
          await chrome.runtime.sendMessage({
            target: 'offscreen', type: 'start',
            threshold: cfg.noiseThreshold, lang: cfg.sourceLanguage
          });
          await chrome.storage.local.set({ micOn: true });
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true;
    case 'stop-mic':
      (async () => {
        if (await hasOffscreen()) {
          await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' }).catch(() => {});
          await chrome.offscreen.closeDocument().catch(() => {});
        }
        await chrome.storage.local.set({ micOn: false });
        sendResponse({ ok: true });
      })();
      return true;
    case 'final-transcript':
      handleTranscript(msg.text);
      return false;
  }
  return false;
});
