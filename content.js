/**
 * OhTalkU content script: finds the chat input and injects text into it.
 * Runs in all frames (YouTube live chat lives in an iframe) and only answers
 * from frames that actually contain a chat input.
 */

const PLATFORMS = [
  { name: 'YouTube Live', selectors: ['#input.yt-live-chat-text-input-field-element', 'yt-live-chat-text-input-field-element #input'] },
  { name: 'Twitch', selectors: ['div[data-a-target="chat-input"]', 'textarea[data-a-target="chat-input"]'] },
  { name: 'Niconico', selectors: ['.ChatInput-textarea', 'textarea[class*="ChatInput"]'] }
];

let customSelector = '';
let lastEditable = null;

chrome.storage.local.get('customSelector').then((v) => { customSelector = v.customSelector || ''; });
chrome.storage.onChanged.addListener((changes) => {
  if ('customSelector' in changes) customSelector = changes.customSelector.newValue || '';
});

function isEditable(el) {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

document.addEventListener('focusin', (e) => { if (isEditable(e.target)) lastEditable = e.target; }, true);

function describe(el) {
  if (el.id) return '#' + el.id;
  const cls = [...el.classList].slice(0, 2).map((c) => '.' + c).join('');
  return el.tagName.toLowerCase() + cls;
}

function findTarget() {
  if (customSelector) {
    try {
      const el = document.querySelector(customSelector);
      if (el) return { el, selector: customSelector, platform: 'Custom selector' };
    } catch { /* invalid selector: fall through to autodetect */ }
  }
  for (const p of PLATFORMS) {
    for (const selector of p.selectors) {
      const el = document.querySelector(selector);
      if (el) return { el, selector, platform: p.name };
    }
  }
  const active = isEditable(document.activeElement) ? document.activeElement : lastEditable;
  if (active && document.contains(active)) {
    return { el: active, selector: describe(active), platform: 'Focused field' };
  }
  return null;
}

function fireInput(el, text) {
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function inject(el, text) {
  el.focus();
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    // Use the native setter so React/Vue value trackers see the change.
    const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
    fireInput(el, text);
    return;
  }
  // contenteditable: execCommand works with editors like Twitch's; fall back to direct write.
  const sel = getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
  const ok = document.execCommand('insertText', false, text);
  if (!ok || !(el.textContent || '').includes(text)) {
    el.textContent = text;
    fireInput(el, text);
  }
}

function pressEnter(el) {
  for (const type of ['keydown', 'keypress', 'keyup']) {
    el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'detect' && msg.type !== 'inject') return false;
  const target = findTarget();
  if (!target) return false; // let a frame that has the chat box answer
  if (msg.type === 'detect') {
    sendResponse({ found: true, platform: target.platform, selector: target.selector });
  } else {
    inject(target.el, msg.text);
    if (msg.autoSend) setTimeout(() => pressEnter(target.el), 50);
    sendResponse({ ok: true });
  }
  return false;
});
